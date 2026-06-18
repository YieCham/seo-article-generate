import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import { countArticleWords } from './articleLength'
import { maxTokensForFullArticleOutput } from '../config/llmTokenLimits'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext,
  type TokenUsagePipeline
} from '../token/tokenUsageContext'
import { throwIfAborted } from './abortContext'
import { isAbortError } from './articleRunRegistry'
import type { GenerateProgressEvent } from './articleAgent'
import { chatCompletion } from './llmClient'
import { normalizeOutputLanguage } from './outputLanguage'
import { getArticleLanguageLock } from './topicLanguage'
import { getLanguageLabel } from '../research/localeOptions'

export interface ReviseArticleOptions {
  article: string
  instruction: string
  outputLanguage?: string
  pipeline?: TokenUsagePipeline
}

function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)```$/i)
  return match ? match[1].trim() : trimmed
}

export async function reviseArticle(
  options: ReviseArticleOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const appConfig = await getEffectiveConfig()
  const llm = appConfig.llm

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const article = options.article?.trim()
  if (!article) {
    return { ok: false, message: '当前没有可修改的文章内容。' }
  }

  const instruction = options.instruction?.trim()
  if (!instruction) {
    return { ok: false, message: '请输入修改说明。' }
  }

  const pipeline = options.pipeline === 'optimize' ? 'optimize' : 'create'
  const langCode = normalizeOutputLanguage(options.outputLanguage)
  const articleLangLabel = getLanguageLabel(langCode)
  const articleLangLock = getArticleLanguageLock(langCode, 'user')
  const wordCount = countArticleWords(article)
  const maxTokens = maxTokensForFullArticleOutput(wordCount, appConfig.llmMaxTokens, 'articleRevise')

  return runWithTokenContext(createTokenRunContext(pipeline, instruction.slice(0, 200)), async () => {
    const emit = (event: GenerateProgressEvent): void => {
      if (event.step) {
        updateTokenUsageContext({ step: event.step, stepLabel: event.message })
      }
      sender.send('article:progress', event)
    }

    try {
      throwIfAborted()
      emit({ type: 'status', step: 'draft', message: '正在按你的说明修订文章…' })

      const raw = await chatCompletion(
        llm,
        [
          {
            role: 'system',
            content: [
              '你是 Markdown 文章**局部编辑**助手，不是从零创作的新文章写手。',
              articleLangLock,
              '**核心规则（必须遵守）：**',
              '1. 只对「修改说明」中明确点名的部分做改动；其余段落、标题、列表、表格、FAQ、Meta、[Image: …] 等必须**原文逐字保留**。',
              '2. 禁止整篇重写、禁止润色未被点名的句子、禁止改变未被要求的结构或章节顺序。',
              '3. 若说明只涉及某一节/段/句，只改那一处，其它内容保持与原文一致。',
              '4. 输出完整 Markdown 全文（含未改动的原文复制），不要 diff、不要解释、不要前言。',
              '5. 修订后词数应与原文接近，除非说明要求增删内容。'
            ].join('\n')
          },
          {
            role: 'user',
            content: [
              `输出语言：${articleLangLabel}`,
              `当前词数（约）：${wordCount} English words`,
              '',
              '--- 修改说明 ---',
              instruction,
              '',
              '--- 当前文章（全文，请在此基础上最小改动）---',
              article
            ].join('\n')
          }
        ],
        { temperature: 0.2, maxTokens, step: 'articleRevise', label: '文章修订' }
      )

      throwIfAborted()

      const revised = stripOuterCodeFence(raw)
      if (!revised.trim()) {
        return { ok: false, message: 'AI 未返回有效内容，请调整说明后重试。' }
      }

      emit({ type: 'replace', text: revised, step: 'draft' })
      emit({ type: 'done' })
      return { ok: true }
    } catch (error) {
      if (isAbortError(error)) {
        emit({ type: 'cancelled', message: '已中止生成' })
        return { ok: false, message: '已中止生成' }
      }
      const message = error instanceof Error ? error.message : '文章修订失败'
      emit({ type: 'error', message })
      return { ok: false, message }
    }
  })
}
