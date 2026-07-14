import { chatCompletion, type LlmConfig } from './llmClient'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'

export const META_TITLE_MAX_CHARS = 60
export const META_DESCRIPTION_MAX_CHARS = 160
/** Enough for JSON only; reasoning models may burn budget before the JSON body. */
export const SEO_META_MAX_OUTPUT_TOKENS = 3000
const ARTICLE_SUMMARY_MAX_CHARS = 2200

export interface SeoMetaFields {
  metaTitle: string
  metaDescription: string
}

export const SEO_META_GUIDANCE = `
【SEO Meta — output separate from article body】
- Meta Title: 50–${META_TITLE_MAX_CHARS} characters; primary keyword near the start; compelling and unique; no clickbait.
- Meta Title must be **worded differently** from the article H1 — shorter SERP-style title, not a copy-paste.
- Meta Description: 140–${META_DESCRIPTION_MAX_CHARS} characters; summarize core value, include primary keyword once, end with subtle CTA; no HTML tags.
- Language must match the article (same as topic/article body).
- Do NOT repeat the Meta Title verbatim inside the Meta Description.
- Output **only** one JSON object. No analysis, no markdown fences, no text before or after JSON.
`.trim()

interface MarkdownSection {
  title: string
  body: string
}

function stripLeadingSeoMetaBlock(markdown: string): string {
  if (!/^##\s+SEO Meta/im.test(markdown)) return markdown
  const divider = markdown.indexOf('\n---')
  if (divider >= 0) return markdown.slice(divider + 4).trimStart()
  return markdown
}

function parseMarkdownH2Sections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  let current: MarkdownSection | null = null

  for (const line of markdown.split('\n')) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current)
      current = { title: line.replace(/^##\s+/, '').trim(), body: '' }
      continue
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current) sections.push(current)
  return sections
}

function truncateBlock(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  const slice = trimmed.slice(0, maxChars)
  const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
  return `${(lastBreak > maxChars * 0.55 ? slice.slice(0, lastBreak) : slice).trim()}…`
}

function findSectionBody(sections: MarkdownSection[], patterns: RegExp[]): string {
  const section = sections.find((item) => patterns.some((pattern) => pattern.test(item.title)))
  return section?.body.trim() ?? ''
}

export function extractArticleH1(articleBody: string): string | null {
  const body = stripLeadingSeoMetaBlock(normalizeArticleMarkdown(articleBody.trim()))
  const match = body.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || null
}

function normalizeTitleKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isMetaTitleTooSimilar(metaTitle: string, references: Array<string | null | undefined>): boolean {
  const key = normalizeTitleKey(metaTitle)
  if (!key) return true
  return references.some((reference) => {
    const refKey = normalizeTitleKey(reference ?? '')
    if (!refKey) return false
    return key === refKey
  })
}

/** H1 + key sections only — enough for meta without sending the full article. */
export function buildArticleSummaryForSeoMeta(articleBody: string): string {
  const body = stripLeadingSeoMetaBlock(normalizeArticleMarkdown(articleBody.trim()))
  if (!body) return ''

  const parts: string[] = []
  const h1Match = body.match(/^#\s+(.+)$/m)
  if (h1Match) parts.push(`# ${h1Match[1].trim()}`)

  const sections = parseMarkdownH2Sections(body)
  const sectionPicks: Array<{ patterns: RegExp[]; maxChars: number }> = [
    { patterns: [/quick answer|key takeaways/i], maxChars: 550 },
    { patterns: [/^introduction$/i, /引言|导读/], maxChars: 500 },
    { patterns: [/^overview$/i, /概述|整体介绍/], maxChars: 450 },
    { patterns: [/conclusion/i, /结论|总结/], maxChars: 400 },
    { patterns: [/\bfaqs?\b/i, /frequently asked questions/i, /常见问题/], maxChars: 350 }
  ]

  for (const pick of sectionPicks) {
    const sectionBody = findSectionBody(sections, pick.patterns)
    if (!sectionBody) continue
    const section = sections.find((item) => pick.patterns.some((pattern) => pattern.test(item.title)))
    if (!section) continue
    parts.push(`## ${section.title}\n${truncateBlock(sectionBody, pick.maxChars)}`)
  }

  let summary = parts.join('\n\n').trim()
  if (summary.length < 200) {
    summary = body.slice(0, ARTICLE_SUMMARY_MAX_CHARS)
  }
  return summary.slice(0, ARTICLE_SUMMARY_MAX_CHARS)
}

export function enforceSeoMetaLimits(meta: SeoMetaFields): SeoMetaFields {
  const trimAtWord = (text: string, max: number): string => {
    const trimmed = text.trim()
    if (trimmed.length <= max) return trimmed
    const slice = trimmed.slice(0, max)
    const lastSpace = slice.lastIndexOf(' ')
    return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim()
  }

  return {
    metaTitle: trimAtWord(meta.metaTitle, META_TITLE_MAX_CHARS),
    metaDescription: trimAtWord(meta.metaDescription, META_DESCRIPTION_MAX_CHARS)
  }
}

function decodeJsonString(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim()
}

function parseLooseJsonField(raw: string, keys: string[]): string | null {
  for (const key of keys) {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'))
    if (match?.[1]) return decodeJsonString(match[1]).trim()
  }
  return null
}

export function parseSeoMetaResponse(raw: string): SeoMetaFields | null {
  const stripped = raw
    .replace(/[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim()
  if (!stripped) return null

  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        metaTitle?: string
        metaDescription?: string
        title?: string
        description?: string
      }
      const metaTitle = (parsed.metaTitle ?? parsed.title)?.trim()
      const metaDescription = (parsed.metaDescription ?? parsed.description)?.trim()
      if (metaTitle && metaDescription) {
        return enforceSeoMetaLimits({ metaTitle, metaDescription })
      }
    } catch {
      // fall through to regex extraction (truncated JSON)
    }
  }

  const metaTitle = parseLooseJsonField(stripped, ['metaTitle', 'title'])
  const metaDescription = parseLooseJsonField(stripped, ['metaDescription', 'description'])
  if (!metaTitle || !metaDescription) return null
  return enforceSeoMetaLimits({ metaTitle, metaDescription })
}

export function formatSeoMetaBlock(meta: SeoMetaFields): string {
  return [
    '## SEO Meta',
    '',
    `- **Meta Title:** ${meta.metaTitle}`,
    `- **Meta Description:** ${meta.metaDescription}`,
    '',
    '---',
    ''
  ].join('\n')
}

function buildFallbackSeoMeta(topic: string, articleBody: string, productName?: string): SeoMetaFields {
  const h1 = extractArticleH1(articleBody)
  const keyword = topic.trim()
  const year = new Date().getFullYear()

  let metaTitle = h1 && !isMetaTitleTooSimilar(h1, [keyword]) ? h1 : keyword
  if (isMetaTitleTooSimilar(metaTitle, [keyword, h1])) {
    const productSuffix = productName?.trim() ? ` | ${productName.trim()}` : ''
    metaTitle = `${keyword} — ${year} Guide${productSuffix}`
  }

  const descriptionBase = h1 && !isMetaTitleTooSimilar(h1, [keyword]) ? h1 : keyword
  const metaDescription = `Learn ${descriptionBase.toLowerCase()}. Read our guide for practical tips, steps, and expert insights.`

  return enforceSeoMetaLimits({ metaTitle, metaDescription })
}

interface ArticleLanguageContext {
  label: string
  lock: string
}

function buildSeoMetaUserPrompt(options: {
  topic: string
  articleH1: string | null
  articleSummary: string
  articleLang: ArticleLanguageContext
  productName?: string
  strict?: boolean
}): string {
  const { topic, articleH1, articleSummary, articleLang, productName, strict } = options
  return [
    `Primary keyword context (for wording — **do not** paste unchanged as meta title): ${topic}`,
    articleH1 ? `Article H1 (must **not** copy verbatim): ${articleH1}` : '',
    productName ? `Product to reflect when relevant: ${productName}` : '',
  strict
      ? 'Your previous meta title duplicated the keyword/H1. Rewrite with distinct SERP wording while keeping the keyword.'
      : '',
    '',
    'Write ONE Meta Title and ONE Meta Description based on the article summary.',
    `Output language: ${articleLang.label}`,
    `Meta Title ≤ ${META_TITLE_MAX_CHARS} characters; Meta Description ≤ ${META_DESCRIPTION_MAX_CHARS} characters.`,
    'Return ONLY valid JSON: {"metaTitle":"...","metaDescription":"..."}',
    '',
    '--- Article summary ---',
    articleSummary
  ]
    .filter(Boolean)
    .join('\n')
}

async function requestSeoMeta(
  llm: LlmConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>
): Promise<string> {
  return chatCompletion(llm, messages, {
    temperature: 0.25,
    maxTokens: SEO_META_MAX_OUTPUT_TOKENS,
    jsonObject: true,
    step: 'meta',
    label: 'SEO Meta'
  })
}

export async function generateSeoMeta(
  llm: LlmConfig,
  topic: string,
  articleBody: string,
  articleLang: ArticleLanguageContext,
  productName?: string
): Promise<SeoMetaFields> {
  const articleSummary = buildArticleSummaryForSeoMeta(articleBody)
  const articleH1 = extractArticleH1(articleBody)

  const systemContent = [
    'You are an SEO specialist writing page meta tags for search engines (Google).',
    articleLang.lock,
    SEO_META_GUIDANCE
  ].join('\n\n')

  const raw = await requestSeoMeta(llm, [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: buildSeoMetaUserPrompt({
        topic,
        articleH1,
        articleSummary,
        articleLang,
        productName
      })
    }
  ])

  let parsed = parseSeoMetaResponse(raw)
  if (parsed && isMetaTitleTooSimilar(parsed.metaTitle, [topic, articleH1])) {
    parsed = null
  }

  if (!parsed) {
    const retryRaw = await requestSeoMeta(llm, [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: buildSeoMetaUserPrompt({
          topic,
          articleH1,
          articleSummary,
          articleLang,
          productName,
          strict: true
        })
      }
    ])
    parsed = parseSeoMetaResponse(retryRaw)
    if (parsed && isMetaTitleTooSimilar(parsed.metaTitle, [topic, articleH1])) {
      parsed = null
    }
  }

  if (parsed) return parsed

  return buildFallbackSeoMeta(topic, articleBody, productName)
}
