import { chatCompletion, type LlmConfig } from './llmClient'
import { guardArticleRewrite } from './articleRewriteGuard'
import { isAbortError } from './articleRunRegistry'
import { calibrateArticleLengthBySection } from './articleLengthPatch'
import {
  buildDeleteOnlyPatchSystemPrompt,
  patchOptionsForAction,
  resolveOptimizePatch
} from './optimizePatch'
import { getArticleLengthBounds, countArticleWords } from './articleLength'
import type { GenerateProgressEvent } from './articleAgent'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'
import type { LengthWorkbenchState } from '../../shared/lengthWorkbench'
import type { ArticleType } from '../../shared/domainPacks'

import {
  OPTIMIZE_LENGTH_SKIP_MAX,
  OPTIMIZE_LENGTH_SKIP_MIN,
  resolveOptimizeQualityShorten,
  shouldSkipOptimizeLengthAdjust
} from './optimizeStructure'

interface ArticleLanguageContext {
  lock: string
  label: string
}

interface WordCountBounds {
  min: number
  max: number
  label: string
}

export interface WordCountEnforcementResult {
  article: string
  workbench: LengthWorkbenchState
}

/**
 * Full-article length rewrites often stop at Part 1. Never replace a complete
 * draft with a truncated continuation — restore missing sections or keep the
 * original text.
 */
export function acceptLengthAdjustedMarkdown(
  previous: string,
  next: string,
  finishReason?: string
): { article: string; discarded: boolean; recovered: boolean; reason?: string } {
  return guardArticleRewrite(previous, next, finishReason)
}

export async function enforceArticleWordCount(
  llm: LlmConfig,
  article: string,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  maxTokens: number | undefined,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void,
  skillsText?: string,
  enabledSkillIds?: string[],
  format?: ArticleType
): Promise<WordCountEnforcementResult> {
  const bounds = getArticleLengthBounds(skillsText, enabledSkillIds, format)
  const result = await calibrateArticleLengthBySection({
    llm,
    article,
    topicLabel,
    articleLang,
    bounds: { min: bounds.min, max: bounds.max, label: bounds.label },
    maxTokens,
    emit
  })
  if (result.article.trim() !== article.trim()) {
    onChunk(result.article)
  }
  return result
}

export async function enforceOptimizeArticleWordCount(
  llm: LlmConfig,
  article: string,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  bounds: WordCountBounds,
  sourceMarkdown: string,
  maxTokens: number | undefined,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void,
  options?: { audit?: string }
): Promise<string> {
  const trimmed = normalizeArticleMarkdown(article.trim())
  const count = countArticleWords(trimmed)
  const sourceWords = countArticleWords(sourceMarkdown)

  if (shouldSkipOptimizeLengthAdjust(count)) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：程序计数 ${count} 词，已在 ${OPTIMIZE_LENGTH_SKIP_MIN}–${OPTIMIZE_LENGTH_SKIP_MAX} 区间内，跳过校准`
    })
    return trimmed
  }

  const qualityShorten = resolveOptimizeQualityShorten({
    sourceWords,
    articleWords: count,
    bounds,
    audit: options?.audit
  })

  if (qualityShorten.allowBelowMin) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：${qualityShorten.reason}`
    })
    if (count <= bounds.max) {
      return trimmed
    }
  }

  if (count < bounds.min) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：程序计数 ${count} 词，低于 ${bounds.min}，不扩写全文`
    })
    return trimmed
  }

  if (count <= bounds.max) return trimmed

  emit({
    type: 'status',
    step: 'length',
    message: `⑨ 词数校准：程序计数 ${count} 词，高于 ${bounds.max}，仅删除重复句…`
  })

  let patchError = ''
  const raw = await chatCompletion(
    llm,
    [
      { role: 'system', content: `${buildDeleteOnlyPatchSystemPrompt()}\n\n${articleLang.lock}` },
      {
        role: 'user',
        content: [
          `主题/页面：${topicLabel}`,
          `程序计词结果：${count} words，上限 ${bounds.max}。`,
          '只删除重复或低价值原句，使全文靠近上限。不要改标题，不要重写。',
          '',
          trimmed
        ].join('\n')
      }
    ],
    {
      temperature: 0.2,
      jsonObject: true,
      maxTokens: Math.min(4096, maxTokens ?? 4096),
      step: 'length',
      label: '词数删减补丁'
    }
  ).catch((error: unknown) => {
    if (isAbortError(error)) throw error
    patchError = error instanceof Error ? error.message : '未知错误'
    return null
  })

  if (raw == null) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准调用失败（${patchError || '未知错误'}），已保留校准前正文`
    })
    return trimmed
  }

  const resolved = resolveOptimizePatch(raw, trimmed, patchOptionsForAction('delete_only'))
  if (!resolved.ok) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数仍偏高（${count} 词）：删减补丁未应用（${resolved.error}）`
    })
    return trimmed
  }

  const next = normalizeArticleMarkdown(resolved.text.trim())
  const nextCount = countArticleWords(next)
  onChunk(next)
  if (nextCount > bounds.max) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数仍偏高（${nextCount} 词，上限 ${bounds.max}），已保留删减后的稿件`
    })
  }
  return next
}
