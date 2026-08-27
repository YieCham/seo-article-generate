import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import type { LlmConfig } from '../config/types'
import { resolveStepMaxTokens } from '../config/llmTokenLimits'
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
import { stripOuterCodeFence } from '../../shared/normalizeArticleMarkdown'
import {
  getIllustrationLibrary,
  type IllustrationImage,
  type IllustrationProduct
} from '../illustration/illustrationStore'
import { extractProductTutorialRange } from './productTutorialSection'

export interface InsertIllustrationsOptions {
  article: string
  productId?: string
  productName?: string
  outputLanguage?: string
  pipeline?: TokenUsagePipeline
  topic?: string
  llmPresetId?: string
  llmModel?: string
}

interface CatalogImage {
  id: string
  url: string
  alt: string
  caption: string
  stepKey: string
  matchKeywords: string[]
}

interface LinePlacement {
  image: CatalogImage
  afterLine: number
}

function isHttpIllustrationUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function resolveLibraryProduct(
  products: IllustrationProduct[],
  productId?: string,
  productName?: string
): IllustrationProduct | null {
  const id = productId?.trim()
  if (id) {
    const byId = products.find((item) => item.id === id)
    if (byId) return byId
  }

  const name = productName?.trim().toLowerCase()
  if (!name) return null

  const exact = products.find((item) => item.name.trim().toLowerCase() === name)
  if (exact) return exact

  return (
    products.find(
      (item) =>
        item.name.trim().toLowerCase().includes(name) ||
        name.includes(item.name.trim().toLowerCase())
    ) ?? null
  )
}

function toCatalogImages(images: IllustrationImage[]): CatalogImage[] {
  return images
    .filter((image) => isHttpIllustrationUrl(image.url))
    .map((image) => ({
      id: image.id,
      url: image.url.trim(),
      alt: image.alt,
      caption: image.caption,
      stepKey: image.stepKey,
      matchKeywords: image.matchKeywords
    }))
}

function formatCatalogForPrompt(images: CatalogImage[]): string {
  return images
    .map((image, index) => {
      const bits = [
        `${index + 1}. id=${image.id}`,
        `url=${image.url}`,
        image.alt ? `alt=${image.alt}` : '',
        image.caption ? `caption=${image.caption}` : '',
        image.stepKey ? `stepKey=${image.stepKey}` : '',
        image.matchKeywords.length > 0 ? `keywords=${image.matchKeywords.join(', ')}` : ''
      ].filter(Boolean)
      return bits.join(' | ')
    })
    .join('\n')
}

function formatNumberedLines(section: string): string {
  return section
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(3, ' ')}|${line}`)
    .join('\n')
}

function markdownImage(image: CatalogImage): string {
  return `![${image.alt || image.caption || ''}](${image.url})`
}

function extractJsonArray(raw: string): unknown[] | null {
  const text = stripOuterCodeFence(raw).trim()
  if (!text) return null

  const tryParse = (value: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const direct = tryParse(text)
  if (direct) return direct

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1))
  return null
}

function resolveCatalogImage(rawIdOrUrl: string, catalog: CatalogImage[]): CatalogImage | null {
  const raw = rawIdOrUrl.trim().replace(/^<|>$/g, '')
  if (!raw) return null
  return (
    catalog.find((item) => item.id === raw) ??
    catalog.find((item) => item.url === raw) ??
    catalog.find((item) => raw.includes(item.url) || item.url.includes(raw)) ??
    null
  )
}

function parseLinePlacements(
  raw: string,
  catalog: CatalogImage[],
  lineCount: number
): LinePlacement[] {
  const rows = extractJsonArray(raw)
  if (!rows) return []

  const used = new Set<string>()
  const placements: LinePlacement[] = []

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const idOrUrl =
      (typeof item.id === 'string' && item.id) ||
      (typeof item.url === 'string' && item.url) ||
      ''
    const afterLine = Number(item.afterLine)
    if (!Number.isInteger(afterLine) || afterLine < 1 || afterLine > lineCount) continue
    const image = resolveCatalogImage(idOrUrl, catalog)
    if (!image || used.has(image.url)) continue
    used.add(image.url)
    placements.push({ image, afterLine })
  }

  return placements
}

function insertImagesAfterLines(section: string, placements: LinePlacement[]): {
  text: string
  inserted: number
} {
  if (placements.length === 0) return { text: section, inserted: 0 }

  const lines = section.split('\n')
  const byLine = new Map<number, CatalogImage[]>()
  for (const placement of placements) {
    const list = byLine.get(placement.afterLine) ?? []
    list.push(placement.image)
    byLine.set(placement.afterLine, list)
  }

  const next: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    next.push(lines[i])
    const images = byLine.get(i + 1)
    if (!images) continue
    for (const image of images) {
      if (lines[i]?.includes(image.url)) continue
      next.push('')
      next.push(markdownImage(image))
    }
  }

  return { text: next.join('\n'), inserted: placements.length }
}

function replaceImagePlaceholders(
  section: string,
  catalog: CatalogImage[],
  usedUrls: Set<string>
): { text: string; used: number } {
  let used = 0
  const text = section.replace(/\[Image:[^\]]*]/gi, () => {
    const next = catalog.find((image) => !usedUrls.has(image.url))
    if (!next) return ''
    usedUrls.add(next.url)
    used += 1
    return markdownImage(next)
  })
  return { text, used }
}

function scoreLineAgainstImage(line: string, image: CatalogImage): number {
  const hay = line.toLowerCase()
  let score = 0
  for (const keyword of image.matchKeywords) {
    const key = keyword.trim().toLowerCase()
    if (key && hay.includes(key)) score += 3
  }
  if (image.stepKey && hay.includes(image.stepKey.toLowerCase())) score += 4
  for (const token of `${image.alt} ${image.caption}`.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (token.length >= 4 && hay.includes(token)) score += 1
  }
  return score
}

function isStepAnchorLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || /^!\[[^\]]*]\(/.test(trimmed)) return false
  return (
    /^###\s+/.test(trimmed) ||
    /^\d+[\.)]\s+\S/.test(trimmed) ||
    /^step\s*\d+/i.test(trimmed) ||
    /^[-*]\s+\*\*\S/.test(trimmed) ||
    /^[-*]\s+step\s*\d+/i.test(trimmed)
  )
}

/** Insert into the original tutorial text only — never rewrite sentences. */
function heuristicInsertImages(section: string, catalog: CatalogImage[]): {
  text: string
  inserted: number
} {
  if (catalog.length === 0) return { text: section, inserted: 0 }

  const used = new Set<string>()
  const placeholders = replaceImagePlaceholders(section, catalog, used)
  let inserted = placeholders.used
  const lines = placeholders.text.split('\n')

  const stepLineIndexes: number[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (isStepAnchorLine(lines[i])) stepLineIndexes.push(i)
  }

  const remaining = catalog.filter((image) => !used.has(image.url))
  for (const image of remaining) {
    let bestIdx = -1
    let bestScore = 0
    for (const lineIdx of stepLineIndexes) {
      let blocked = false
      for (let j = lineIdx + 1; j < lines.length; j += 1) {
        const peek = lines[j].trim()
        if (!peek) continue
        if (/^!\[[^\]]*]\(/.test(peek)) blocked = true
        break
      }
      if (blocked) continue
      const score = scoreLineAgainstImage(lines[lineIdx], image)
      if (score > bestScore) {
        bestScore = score
        bestIdx = lineIdx
      }
    }

    if (bestIdx < 0 || bestScore <= 0) continue

    const imageLine = markdownImage(image)
    lines.splice(bestIdx + 1, 0, '', imageLine)
    for (let k = 0; k < stepLineIndexes.length; k += 1) {
      if (stepLineIndexes[k] > bestIdx) stepLineIndexes[k] += 2
    }
    used.add(image.url)
    inserted += 1
  }

  return { text: lines.join('\n'), inserted }
}

function spliceSection(article: string, start: number, end: number, section: string): string {
  let body = section
  if (article.slice(start, end).endsWith('\n') && !body.endsWith('\n')) body += '\n'
  return `${article.slice(0, start)}${body}${article.slice(end)}`
}

export async function insertArticleIllustrations(
  options: InsertIllustrationsOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const llmSelection =
    options.llmPresetId && options.llmModel
      ? { presetId: options.llmPresetId, model: options.llmModel }
      : options.llmModel
        ? { presetId: '', model: options.llmModel }
        : null
  const appConfig = await getEffectiveConfig(llmSelection)
  const llm = appConfig.llm

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const article = options.article ?? ''
  if (!article.trim()) {
    return { ok: false, message: '当前没有可插入插图的文章内容。' }
  }

  const productName = options.productName?.trim() || undefined
  const library = await getIllustrationLibrary()
  const product = resolveLibraryProduct(library.products, options.productId, productName)
  if (!product) {
    return {
      ok: false,
      message: productName
        ? `插图库中未找到产品「${productName}」。请先在设置 → 插图库添加该产品与图片。`
        : '未找到写作时的产品对应插图库。请在设置 → 插图库添加图片。'
    }
  }

  const catalog = toCatalogImages(product.images)
  if (catalog.length === 0) {
    return {
      ok: false,
      message: `「${product.name}」插图库没有可用的 http(s) 图片地址。本地上传的图片无法直接用于正文/WordPress，请粘贴可公网访问的 URL。`
    }
  }

  const range = extractProductTutorialRange(article, productName || product.name)
  if (!range) {
    return {
      ok: false,
      message:
        '未找到产品教程段落（含 Step-by-Step / How to … with 产品名 的 Part）。请确认正文已含产品教程章节。'
    }
  }

  const pipeline = options.pipeline === 'optimize' ? 'optimize' : 'create'
  const langCode = normalizeOutputLanguage(options.outputLanguage)
  const articleLangLabel = getLanguageLabel(langCode)
  const articleLangLock = getArticleLanguageLock(langCode, 'user')
  const globalMaxTokens = appConfig.llmMaxTokens
  const lineCount = range.text.split('\n').length

  return runWithTokenContext(
    createTokenRunContext(pipeline, `插图插入:${product.name}`.slice(0, 200)),
    async () => {
      const emit = (event: GenerateProgressEvent): void => {
        if (event.step) {
          updateTokenUsageContext({ step: event.step, stepLabel: event.message })
        }
        sender.send('article:progress', event)
      }

      try {
        throwIfAborted()
        emit({ type: 'status', step: 'draft', message: '正在为产品教程匹配插图…' })

        const raw = await chatCompletion(
          llm as LlmConfig,
          [
            {
              role: 'system',
              content: [
                '你是 SEO/GEO 软文插图匹配助手。',
                articleLangLock,
                '只输出 JSON 数组，不要改写教程，不要输出 Markdown 正文。',
                '格式：[{"id":"插图库id","afterLine":12}]',
                'afterLine 必须是下方带行号文本中的行号，图片将插在该行之后。',
                '规则：每个 id 最多一次；优先对应 Step / 操作步骤行；无关则不要输出。'
              ].join('\n')
            },
            {
              role: 'user',
              content: [
                options.topic ? `文章主题：${options.topic}` : '',
                `产品：${product.name}`,
                `输出语言：${articleLangLabel}`,
                `教程章节标题：${range.heading}`,
                `行号范围：1–${lineCount}`,
                '',
                '--- 插图库 ---',
                formatCatalogForPrompt(catalog),
                '',
                '--- 产品教程（行号|原文，只读）---',
                formatNumberedLines(range.text)
              ]
                .filter(Boolean)
                .join('\n')
            }
          ],
          {
            temperature: 0.1,
            maxTokens: Math.min(resolveStepMaxTokens('sectionEdit', globalMaxTokens) ?? 2048, 2048),
            step: 'sectionEdit',
            label: '产品教程插图规划'
          }
        )

        throwIfAborted()

        let nextSection = range.text
        let inserted = 0

        const placements = parseLinePlacements(raw, catalog, lineCount)
        if (placements.length > 0) {
          const applied = insertImagesAfterLines(range.text, placements)
          nextSection = applied.text
          inserted = applied.inserted
        }

        if (inserted <= 0) {
          emit({ type: 'status', step: 'draft', message: '改用步骤匹配插入插图…' })
          const heuristic = heuristicInsertImages(range.text, catalog)
          nextSection = heuristic.text
          inserted = heuristic.inserted
        }

        if (inserted <= 0) {
          return {
            ok: false,
            message: '未能在产品教程原位置插入插图。请确认该章含 Step-by-Step，并再试一次。'
          }
        }

        const revised = spliceSection(article, range.start, range.end, nextSection)
        let body = nextSection
        if (article.slice(range.start, range.end).endsWith('\n') && !body.endsWith('\n')) {
          body += '\n'
        }
        if (revised.slice(0, range.start) !== article.slice(0, range.start)) {
          return { ok: false, message: '插图拼接校验失败：文首被改动，已取消。' }
        }
        if (revised.slice(range.start + body.length) !== article.slice(range.end)) {
          return { ok: false, message: '插图拼接校验失败：教程后原文被改动，已取消。' }
        }

        emit({ type: 'replace', text: revised, step: 'draft' })
        emit({
          type: 'status',
          step: 'draft',
          message: `已建议插入 ${inserted} 张插图，请确认后应用`
        })
        emit({ type: 'done' })
        return { ok: true }
      } catch (error) {
        if (isAbortError(error)) {
          emit({ type: 'cancelled', message: '已中止生成' })
          return { ok: false, message: '已中止生成' }
        }
        const message = error instanceof Error ? error.message : '插图插入失败'
        emit({ type: 'error', message })
        return { ok: false, message }
      }
    }
  )
}
