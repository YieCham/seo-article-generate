export interface AiTraceConfig {
  /** Rescan after a conversation is marked completed. */
  autoOnComplete: boolean
  /** Skip the report when fewer completed articles exist. */
  minCorpusPages: number
  /** Phrase must show up in at least this many articles. */
  minDocuments: number
  /** And in at least this fraction of the scanned articles (0–1). */
  minRatio: number
  minPhraseTokens: number
  maxPhraseTokens: number
  /** One phrase per entry. Entries of 8+ normalized characters drop any sentence that contains them. */
  ignorePhrases: string[]
  /** Preset used only by the two-pass reading. Empty until the user picks one. */
  readPresetId: string
  /** Model used only by the two-pass reading. */
  readModel: string
}

export interface AiTracePageRef {
  sessionId: string
  title: string
}

export interface AiTraceHit {
  phrase: string
  kind: 'sentence' | 'phrase' | 'known'
  documentCount: number
  ratio: number
  pages: AiTracePageRef[]
}

export interface AiTraceReportRules {
  minCorpusPages: number
  minDocuments: number
  minRatio: number
}

export type AiTracePatternVerdict = 'universal' | 'partial' | 'rejected' | 'insufficient'

export interface AiTraceQuote {
  sessionId: string
  title: string
  quote: string
}

export interface AiTraceCounterexample {
  sessionId: string
  title: string
  note: string
}

export interface AiTracePattern {
  name: string
  why: string
  suggestion: string
  verdict: AiTracePatternVerdict
  supportCount: number
  checkedCount: number
  ratio: number
  support: AiTraceQuote[]
  counterexamples: AiTraceCounterexample[]
  discoveryQuotes: AiTraceQuote[]
}

/** Second-pass reading. Absent on reports produced by the local phrase scan alone. */
export interface AiTraceReading {
  scannedAt: number
  status: 'ok' | 'insufficient' | 'error'
  message: string
  holdout: boolean
  discoveryPageCount: number
  verifyPageCount: number
  patterns: AiTracePattern[]
}

export interface AiTraceReport {
  scannedAt: number
  pageCount: number
  status: 'ok' | 'insufficient'
  message: string
  rules: AiTraceReportRules
  scannedPages: AiTracePageRef[]
  hits: AiTraceHit[]
  knownHits: AiTraceHit[]
  reading?: AiTraceReading
}

export interface AiTraceSessionInput {
  id: string
  title?: string
  customTitle?: string
  listStatus?: string
  messages?: Array<{
    role?: string
    content?: string
    status?: string
  }>
}

export interface ScanAiTraceOptions {
  config?: Partial<AiTraceConfig> | null
  productNames?: string[]
}

export const DEFAULT_AI_TRACE_CONFIG: AiTraceConfig = {
  autoOnComplete: false,
  minCorpusPages: 5,
  minDocuments: 3,
  minRatio: 0.15,
  minPhraseTokens: 5,
  maxPhraseTokens: 12,
  ignorePhrases: [],
  readPresetId: '',
  readModel: ''
}

const MAX_FREQUENCY_HITS = 40
const MAX_KNOWN_HITS = 30
const SENTENCE_MIN_WORDS = 8
const SENTENCE_MAX_WORDS = 45
const CJK_SENTENCE_MIN = 12
const CJK_SENTENCE_MAX = 80
const CJK_CLAUSE_MIN = 8
const CJK_CLAUSE_MAX = 40

const BUILTIN_EXACT = [
  'introduction',
  'intro',
  'conclusion',
  'final thoughts',
  'wrapping up',
  'faq',
  'faqs',
  'frequently asked questions',
  'quick answer',
  'key takeaways',
  'table of contents',
  'seo meta',
  'overview',
  'summary',
  '常见问题',
  '常见问答',
  '总结',
  '引言',
  '目录'
]

const BUILTIN_CONTAINS = [
  'this tool is intended for personal backup of content you have the right to access',
  'users must comply with local copyright laws and streaming service terms'
]

/** Multi-word tells. Listed even when they miss the frequency threshold, once they appear in 2+ pages. */
const KNOWN_AI_PHRASES = [
  "it's worth noting",
  'it is worth noting',
  'it is important to note',
  "it's important to note",
  "in today's digital",
  "in today's fast-paced",
  'in this comprehensive guide',
  "whether you're a beginner",
  'whether you are a beginner',
  "let's dive in",
  "let's dive into",
  "let's explore",
  "let's break this down",
  "here's what you need to know",
  'without further ado',
  'at its core',
  'the real question is',
  'plays a crucial role',
  'plays a vital role',
  'plays a pivotal role',
  'serves as a testament',
  'is a testament to',
  'setting the stage for',
  'delve into',
  'dive deep into',
  'unlock the full potential',
  'a wide range of',
  "it's no secret that",
  'it goes without saying',
  'when it comes to',
  'at the end of the day',
  'look no further',
  'the bottom line is',
  'due to the fact that',
  'has the ability to',
  'nestled in the',
  'in the heart of',
  'keep in mind that',
  'with that in mind',
  'in conclusion',
  'to sum up',
  'in summary',
  'i hope this helps',
  'hope this helps',
  'let me know if',
  '值得注意的是',
  '总的来说',
  '综上所述',
  '在当今社会',
  '本文将为您',
  '本文将介绍',
  '希望对你有所帮助',
  '希望本文能',
  '让我们一起',
  '不言而喻',
  '不可或缺'
]

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'that', 'this', 'is', 'are',
  'was', 'were', 'be', 'as', 'by', 'or', 'from', 'at', 'it', 'its', 'you', 'your', 'we', 'our',
  'can', 'will', 'if', 'not', 'but', 'they', 'their', 'into', 'about', 'than', 'then', 'so',
  'also', 'more', 'most', 'other', 'such', 'when', 'which', 'who', 'how', 'what', 'there',
  'here', 'just', 'only', 'over', 'after', 'before', 'between', 'through', 'using', 'use',
  'via', 'per', 'may', 'might', 'your', 'youre', "you're", 'its', "it's"
])

const STRUCTURAL_LINE =
  /^(introduction|intro|conclusion|in conclusion|final thoughts|wrapping up|faq|faqs|frequently asked questions|quick answer|key takeaways|table of contents|seo meta|overview|summary|常见问题|常见问答|总结|引言|目录)$/i

interface IgnoreRule {
  key: string
  mode: 'exact' | 'contains'
}

interface PreparedPage {
  sessionId: string
  title: string
  lines: string[]
}

interface Accum {
  key: string
  phrase: string
  kind: 'sentence' | 'phrase'
  sessions: Set<string>
}

interface Candidate {
  key: string
  phrase: string
  kind: 'sentence' | 'phrase'
  documentCount: number
  ratio: number
  pages: AiTracePageRef[]
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function readRatio(value: unknown, fallback: number): number {
  let numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return fallback
  if (numeric > 1 && numeric <= 100) numeric = numeric / 100
  return Math.min(1, Math.max(0.05, numeric))
}

export function normalizeAiTraceConfig(partial?: Partial<AiTraceConfig> | null): AiTraceConfig {
  const minPhraseTokens = readInt(partial?.minPhraseTokens, DEFAULT_AI_TRACE_CONFIG.minPhraseTokens, 3, 12)
  let maxPhraseTokens = readInt(partial?.maxPhraseTokens, DEFAULT_AI_TRACE_CONFIG.maxPhraseTokens, 4, 24)
  if (maxPhraseTokens < minPhraseTokens) maxPhraseTokens = minPhraseTokens

  const ignorePhrases = (Array.isArray(partial?.ignorePhrases) ? partial.ignorePhrases : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 100)
    .map((item) => item.slice(0, 200))

  return {
    autoOnComplete: Boolean(partial?.autoOnComplete),
    minCorpusPages: readInt(partial?.minCorpusPages, DEFAULT_AI_TRACE_CONFIG.minCorpusPages, 2, 200),
    minDocuments: readInt(partial?.minDocuments, DEFAULT_AI_TRACE_CONFIG.minDocuments, 2, 100),
    minRatio: readRatio(partial?.minRatio, DEFAULT_AI_TRACE_CONFIG.minRatio),
    minPhraseTokens,
    maxPhraseTokens,
    ignorePhrases,
    readPresetId: typeof partial?.readPresetId === 'string' ? partial.readPresetId.trim() : '',
    readModel: typeof partial?.readModel === 'string' ? partial.readModel.trim() : ''
  }
}

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cjkCount(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length
}

function isContentToken(token: string): boolean {
  if (STOPWORDS.has(token)) return false
  return /[\p{L}]/u.test(token)
}

function contentCount(tokens: string[]): number {
  return tokens.filter(isContentToken).length
}

function buildIgnoreRules(userPhrases: string[], productNames: string[]): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  const push = (phrase: string, mode: IgnoreRule['mode'], minLength: number) => {
    const key = normalizePhrase(phrase)
    if (key.length < minLength) return
    rules.push({ key, mode })
  }

  for (const phrase of BUILTIN_EXACT) push(phrase, 'exact', 2)
  for (const phrase of BUILTIN_CONTAINS) push(phrase, 'contains', 8)
  for (const phrase of userPhrases) {
    const key = normalizePhrase(phrase)
    if (key.length < 2) continue
    rules.push({ key, mode: key.length >= 8 ? 'contains' : 'exact' })
  }
  for (const name of productNames) push(name, 'exact', 2)
  return rules
}

function ignored(key: string, rules: IgnoreRule[]): boolean {
  if (!key) return true
  for (const rule of rules) {
    if (key === rule.key) return true
    if (rule.mode === 'contains' && rule.key.length >= 8 && key.includes(rule.key)) return true
  }
  return false
}

function stripMarkdown(markdown: string): string {
  let text = markdown.replace(/\r\n/g, '\n')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/^##\s+SEO Meta\s*\n[\s\S]*?\n---\s*\n?/im, '')
  text = text.replace(/```[\s\S]*?```/g, '\n')
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
  text = text.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
  text = text.replace(/https?:\/\/\S+/g, ' ')
  text = text.replace(/<[^>\n]+>/g, ' ')

  const lines: string[] = []
  for (const line of text.split('\n')) {
    let next = line.trim()
    if (!next) continue
    if (/^[\s|:-]+$/.test(next) && next.includes('-')) continue
    next = next.replace(/^#{1,6}\s+/, '')
    next = next.replace(/^>\s?/, '')
    next = next.replace(/^[-*+]\s+/, '')
    next = next.replace(/^\d+[.)]\s+/, '')
    next = next.replace(/\|/g, ' ')
    next = next.replace(/`([^`]+)`/g, '$1')
    next = next.replace(/\*\*([^*]+)\*\*/g, '$1')
    next = next.replace(/\*([^*]+)\*/g, '$1')
    next = next.replace(/__([^_]+)__/g, '$1')
    next = next.replace(/_([^_]+)_/g, '$1')
    next = next.replace(/\s+/g, ' ').trim()
    if (!next) continue
    if (/^(title|meta description|description|slug|keywords|focus keyword)\s*:/i.test(next)) continue
    if (STRUCTURAL_LINE.test(normalizePhrase(next))) continue
    lines.push(next)
  }
  return lines.join('\n')
}

function splitSentences(prose: string): string[] {
  const protectedText = prose.replace(/(\d)\.(\d)/g, '$1§$2')
  const parts = protectedText.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?。！？])\s+/))
  return parts
    .map((part) => part.replace(/§/g, '.').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 8)
}

function splitClauses(sentence: string): string[] {
  const protectedText = sentence.replace(/(\d),(\d)/g, '$1§$2')
  return protectedText
    .split(/[,，;；:：、]|\u2014| - /)
    .map((part) => part.replace(/§/g, ',').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function tokenPairs(text: string): Array<{ raw: string; key: string }> {
  const pairs: Array<{ raw: string; key: string }> = []
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue
    const key = normalizePhrase(raw)
    if (!key) continue
    pairs.push({ raw, key })
  }
  return pairs
}

function addHit(
  map: Map<string, Accum>,
  key: string,
  phrase: string,
  sessionId: string,
  kind: 'sentence' | 'phrase',
  rules: IgnoreRule[]
): void {
  if (!key || key.length < 8 || ignored(key, rules)) return
  if (map.size > 100000 && !map.has(key)) return
  const display = phrase.replace(/\s+/g, ' ').trim()
  const existing = map.get(key)
  if (!existing) {
    map.set(key, { key, phrase: display, kind, sessions: new Set([sessionId]) })
    return
  }
  existing.sessions.add(sessionId)
  if (kind === 'sentence' && existing.kind !== 'sentence') {
    existing.kind = 'sentence'
    existing.phrase = display
  }
}

function absorbSentence(
  map: Map<string, Accum>,
  sentence: string,
  sessionId: string,
  config: AiTraceConfig,
  rules: IgnoreRule[],
  lines: string[]
): void {
  const cjk = cjkCount(sentence)
  const pairs = tokenPairs(sentence)
  const mostlyCjk = cjk >= 8 && cjk > pairs.length

  if (mostlyCjk) {
    const key = normalizePhrase(sentence)
    if (!key || ignored(key, rules)) return
    lines.push(key)
    if (cjk >= CJK_SENTENCE_MIN && cjk <= CJK_SENTENCE_MAX) {
      addHit(map, key, sentence, sessionId, 'sentence', rules)
    }
    for (const clause of splitClauses(sentence)) {
      const clauseKey = normalizePhrase(clause)
      const clauseCjk = cjkCount(clause)
      if (clauseCjk < CJK_CLAUSE_MIN || clauseCjk > CJK_CLAUSE_MAX) continue
      if (clauseKey === key) continue
      addHit(map, clauseKey, clause, sessionId, 'phrase', rules)
    }
    return
  }

  if (pairs.length === 0) return
  const sentenceKey = pairs.map((pair) => pair.key).join(' ')
  if (ignored(sentenceKey, rules)) return
  const sentenceTokens = pairs.map((pair) => pair.key)
  if (
    pairs.length >= SENTENCE_MIN_WORDS &&
    pairs.length <= SENTENCE_MAX_WORDS &&
    contentCount(sentenceTokens) >= 2
  ) {
    addHit(map, sentenceKey, pairs.map((pair) => pair.raw).join(' '), sessionId, 'sentence', rules)
    lines.push(sentenceKey)
  } else if (sentenceKey) {
    lines.push(sentenceKey)
  }

  for (const clause of splitClauses(sentence)) {
    const clausePairs = tokenPairs(clause)
    if (
      clausePairs.length < config.minPhraseTokens ||
      clausePairs.length > config.maxPhraseTokens
    ) {
      continue
    }
    const tokens = clausePairs.map((pair) => pair.key)
    if (contentCount(tokens) < 2 || contentCount(tokens) / tokens.length < 0.34) continue
    const clauseKey = tokens.join(' ')
    if (clauseKey === sentenceKey) continue
    addHit(map, clauseKey, clausePairs.map((pair) => pair.raw).join(' '), sessionId, 'phrase', rules)
  }

  if (pairs.length < config.minPhraseTokens || pairs.length > 60) return
  const upper = Math.min(config.maxPhraseTokens, pairs.length)
  for (let size = config.minPhraseTokens; size <= upper; size += 1) {
    for (let index = 0; index + size <= pairs.length; index += 1) {
      const slice = pairs.slice(index, index + size)
      const tokens = slice.map((pair) => pair.key)
      if (contentCount(tokens) < 2 || contentCount(tokens) / tokens.length < 0.34) continue
      const shingleKey = tokens.join(' ')
      if (shingleKey === sentenceKey) continue
      addHit(map, shingleKey, slice.map((pair) => pair.raw).join(' '), sessionId, 'phrase', rules)
    }
  }
}

function latestArticle(session: AiTraceSessionInput): string | null {
  const messages = session.messages ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const content = message.content?.trim() ?? ''
    if (!content) continue
    if (!message.status || message.status === 'done') return content
  }
  return null
}

function resolveTitle(session: AiTraceSessionInput, markdown: string): string {
  if (session.customTitle?.trim()) return session.customTitle.trim()
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]
  if (heading) {
    const title = heading
      .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    if (title) return title
  }
  return session.title?.trim() || '未命名'
}

function linesHavePhrase(lines: string[], key: string): boolean {
  if (!key) return false
  if (/[\u4e00-\u9fff]/.test(key) && !/\s/.test(key)) {
    return lines.some((line) => line.includes(key))
  }
  const needle = ` ${key} `
  return lines.some((line) => ` ${line} `.includes(needle))
}

function containsPhrase(longer: string, shorter: string): boolean {
  if (!shorter || longer.length <= shorter.length) return false
  if (` ${longer} `.includes(` ${shorter} `)) return true
  if (/[\u4e00-\u9fff]/.test(shorter) && longer.includes(shorter)) return true
  return false
}

function passesThreshold(count: number, pageCount: number, config: AiTraceConfig): boolean {
  if (count < config.minDocuments) return false
  return count / pageCount >= config.minRatio - 1e-9
}

function covers(outer: Candidate, inner: Candidate): boolean {
  if (outer.key === inner.key) return true
  if (outer.documentCount < inner.documentCount) return false
  return containsPhrase(outer.key, inner.key)
}

function subsume(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort(
    (a, b) => b.documentCount - a.documentCount || b.key.length - a.key.length
  )
  const kept: Candidate[] = []
  for (const item of sorted.slice(0, 500)) {
    if (kept.some((other) => covers(other, item))) continue
    kept.push(item)
  }
  return kept
}

function tryExtendDisplay(a: string, b: string): string | null {
  const left = a.split(/\s+/).filter(Boolean)
  const right = b.split(/\s+/).filter(Boolean)
  const leftKeys = left.map((token) => normalizePhrase(token))
  const rightKeys = right.map((token) => normalizePhrase(token))
  if (leftKeys.some((token) => !token) || rightKeys.some((token) => !token)) return null
  const max = Math.min(leftKeys.length, rightKeys.length) - 1
  for (let size = max; size >= 4; size -= 1) {
    let matched = true
    for (let index = 0; index < size; index += 1) {
      if (leftKeys[leftKeys.length - size + index] !== rightKeys[index]) {
        matched = false
        break
      }
    }
    if (!matched) continue
    const merged = left.concat(right.slice(size))
    if (merged.length > 24) return null
    return merged.join(' ')
  }
  return null
}

function samePages(a: Candidate, b: Candidate): boolean {
  if (a.documentCount !== b.documentCount || a.pages.length !== b.pages.length) return false
  const ids = new Set(a.pages.map((page) => page.sessionId))
  return b.pages.every((page) => ids.has(page.sessionId))
}

function collapseOverlaps(candidates: Candidate[], pages: PreparedPage[]): Candidate[] {
  const linesById = new Map(pages.map((page) => [page.sessionId, page.lines]))
  let current = candidates
  for (let guard = 0; guard < 6; guard += 1) {
    const next: Candidate[] = []
    const used = new Set<number>()
    let changed = false
    for (let index = 0; index < current.length; index += 1) {
      if (used.has(index)) continue
      let item = current[index]
      for (let otherIndex = index + 1; otherIndex < current.length; otherIndex += 1) {
        if (used.has(otherIndex)) continue
        const other = current[otherIndex]
        if (!samePages(item, other)) continue
        const mergedDisplay = tryExtendDisplay(item.phrase, other.phrase) ?? tryExtendDisplay(other.phrase, item.phrase)
        if (!mergedDisplay) continue
        const mergedKey = normalizePhrase(mergedDisplay)
        if (!mergedKey || mergedKey === item.key || mergedKey === other.key) continue
        const present = item.pages.every((page) => linesHavePhrase(linesById.get(page.sessionId) ?? [], mergedKey))
        if (!present) continue
        item = {
          ...item,
          key: mergedKey,
          phrase: mergedDisplay,
          kind: 'phrase'
        }
        used.add(otherIndex)
        changed = true
      }
      next.push(item)
    }
    current = next
    if (!changed) break
  }
  return current
}

function toCandidate(row: Accum, pageCount: number, titles: Map<string, string>): Candidate {
  const pages = [...row.sessions]
    .map((sessionId) => ({ sessionId, title: titles.get(sessionId) || '未命名' }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  return {
    key: row.key,
    phrase: row.phrase,
    kind: row.kind,
    documentCount: row.sessions.size,
    ratio: pageCount > 0 ? row.sessions.size / pageCount : 0,
    pages
  }
}

function findKnownHits(pages: PreparedPage[], rules: IgnoreRule[], pageCount: number): AiTraceHit[] {
  const hits: AiTraceHit[] = []
  const titles = new Map(pages.map((page) => [page.sessionId, page.title]))
  for (const phrase of KNOWN_AI_PHRASES) {
    const key = normalizePhrase(phrase)
    if (!key || ignored(key, rules)) continue
    const matched = pages.filter((page) => linesHavePhrase(page.lines, key))
    if (matched.length < 2) continue
    hits.push({
      phrase,
      kind: 'known',
      documentCount: matched.length,
      ratio: matched.length / pageCount,
      pages: matched
        .map((page) => ({ sessionId: page.sessionId, title: titles.get(page.sessionId) || page.title }))
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    })
  }
  return hits
    .sort((a, b) => b.documentCount - a.documentCount || b.phrase.length - a.phrase.length)
    .slice(0, MAX_KNOWN_HITS)
}

function describeReport(pageCount: number, hits: number, known: number): string {
  if (hits === 0 && known === 0) {
    return `扫描了 ${pageCount} 篇已完成页面，没有达到阈值的重复语句。`
  }
  return `扫描了 ${pageCount} 篇已完成页面，发现 ${hits} 条高频语句、${known} 条已知套话。`
}

export interface CompletedArticle {
  sessionId: string
  title: string
  markdown: string
}

export function listCompletedArticles(sessions: AiTraceSessionInput[]): CompletedArticle[] {
  const articles: CompletedArticle[] = []
  for (const session of sessions) {
    if (!session?.id || session.listStatus !== 'completed') continue
    const article = latestArticle(session)
    if (!article) continue
    articles.push({
      sessionId: session.id,
      title: resolveTitle(session, article),
      markdown: article
    })
  }
  return articles
}

export function scanAiTracePages(
  sessions: AiTraceSessionInput[],
  options?: ScanAiTraceOptions
): AiTraceReport {
  const config = normalizeAiTraceConfig({
    ...DEFAULT_AI_TRACE_CONFIG,
    ...options?.config,
    ignorePhrases: options?.config?.ignorePhrases ?? DEFAULT_AI_TRACE_CONFIG.ignorePhrases
  })
  const rules = buildIgnoreRules(config.ignorePhrases, options?.productNames ?? [])
  const titles = new Map<string, string>()
  const pages: PreparedPage[] = []

  for (const session of sessions) {
    if (!session?.id || session.listStatus !== 'completed') continue
    const article = latestArticle(session)
    if (!article) continue
    const title = resolveTitle(session, article)
    titles.set(session.id, title)
    pages.push({ sessionId: session.id, title, lines: [] })
  }

  const scannedPages = pages
    .map((page) => ({ sessionId: page.sessionId, title: page.title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  const rulesSnapshot: AiTraceReportRules = {
    minCorpusPages: config.minCorpusPages,
    minDocuments: config.minDocuments,
    minRatio: config.minRatio
  }
  const scannedAt = Date.now()

  if (pages.length < config.minCorpusPages) {
    return {
      scannedAt,
      pageCount: pages.length,
      status: 'insufficient',
      message: `已完成成稿只有 ${pages.length} 篇，少于最低样本 ${config.minCorpusPages} 篇，暂不统计。`,
      rules: rulesSnapshot,
      scannedPages,
      hits: [],
      knownHits: []
    }
  }

  const map = new Map<string, Accum>()
  for (const session of sessions) {
    if (!session?.id || session.listStatus !== 'completed') continue
    const page = pages.find((item) => item.sessionId === session.id)
    if (!page) continue
    const article = latestArticle(session)
    if (!article) continue
    for (const sentence of splitSentences(stripMarkdown(article))) {
      absorbSentence(map, sentence, session.id, config, rules, page.lines)
    }
  }

  const knownHits = findKnownHits(pages, rules, pages.length)
  const knownKeys = new Set(knownHits.map((hit) => normalizePhrase(hit.phrase)))
  const candidates = [...map.values()]
    .filter((row) => !knownKeys.has(row.key) && passesThreshold(row.sessions.size, pages.length, config))
    .map((row) => toCandidate(row, pages.length, titles))

  const merged = collapseOverlaps(subsume(candidates), pages)
  const hits = subsume(merged)
    .sort((a, b) => b.documentCount - a.documentCount || b.key.length - a.key.length)
    .slice(0, MAX_FREQUENCY_HITS)
    .map((hit) => ({
      phrase: hit.phrase,
      kind: hit.kind,
      documentCount: hit.documentCount,
      ratio: hit.ratio,
      pages: hit.pages
    }))

  return {
    scannedAt,
    pageCount: pages.length,
    status: 'ok',
    message: describeReport(pages.length, hits.length, knownHits.length),
    rules: rulesSnapshot,
    scannedPages,
    hits,
    knownHits
  }
}
