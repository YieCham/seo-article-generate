import { getEffectiveConfig } from '../config/configStore'
import { resolveStepMaxTokens } from '../config/llmTokenLimits'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext
} from '../token/tokenUsageContext'
import { getLanguageLabel } from '../research/localeOptions'
import { chatCompletion } from './llmClient'
import { normalizeOutputLanguage } from './outputLanguage'
import { getArticleLanguageLock } from './topicLanguage'

export type SectionEditMode = 'rewrite' | 'insert'

export interface RewriteArticleSectionRequest {
  fullArticle: string
  selectedText: string
  selectionStart: number
  selectionEnd: number
  instruction: string
  mode: SectionEditMode
  topic?: string
  outputLanguage?: string
}

export type RewriteArticleSectionResult =
  | { ok: true; updatedArticle: string }
  | { ok: false; message: string }

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

function applySectionEdit(
  article: string,
  start: number,
  end: number,
  fragment: string,
  mode: SectionEditMode
): string {
  if (mode === 'rewrite') {
    return `${article.slice(0, start)}${fragment}${article.slice(end)}`
  }
  const insertAt = Math.max(0, Math.min(article.length, end))
  const prefix = insertAt > 0 && !/\s$/.test(article.slice(0, insertAt)) && fragment.trim() ? '\n\n' : ''
  const suffix =
    insertAt < article.length && !/^\s/.test(article.slice(insertAt)) && fragment.trim() ? '\n\n' : ''
  return `${article.slice(0, insertAt)}${prefix}${fragment}${suffix}${article.slice(insertAt)}`
}

function validateSelection(article: string, start: number, end: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '选区位置无效'
  if (start < 0 || end < 0 || start > article.length || end > article.length) return '选区超出文章范围'
  if (start > end) return '选区起始位置无效'
  return null
}

export async function rewriteArticleSection(
  request: RewriteArticleSectionRequest
): Promise<RewriteArticleSectionResult> {
  const appConfig = await getEffectiveConfig()
  const llm = appConfig.llm

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在设置中填写 LLM 配置。' }
  }

  const instruction = request.instruction?.trim()
  if (!instruction) {
    return { ok: false, message: '请输入修改指令。' }
  }

  const fullArticle = request.fullArticle ?? ''
  if (!fullArticle.trim()) {
    return { ok: false, message: '文章内容为空。' }
  }

  const start = Math.round(request.selectionStart)
  const end = Math.round(request.selectionEnd)
  const selectionError = validateSelection(fullArticle, start, end)
  if (selectionError) return { ok: false, message: selectionError }

  const selectedText = fullArticle.slice(start, end)
  if (request.mode === 'rewrite' && !selectedText.trim()) {
    return { ok: false, message: '重写模式请先选中要修改的文字。' }
  }

  const langCode = normalizeOutputLanguage(request.outputLanguage)
  const articleLangLabel = getLanguageLabel(langCode)
  const articleLangLock = getArticleLanguageLock(langCode, 'user')
  const context = getContextSnippet(fullArticle, start, end)

  const userPayload =
    request.mode === 'rewrite'
      ? [
          request.topic ? `文章主题/上下文：${request.topic}` : '',
          `输出语言：${articleLangLabel}`,
          '',
          '--- 全文（供语境参考）---',
          fullArticle.slice(0, 12000),
          fullArticle.length > 12000 ? '\n…（下文已截断）' : '',
          '',
          '--- 需要重写的片段 ---',
          selectedText,
          '',
          '--- 局部语境 ---',
          context,
          '',
          `编辑指令：${instruction}`,
          '',
          '请输出**替换后的 Markdown 片段**（仅该片段，不要输出整篇文章，不要解释过程）。'
        ]
          .filter(Boolean)
          .join('\n')
      : [
          request.topic ? `文章主题/上下文：${request.topic}` : '',
          `输出语言：${articleLangLabel}`,
          '',
          '--- 全文（供语境参考）---',
          fullArticle.slice(0, 12000),
          '',
          '--- 插入位置前的内容 ---',
          fullArticle.slice(Math.max(0, start - 800), start) || '（文首）',
          '',
          '--- 插入位置后的内容 ---',
          fullArticle.slice(end, end + 800) || '（文末）',
          selectedText.trim() ? `\n（用户亦选中了附近文字供参考：${selectedText.slice(0, 500)}）` : '',
          '',
          `插入指令：${instruction}`,
          '',
          '请输出**要插入的 Markdown 内容**（仅插入块，不要输出整篇文章，不要解释过程）。'
        ]
          .filter(Boolean)
          .join('\n')

  try {
    return runWithTokenContext(
      createTokenRunContext('sectionEdit', request.topic || '部分重写'),
      async () => {
        updateTokenUsageContext({ step: 'sectionEdit', stepLabel: '部分重写' })

        const raw = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是精确的 Markdown 局部编辑助手。',
            articleLangLock,
            request.mode === 'rewrite'
              ? '根据指令重写用户选中的片段，保持与前后文语气、结构一致；只输出替换后的 Markdown 片段。'
              : '根据指令在指定位置生成应插入的新 Markdown 内容；只输出插入块本身。',
            '不要输出 JSON、不要加「以下是…」等说明；若片段含标题/列表，保持合法 Markdown。'
          ].join('\n')
        },
        { role: 'user', content: userPayload }
      ],
      { temperature: 0.35, maxTokens: resolveStepMaxTokens('sectionEdit', appConfig.llmMaxTokens) }
    )

        const fragment = stripOuterCodeFence(raw)
        if (!fragment.trim()) {
          return { ok: false, message: 'AI 未返回有效内容，请调整指令后重试。' }
        }

        const updatedArticle = applySectionEdit(fullArticle, start, end, fragment, request.mode)
        return { ok: true, updatedArticle }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '局部编辑失败'
    return { ok: false, message }
  }
}
