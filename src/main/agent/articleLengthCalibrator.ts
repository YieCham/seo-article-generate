import type { WebContents } from 'electron'
import { getEffectiveConfig, resolveRoutedLlm } from '../config/configStore'
import { maxTokensForFullArticleOutput } from '../config/llmTokenLimits'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext,
  type TokenUsagePipeline
} from '../token/tokenUsageContext'
import { isAbortError } from './articleRunRegistry'
import type { GenerateProgressEvent } from './articleAgent'
import { getArticleLanguageLock } from './topicLanguage'
import { normalizeOutputLanguage } from './outputLanguage'
import { getLanguageLabel } from '../research/localeOptions'
import { countArticleWords, getArticleLengthBounds } from './articleLength'
import { calibrateArticleLengthBySection, type LengthShrinkTarget } from './articleLengthPatch'
import type { ArticleType } from '../../shared/domainPacks'
import type { LengthWorkbenchState } from '../../shared/lengthWorkbench'
import { defaultLengthBounds } from '../../shared/lengthWorkbench'

export interface CalibrateArticleLengthOptions {
  article: string
  topic?: string
  outputLanguage?: string
  pipeline?: TokenUsagePipeline
  articleType?: ArticleType | string
  min?: number
  max?: number
  label?: string
  llmPresetId?: string
  llmModel?: string
  focusShrinks?: LengthShrinkTarget[]
}

function asArticleType(value?: string): ArticleType | undefined {
  if (value === 'how-to' || value === 'top-rank' || value === 'review') return value
  return undefined
}

function resolveBounds(options: CalibrateArticleLengthOptions): {
  min: number
  max: number
  label: string
} {
  if (
    typeof options.min === 'number' &&
    Number.isFinite(options.min) &&
    typeof options.max === 'number' &&
    Number.isFinite(options.max)
  ) {
    return {
      min: Math.round(options.min),
      max: Math.round(options.max),
      label:
        typeof options.label === 'string' && options.label.trim()
          ? options.label
          : `${Math.round(options.min)}–${Math.round(options.max)}`
    }
  }

  const pipeline = options.pipeline === 'create' ? 'create' : 'optimize'
  if (pipeline === 'create') {
    const format = asArticleType(typeof options.articleType === 'string' ? options.articleType : undefined)
    const bounds = getArticleLengthBounds(undefined, undefined, format)
    return { min: bounds.min, max: bounds.max, label: bounds.label }
  }

  return defaultLengthBounds(undefined, pipeline)
}

export async function calibrateArticleLength(
  options: CalibrateArticleLengthOptions,
  sender: WebContents
): Promise<
  | { ok: true; article: string; lengthWorkbench: LengthWorkbenchState }
  | { ok: false; message: string }
> {
  const llmSelection =
    options.llmPresetId && options.llmModel
      ? { presetId: options.llmPresetId, model: options.llmModel }
      : options.llmModel
        ? { presetId: '', model: options.llmModel }
        : null
  const appConfig = await getEffectiveConfig(llmSelection)
  const llm = resolveRoutedLlm(appConfig, 'bodyWork', appConfig.llm)

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const article = options.article?.trim()
  if (!article) {
    return { ok: false, message: '当前没有可校准的文章内容。' }
  }

  const pipeline: TokenUsagePipeline =
    options.pipeline === 'create' || options.pipeline === 'optimize' || options.pipeline === 'batch-optimize'
      ? options.pipeline
      : 'optimize'
  const langCode = normalizeOutputLanguage(options.outputLanguage)
  const articleLang = {
    lock: getArticleLanguageLock(langCode, 'user'),
    label: getLanguageLabel(langCode)
  }
  const bounds = resolveBounds(options)
  const topicLabel = options.topic?.trim() || '当前文章'
  const globalMaxTokens = appConfig.llmMaxTokens

  return runWithTokenContext(createTokenRunContext(pipeline, `词数校准:${topicLabel}`.slice(0, 200)), async () => {
    const emit = (event: GenerateProgressEvent): void => {
      if (event.step) {
        updateTokenUsageContext({ step: event.step, stepLabel: event.message })
      }
      sender.send('article:progress', event)
    }

    try {
      emit({
        type: 'status',
        step: 'length',
        message: `词数校准：程序计数 ${countArticleWords(article)} 词 → 目标 ${bounds.label}…`
      })

      const result = await calibrateArticleLengthBySection({
        llm,
        article,
        topicLabel,
        articleLang,
        bounds,
        maxTokens: maxTokensForFullArticleOutput(countArticleWords(article), globalMaxTokens, 'lengthAdjust'),
        focusShrinks: options.focusShrinks,
        emit
      })

      if (result.article.trim() !== article) {
        emit({ type: 'replace', text: result.article, step: 'length' })
      }
      emit({ type: 'lengthWorkbench', step: 'length', lengthWorkbench: result.workbench })
      emit({ type: 'done' })
      return { ok: true, article: result.article, lengthWorkbench: result.workbench }
    } catch (error) {
      if (isAbortError(error)) {
        emit({ type: 'cancelled', message: '已中止词数校准' })
        return { ok: false, message: '已中止生成' }
      }
      const message = error instanceof Error ? error.message : '词数校准失败'
      emit({ type: 'error', message })
      return { ok: false, message }
    }
  })
}
