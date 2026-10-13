export const MAX_INTERNAL_LINKS = 2000
export const MIN_RELATED_LINKS = 2
export const MAX_RELATED_LINKS = 4

export interface InternalLinkDoc {
  siteUrl: string
  url: string
  title: string
  slug: string
  lastmod?: string
}

export interface InternalLinkCatalog {
  productId: string
  productName?: string
  siteUrl: string
  sitemapUrl?: string
  importedAt: number
  truncated?: boolean
  includePatterns?: string[]
  excludePatterns?: string[]
  documents: InternalLinkDoc[]
}

export interface InternalLinkCatalogSummary {
  productId: string
  productName?: string
  siteUrl: string
  sitemapUrl?: string
  importedAt: number
  truncated?: boolean
  includePatterns?: string[]
  excludePatterns?: string[]
  count: number
}

export interface InternalLinkUrlFilter {
  includePatterns: string[]
  excludePatterns: string[]
}

const SKIP_PATH =
  /\/(category|categories|tag|tags|author|authors|page|search|wp-content|wp-json|wp-admin|cart|checkout|feed)(\/|$)/i
const SKIP_FILE = /\.(xml|gz|jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js)$/i
const CONCLUSION_HEADING =
  /^##\s+(?:\d+[.)]\s+)?(conclusion|conclusions|结语|总结|写在最后|bottom line|the bottom line|final thoughts|wrapping up)\b/i
const FAQ_HEADING =
  /^##\s+(?:\d+[.)]\s+)?(faq|faqs|frequently asked questions|常见问题|常见问答)\b/i
const RELATED_HEADING = /^##\s+(related reading|相关阅读)\s*$/i
const GENERIC_ANCHOR_TOKENS = new Set([
  'iphone',
  'ipad',
  'ipod',
  'android',
  'windows',
  'mac',
  'macos',
  'ios',
  'music',
  'video',
  'audio',
  'spotify',
  'apple',
  'google',
  'youtube',
  'storage',
  'download',
  'guide',
  'best',
  'app',
  'apps',
  'free',
  'online',
  'review',
  'tool',
  'file',
  'files',
  'phone',
  'user',
  'users',
  'step',
  'steps',
  'way',
  'ways',
  'tips',
  'tutorial',
  'device',
  'devices',
  'software'
])

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'of',
  'to',
  'in',
  'on',
  'with',
  'best',
  'a',
  'an',
  'how',
  'your'
])

export function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.toLowerCase() ?? url
  }
}

export function catalogKey(siteUrl: string): string {
  return hostKey(siteUrl) || siteUrl.trim().toLowerCase()
}

export function productCatalogKey(productId: string): string {
  return productId.trim()
}

export function isHostLikeCatalogKey(key: string): boolean {
  return key.includes('.')
}

export function namesMatchIgnoreCase(left?: string, right?: string): boolean {
  const a = left?.trim().toLowerCase()
  const b = right?.trim().toLowerCase()
  return Boolean(a && b && a === b)
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .trim()
}

export function slugFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '')
    const last = path.split('/').filter(Boolean).pop() ?? ''
    return decodeURIComponent(last)
  } catch {
    return ''
  }
}

export function titleFromSlug(slug: string): string {
  const cleaned = slug.replace(/\.(html?)$/i, '').replace(/[-_]+/g, ' ').trim()
  if (!cleaned) return slug || 'Untitled'
  if (/[\u4e00-\u9fff]/.test(cleaned)) return cleaned
  return cleaned.replace(/\b([a-z])/g, (char) => char.toUpperCase())
}

export function isArticleLikeUrl(url: string, siteUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (siteUrl && hostKey(parsed.href) !== hostKey(siteUrl)) return false
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return false
  if (SKIP_FILE.test(path)) return false
  if (SKIP_PATH.test(path)) return false
  if (/\/page\/\d+/i.test(path)) return false
  return true
}

const MAX_URL_FILTER_PATTERNS = 40
const MAX_URL_FILTER_CHARS = 120

export function parseUrlFilterPatterns(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\n,，;；]+/)
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const pattern = String(item).trim().slice(0, MAX_URL_FILTER_CHARS)
    if (!pattern) continue
    const key = pattern.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pattern)
    if (out.length >= MAX_URL_FILTER_PATTERNS) break
  }
  return out
}

export function formatUrlFilterInput(patterns: string[] | undefined): string {
  return (patterns ?? []).join('\n')
}

function patternMatchesUrl(url: string, pattern: string): boolean {
  const hay = url.toLowerCase()
  const needle = pattern.trim().toLowerCase()
  if (!needle) return false
  if (!needle.includes('*')) return hay.includes(needle)
  const escaped = needle.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  try {
    return new RegExp(escaped, 'i').test(url)
  } catch {
    return hay.includes(needle.replace(/\*/g, ''))
  }
}

export function urlMatchesFilters(
  url: string,
  filter?: Partial<InternalLinkUrlFilter> | null
): boolean {
  const include = parseUrlFilterPatterns(filter?.includePatterns)
  const exclude = parseUrlFilterPatterns(filter?.excludePatterns)
  if (exclude.some((pattern) => patternMatchesUrl(url, pattern))) return false
  if (include.length === 0) return true
  return include.some((pattern) => patternMatchesUrl(url, pattern))
}

export function shouldFollowChildSitemap(url: string): boolean {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  })()
  if (/(image|video|news|category|tag|author)/i.test(path)) return false
  return true
}

export function tokenizeLinkQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  const tokens = new Set<string>()
  for (const part of trimmed.split(/[\s,，;；|/]+/)) {
    const token = part.replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '').trim()
    if (token.length < 2 || STOP_WORDS.has(token)) continue
    tokens.add(token)
  }
  return [...tokens]
}

function normalizeTitleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim()
}

export function scoreInternalLink(
  doc: InternalLinkDoc,
  query: string,
  searchHints: string[] = []
): number {
  const tokens = tokenizeLinkQuery(query)
  if (tokens.length === 0) return 0

  const title = doc.title.toLowerCase()
  const slug = doc.slug.toLowerCase().replace(/[-_]/g, ' ')
  const q = query.trim().toLowerCase()
  let score = 0

  for (const token of tokens) {
    if (title.includes(token)) score += token === q ? 8 : 4
    if (slug.includes(token)) score += 2
  }

  for (const hint of searchHints) {
    const key = hint.trim().toLowerCase()
    if (key.length < 2) continue
    if (title.includes(key) || slug.includes(key)) score += 4
  }

  const topicKey = normalizeTitleKey(query)
  const titleKey = normalizeTitleKey(doc.title)
  if (topicKey && titleKey && (titleKey === topicKey || titleKey.includes(topicKey) || topicKey.includes(titleKey))) {
    const ratio =
      Math.min(titleKey.length, topicKey.length) / Math.max(titleKey.length, topicKey.length)
    if (ratio >= 0.72) score -= 18
  }

  return score
}

export function pickRelatedLinks(
  documents: InternalLinkDoc[],
  options: {
    query: string
    searchHints?: string[]
    excludeUrls?: string[]
    min?: number
    max?: number
  }
): InternalLinkDoc[] {
  const min = options.min ?? MIN_RELATED_LINKS
  const max = options.max ?? MAX_RELATED_LINKS
  const excluded = new Set((options.excludeUrls ?? []).map((item) => item.replace(/\/+$/, '').toLowerCase()))
  const scored = documents
    .filter((doc) => !excluded.has(doc.url.replace(/\/+$/, '').toLowerCase()))
    .map((doc) => ({
      doc,
      score: scoreInternalLink(doc, options.query, options.searchHints)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.doc.lastmod ?? '').localeCompare(a.doc.lastmod ?? '')
    })

  const picked: InternalLinkDoc[] = []
  const prefixes = new Set<string>()

  const prefixOf = (doc: InternalLinkDoc): string => {
    const parts = doc.slug.toLowerCase().split(/[-_]/).filter(Boolean)
    return parts.slice(0, 2).join('-')
  }

  for (const item of scored) {
    if (picked.length >= max) break
    const prefix = prefixOf(item.doc)
    if (prefix && prefixes.has(prefix) && picked.length + (scored.length - picked.length) > max) {
      continue
    }
    picked.push(item.doc)
    if (prefix) prefixes.add(prefix)
  }

  if (picked.length < min) {
    for (const item of scored) {
      if (picked.length >= max) break
      if (picked.some((doc) => doc.url === item.doc.url)) continue
      picked.push(item.doc)
    }
  }

  return picked.slice(0, max)
}

export function relatedReadingHeading(language?: string): string {
  return language === 'zh' ? '相关阅读' : 'Related reading'
}

export function formatRelatedReadingMarkdown(
  links: InternalLinkDoc[],
  language?: string
): string {
  if (links.length === 0) return ''
  const heading = relatedReadingHeading(language)
  const items = links.map((link) => `- [${link.title.replace(/]/g, '\\]')}](${link.url})`)
  return `## ${heading}\n\n${items.join('\n')}`
}

export function extractMarkdownHeadings(markdown: string): string[] {
  const headings: string[] = []
  for (const line of markdown.split('\n')) {
    const match = line.match(/^#{1,3}\s+(.+)$/)
    if (match?.[1]) headings.push(match[1].trim())
  }
  return headings
}

export function urlsInMarkdown(markdown: string): string[] {
  const found: string[] = []
  const re = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown))) {
    found.push(match[1])
  }
  return found
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function orderedContentTokens(text: string): string[] {
  const tokens: string[] = []
  for (const part of text.toLowerCase().split(/[\s,，;；|/]+/)) {
    const token = part.replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '').trim()
    if (token.length < 2 || STOP_WORDS.has(token)) continue
    tokens.push(token)
  }
  return tokens
}

function windowIsSpecific(tokens: string[]): boolean {
  return tokens.some((token) => !GENERIC_ANCHOR_TOKENS.has(token) && token.length >= 3)
}

function phraseRegExp(tokens: string[]): RegExp {
  const stopGap = [...STOP_WORDS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  const gap = `(?:[\\s-]+(?:(?:${stopGap})[\\s-]+)?)`
  return new RegExp(tokens.map(escapeRegExp).join(gap), 'gi')
}

function maskRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const re = /!\[[^\]]*]\([^)]*\)|\[[^\]]*]\([^)]*\)|`[^`]+`/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

function overlapsRange(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([from, to]) => start < to && end > from)
}

function hasTokenBoundary(text: string, start: number, end: number): boolean {
  const latin = /[A-Za-z0-9]/
  const cjk = /[\u4e00-\u9fff]/
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  if (cjk.test(text.slice(start, end))) {
    if (before && latin.test(before)) return false
    if (after && latin.test(after)) return false
    return true
  }
  const word = /[A-Za-z0-9\u4e00-\u9fff]/
  if (before && word.test(before)) return false
  if (after && word.test(after)) return false
  return true
}

function findTokenPhrase(
  paragraph: string,
  tokens: string[]
): { start: number; end: number; tokenCount: number } | null {
  if (tokens.length < 2) return null
  const masked = maskRanges(paragraph)
  for (let size = tokens.length; size >= 2; size -= 1) {
    for (let index = 0; index + size <= tokens.length; index += 1) {
      const window = tokens.slice(index, index + size)
      if (!windowIsSpecific(window)) continue
      const re = phraseRegExp(window)
      for (const match of paragraph.matchAll(re)) {
        const start = match.index ?? 0
        const end = start + match[0].length
        if (!hasTokenBoundary(paragraph, start, end)) continue
        if (overlapsRange(start, end, masked)) continue
        if (match[0].trim().length < 8 && !/[\u4e00-\u9fff]/.test(match[0])) continue
        return { start, end, tokenCount: size }
      }
    }
  }
  return null
}

function findCjkPhrase(
  paragraph: string,
  title: string
): { start: number; end: number; tokenCount: number } | null {
  const chunks = title.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  if (chunks.length === 0) return null
  const masked = maskRanges(paragraph)
  const haystack = paragraph.toLowerCase()
  const candidates: string[] = []
  for (const chunk of chunks) {
    candidates.push(chunk)
    if (chunk.length < 4) continue
    for (let size = chunk.length - 1; size >= 4; size -= 1) {
      for (let index = 0; index + size <= chunk.length; index += 1) {
        candidates.push(chunk.slice(index, index + size))
      }
    }
  }
  candidates.sort((a, b) => b.length - a.length)
  for (const phrase of candidates) {
    const needle = phrase.toLowerCase()
    let from = 0
    while (from < haystack.length) {
      const start = haystack.indexOf(needle, from)
      if (start < 0) break
      const end = start + phrase.length
      from = start + 1
      if (!hasTokenBoundary(paragraph, start, end)) continue
      if (overlapsRange(start, end, masked)) continue
      return { start, end, tokenCount: Math.max(2, phrase.length) }
    }
  }
  return null
}

function isFaqQuestionLine(line: string): boolean {
  const plain = line.replace(/\*\*/g, '').trim()
  if (/^(?:q|question|问)\s*[:：]/i.test(plain)) return true
  return /\?\s*$/.test(plain) && plain.length <= 200
}

function proseSpans(markdown: string): Array<{ start: number; end: number }> {
  const lines = markdown.split('\n')
  const spans: Array<{ start: number; end: number }> = []
  let offset = 0
  let inFence = false
  let inFaq = false
  let proseStart: number | null = null
  let proseEnd = 0

  const closeProse = (): void => {
    if (proseStart === null) return
    if (markdown.slice(proseStart, proseEnd).trim()) spans.push({ start: proseStart, end: proseEnd })
    proseStart = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineStart = offset
    const lineEnd = offset + line.length
    offset = index === lines.length - 1 ? lineEnd : lineEnd + 1
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      closeProse()
      inFence = !inFence
      continue
    }
    if (inFence) continue

    if (/^##(?!#)\s+/.test(trimmed)) inFaq = FAQ_HEADING.test(trimmed)

    const locked =
      !trimmed ||
      /^#{1,6}\s+/.test(trimmed) ||
      /^\|/.test(trimmed) ||
      /^!\[[^\]]*]\(/.test(trimmed) ||
      /^<!--/.test(trimmed) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
      (inFaq && isFaqQuestionLine(trimmed))

    if (locked) {
      closeProse()
      continue
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) {
      closeProse()
      if (line.trim()) spans.push({ start: lineStart, end: lineEnd })
      continue
    }

    if (proseStart === null) proseStart = lineStart
    proseEnd = lineEnd
  }

  closeProse()
  return spans
}

function articleTitleKeys(markdown: string, topic?: string): string[] {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1] ?? ''
  return [topic ?? '', h1].map(normalizeTitleKey).filter((key) => key.length >= 8)
}

function docMatchesCurrentArticle(doc: InternalLinkDoc, keys: string[]): boolean {
  const titles = [normalizeTitleKey(doc.title), normalizeTitleKey(doc.slug.replace(/[-_]/g, ' '))].filter(Boolean)
  for (const key of keys) {
    for (const title of titles) {
      if (title === key) return true
      const ratio = Math.min(title.length, key.length) / Math.max(title.length, key.length)
      if (ratio >= 0.92 && (title.includes(key) || key.includes(title))) return true
    }
  }
  return false
}

function markdownLinkUrl(url: string): string {
  return url.replace(/ /g, '%20').replace(/\)/g, '%29')
}

export interface InlineInternalLinkInsertion {
  markdown: string
  inserted: number
}

export function insertInlineInternalLinks(
  markdown: string,
  documents: InternalLinkDoc[],
  options?: {
    topic?: string
    excludeUrls?: string[]
    max?: number
  }
): InlineInternalLinkInsertion {
  const max = options?.max ?? MAX_RELATED_LINKS
  const excluded = new Set((options?.excludeUrls ?? []).map((item) => item.replace(/\/+$/, '').toLowerCase()))
  const titleKeys = articleTitleKeys(markdown, options?.topic)
  const spans = proseSpans(markdown)

  interface Placement {
    url: string
    spanIndex: number
    localStart: number
    localEnd: number
    absStart: number
    quality: number
  }

  const placements: Placement[] = []
  for (const doc of documents) {
    const urlKey = doc.url.replace(/\/+$/, '').toLowerCase()
    if (!doc.url.trim() || excluded.has(urlKey)) continue
    if (docMatchesCurrentArticle(doc, titleKeys)) continue
    const titleTokens = orderedContentTokens(doc.title)
    const slugTokens = orderedContentTokens(doc.slug.replace(/[-_]/g, ' '))
    spans.forEach((span, spanIndex) => {
      const text = markdown.slice(span.start, span.end)
      const anchor =
        findTokenPhrase(text, titleTokens) ??
        findTokenPhrase(text, slugTokens) ??
        findCjkPhrase(text, doc.title)
      if (!anchor) return
      placements.push({
        url: doc.url,
        spanIndex,
        localStart: anchor.start,
        localEnd: anchor.end,
        absStart: span.start + anchor.start,
        quality: anchor.tokenCount * 1000 + (anchor.end - anchor.start)
      })
    })
  }

  placements.sort((a, b) => b.quality - a.quality || a.absStart - b.absStart)

  const usedSpans = new Set<number>()
  const usedUrls = new Set<string>()
  const usedAnchors = new Set<string>()
  const chosen: Placement[] = []
  for (const placement of placements) {
    if (chosen.length >= max) break
    if (usedSpans.has(placement.spanIndex) || usedUrls.has(placement.url)) continue
    const anchorKey = markdown.slice(placement.absStart, placement.absStart + (placement.localEnd - placement.localStart)).toLowerCase()
    if (usedAnchors.has(anchorKey)) continue
    chosen.push(placement)
    usedSpans.add(placement.spanIndex)
    usedUrls.add(placement.url)
    usedAnchors.add(anchorKey)
  }

  let next = markdown
  for (const placement of [...chosen].sort((a, b) => b.absStart - a.absStart)) {
    const absEnd = placement.absStart + (placement.localEnd - placement.localStart)
    const anchor = next.slice(placement.absStart, absEnd).replace(/]/g, '\\]')
    next = `${next.slice(0, placement.absStart)}[${anchor}](${markdownLinkUrl(placement.url)})${next.slice(absEnd)}`
  }

  return { markdown: next, inserted: chosen.length }
}

export function insertRelatedReadingMarkdown(
  markdown: string,
  block: string
): string {
  const trimmedBlock = block.trim()
  if (!trimmedBlock) return markdown

  const lines = markdown.replace(/\s+$/, '').split('\n')
  if (lines.some((line) => RELATED_HEADING.test(line.trim()))) return markdown

  const conclusionIndex = lines.findIndex((line) => CONCLUSION_HEADING.test(line.trim()))
  if (conclusionIndex >= 0) {
    const before = lines.slice(0, conclusionIndex).join('\n').replace(/\s+$/, '')
    const after = lines.slice(conclusionIndex).join('\n')
    return `${before}\n\n${trimmedBlock}\n\n${after}`.replace(/\n{3,}/g, '\n\n')
  }

  return `${lines.join('\n')}\n\n${trimmedBlock}`.replace(/\n{3,}/g, '\n\n')
}

export function summarizeCatalog(catalog: InternalLinkCatalog | null): InternalLinkCatalogSummary | null {
  if (!catalog) return null
  return {
    productId: catalog.productId,
    productName: catalog.productName,
    siteUrl: catalog.siteUrl,
    sitemapUrl: catalog.sitemapUrl,
    importedAt: catalog.importedAt,
    truncated: catalog.truncated,
    includePatterns: catalog.includePatterns,
    excludePatterns: catalog.excludePatterns,
    count: catalog.documents.length
  }
}
