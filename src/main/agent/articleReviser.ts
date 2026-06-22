import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import { countArticleWords } from './articleLength'
import { maxTokensForFullArticleOutput, resolveStepMaxTokens } from '../config/llmTokenLimits'
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

export interface ReviseArticleSelection {
  start: number
  end: number
  text: string
}

export interface ReviseArticleOptions {
  article: string
  instruction: string
  outputLanguage?: string
  pipeline?: TokenUsagePipeline
  topic?: string
  selection?: ReviseArticleSelection
}

function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)```$/i)
  return match ? match[1].trim() : trimmed
}

function getContextSnippet(article: string, start: number, end: number, radius = 400): string {
  const before = article.slice(Math.max(0, start - radius), start)
  const after = article.slice(end, Math.min(article.length, end + radius))
  return `${before}[…选中区域…]${after}`
}

function validateSelection(article: string, start: number, end: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '选区位置无效'
  if (start < 0 || end < 0 || start > article.length || end > article.length) return '选区超出文章范围'
  if (start > end) return '选区起始位置无效'
  return null
}

function applySelectionRewrite(article: string, start: number, end: number, fragment: string): string {
  return `${article.slice(0, start)}${fragment}${article.slice(end)}`
}

async function reviseSelectedFragment(
  options: ReviseArticleOptions,
  sender: WebContents,
  article: string,
  selection: ReviseArticleSelection,
  articleLangLabel: string,
  articleLangLock: string,
  globalMaxTokens: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const llm = (await getEffectiveConfig()).llm
  const start = Math.round(selection.start)
  const end = Math.round(selection.end)
  const selectionError = validateSelection(article, start, end)
  if (selectionError) return { ok: false, message: selectionError }

  const selectedText = article.slice(start, end)
  if (!selectedText.trim()) {
    return { ok: false, message: '请先选中要修改的文字。' }
  }

  const instruction = options.instruction.trim()
  const context = getContextSnippet(article, start, end)

  const emit = (event: GenerateProgressEvent): void => {
    if (event.step) {
      updateTokenUsageContext({ step: event.step, stepLabel: event.message })
    }
    sender.send('article:progress', event)
  }

  try {
    throwIfAborted()
    emit({ type: 'status', step: 'draft', message: '正在重写选中片段…' })

    const raw = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是精确的 Markdown 局部编辑助手。',
            articleLangLock,
            '根据修改说明重写用户选中的片段，保持与前后文语气、结构一致；只输出替换后的 Markdown 片段。',
            '不要输出 JSON、不要加「以下是…」等说明；若片段含标题/列表，保持合法 Markdown。'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            options.topic ? `文章主题/上下文：${options.topic}` : '',
            `输出语言：${articleLangLabel}`,
            '',
            '--- 全文（供语境参考）---',
            article.slice(0, 12000),
            article.length > 12000 ? '\n…（下文已截断）' : '',
            '',
            '--- 需要重写的片段 ---',
            selectedText,
            '',
            '--- 局部语境 ---',
            context,
            '',
            `修改说明：${instruction}`,
            '',
            '请输出**替换后的 Markdown 片段**（仅该片段，不要输出整篇文章，不要解释过程）。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      {
        temperature: 0.35,
        maxTokens: resolveStepMaxTokens('sectionEdit', globalMaxTokens),
        step: 'sectionEdit',
        label: '选中片段修订'
      }
    )

    throwIfAborted()

    const fragment = stripOuterCodeFence(raw)
    if (!fragment.trim()) {
      return { ok: false, message: 'AI 未返回有效内容，请调整说明后重试。' }
    }

    const revised = applySelectionRewrite(article, start, end, fragment)
    emit({ type: 'replace', text: revised, step: 'draft' })
    emit({ type: 'done' })
    return { ok: true }
  } catch (error) {
    if (isAbortError(error)) {
      emit({ type: 'cancelled', message: '已中止生成' })
      return { ok: false, message: '已中止生成' }
    }
    const message = error instanceof Error ? error.message : '片段修订失败'
    emit({ type: 'error', message })
    return { ok: false, message }
  }
}

async function reviseFullArticle(
  options: ReviseArticleOptions,
  sender: WebContents,
  article: string,
  articleLangLabel: string,
  articleLangLock: string,
  globalMaxTokens: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const llm = (await getEffectiveConfig()).llm
  const instruction = options.instruction.trim()
  const wordCount = countArticleWords(article)
  const maxTokens = maxTokensForFullArticleOutput(wordCount, globalMaxTokens, 'articleRevise')

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
            '你是 Markdown 文章编辑助手，在原文基础上按说明修改，不是从零创作。',
            articleLangLock,
            '**核心规则（必须遵守）：**',
            '1. 按「修改说明」执行：可**局部改写**、**补充**缺失内容、**删减**过时/不可用/不符合 E-E-A-T 的段落；未提及部分尽量原文保留。',
            '2. 禁止整篇重写、禁止润色未被点名的句子、禁止改变未被要求的结构或章节顺序。',
            '3. 若说明只涉及某一节/段/句，只改那一处；若要求增删模块（如 FAQ、段落），在合适位置执行。',
            '4. 输出完整 Markdown 全文（含未改动的原文复制），不要 diff、不要解释、不要前言。',
            '5. 词数可因补充而略增、因删减而略减，以说明与内容质量为准。'
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
            '--- 当前文章（全文，请在此基础上修改）---',
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
  const globalMaxTokens = appConfig.llmMaxTokens

  return runWithTokenContext(createTokenRunContext(pipeline, instruction.slice(0, 200)), async () => {
    const hasSelection =
      options.selection != null &&
      options.selection.text.trim().length > 0 &&
      options.selection.end > options.selection.start

    if (hasSelection && options.selection) {
      return reviseSelectedFragment(
        options,
        sender,
        article,
        options.selection,
        articleLangLabel,
        articleLangLock,
        globalMaxTokens
      )
    }

    return reviseFullArticle(
      options,
      sender,
      article,
      articleLangLabel,
      articleLangLock,
      globalMaxTokens
    )
  })
}
