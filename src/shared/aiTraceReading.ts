import type {
  AiTraceCounterexample,
  AiTracePattern,
  AiTracePatternVerdict,
  AiTraceQuote
} from './aiTrace'

const EXCERPT_MAX_CHARS = 1800
const MIN_QUOTE_CHARS = 12

export interface ArticleExcerpt {
  sessionId: string
  title: string
  markdown: string
  excerpt: string
  plain: string
}

export function normalizeMatchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function paragraphsOf(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 20 && !/^#{1,6}\s/.test(part))
}

/** Opening paragraphs, first paragraph under each content heading, and the closing paragraphs. */
export function buildArticleExcerpt(markdown: string, maxChars = EXCERPT_MAX_CHARS): string {
  const cleaned = markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/^##\s+SEO Meta\s*\n[\s\S]*?\n---\s*\n?/im, '')

  const chunks = cleaned.split(/^(#{2,3} .+)$/m)
  const opening: string[] = []
  const sections: string[] = []
  const contentParas: string[] = []

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? ''
    const heading = /^#{2,3}\s+/.test(chunk.trim()) ? chunk.trim() : ''
    const body = heading ? (chunks[index + 1] ?? '') : chunk
    if (heading) index += 1
    const paras = paragraphsOf(body)
    const structural = /faq|conclusion|seo meta|key takeaways|quick answer|常见问题|总结/i.test(heading)
    if (!structural) contentParas.push(...paras)
    if (!heading) {
      opening.push(...paras.slice(0, 2))
      continue
    }
    if (structural) continue
    const first = paras[0]
    if (first) sections.push(`${heading}\n${first}`)
  }

  const closing = contentParas.slice(-2)
  const openingText = opening.join('\n\n')
  const keptSections: string[] = []
  let used = openingText.length
  for (const section of sections) {
    if (used + section.length + 4 > maxChars) break
    keptSections.push(section)
    used += section.length + 4
  }
  const shown = new Set(opening)
  for (const section of keptSections) {
    const body = section.split('\n').slice(1).join('\n').trim()
    if (body) shown.add(body)
  }
  const closingText = closing.filter((para) => !shown.has(para)).join('\n\n')

  const parts = [openingText, ...keptSections, closingText].map((part) => part.trim()).filter(Boolean)
  let excerpt = parts.join('\n\n').trim()
  if (excerpt.length > maxChars) excerpt = excerpt.slice(0, maxChars).trim()
  if (excerpt.length >= 40) return excerpt

  const fallback = contentParas.join('\n\n').slice(0, maxChars).trim()
  return fallback || cleaned.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}

export function quoteAnchoredInText(quote: string, plain: string): boolean {
  const normalizedQuote = normalizeMatchText(quote)
  const normalizedPlain = normalizeMatchText(plain)
  if (normalizedQuote.length < MIN_QUOTE_CHARS || !normalizedPlain) return false
  if (normalizedPlain.includes(normalizedQuote)) return true

  const tokens = normalizedQuote.split(' ').filter(Boolean)
  if (tokens.length >= 6) {
    for (let index = 0; index + 6 <= tokens.length; index += 1) {
      const window = tokens.slice(index, index + 6).join(' ')
      if (window.length >= MIN_QUOTE_CHARS && normalizedPlain.includes(window)) return true
    }
  }

  const compactQuote = normalizedQuote.replace(/\s/g, '')
  const compactPlain = normalizedPlain.replace(/\s/g, '')
  if (/[\u4e00-\u9fff]/.test(compactQuote) && compactQuote.length >= 8) {
    for (let index = 0; index + 8 <= compactQuote.length; index += 1) {
      if (compactPlain.includes(compactQuote.slice(index, index + 8))) return true
    }
  }
  return false
}

/** A verification quote that only repeats a discovery quote is not new evidence. */
export function quoteRepeatsDiscovery(quote: string, discoveryQuotes: string[]): boolean {
  const normalized = normalizeMatchText(quote)
  if (normalized.length < MIN_QUOTE_CHARS) return false
  return discoveryQuotes.some((existing) => {
    const other = normalizeMatchText(existing)
    if (other.length < MIN_QUOTE_CHARS) return false
    const shorter = normalized.length < other.length ? normalized : other
    return shorter.length >= MIN_QUOTE_CHARS && (normalized.includes(other) || other.includes(normalized))
  })
}

export interface JudgePatternInput {
  name: string
  why: string
  suggestion: string
  discoveryQuotes: AiTraceQuote[]
  support: AiTraceQuote[]
  counterexamples: AiTraceCounterexample[]
  checkedCount: number
  minDocuments: number
  minRatio: number
}

export function judgePattern(input: JudgePatternInput): AiTracePattern {
  const supportIds = new Set(input.support.map((item) => item.sessionId))
  const supportCount = supportIds.size
  const checkedCount = Math.max(0, input.checkedCount)
  const ratio = checkedCount > 0 ? supportCount / checkedCount : 0
  const newQuoteCount = input.support.length
  const meetsThreshold =
    supportCount >= input.minDocuments && ratio >= input.minRatio - 1e-9 && newQuoteCount >= 2
  const fullCoverage = checkedCount > 0 && supportCount === checkedCount
  const majorityAbsent = input.counterexamples.length > supportCount
  let verdict: AiTracePatternVerdict = 'partial'

  if (newQuoteCount === 0) {
    verdict = 'rejected'
  } else if (majorityAbsent && !meetsThreshold) {
    verdict = 'rejected'
  } else if (meetsThreshold && (input.counterexamples.length > 0 || fullCoverage)) {
    verdict = 'universal'
  } else if (meetsThreshold) {
    verdict = 'insufficient'
  }

  return {
    name: input.name,
    why: input.why,
    suggestion: input.suggestion,
    verdict,
    supportCount,
    checkedCount,
    ratio,
    support: input.support,
    counterexamples: input.counterexamples,
    discoveryQuotes: input.discoveryQuotes
  }
}

export function describeReading(patterns: AiTracePattern[], holdout: boolean, discoveryCount: number, verifyCount: number): string {
  const universal = patterns.filter((item) => item.verdict === 'universal').length
  const partial = patterns.filter((item) => item.verdict === 'partial').length
  const insufficient = patterns.filter((item) => item.verdict === 'insufficient').length
  const rejected = patterns.filter((item) => item.verdict === 'rejected').length
  const split = holdout
    ? '复核用了没有参与发现的页面。'
    : '样本不够分成两批，复核重读了同一批页面，只采纳第一轮没有引用过的新原句。'
  return `模型读了发现阶段 ${discoveryCount} 篇、复核阶段 ${verifyCount} 篇。${split}普遍 ${universal} 条，部分成立 ${partial} 条，证据不足 ${insufficient} 条，不成立 ${rejected} 条。`
}
