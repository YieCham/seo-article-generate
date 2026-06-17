import type { ResearchConfig } from '../config/types'
import { scrapeToMarkdown } from './firecrawl'
import { getLanguageLabel, getRegionLabel } from './localeOptions'
import { searchWeb, type TavilySearchResult } from './tavily'

export interface ResearchSource {
  title: string
  url: string
  snippet: string
  position: number
  query?: string
  markdown?: string
  scrapeError?: string
}

export interface ResearchProgress {
  phase: 'expand' | 'search' | 'scrape' | 'summarize'
  message: string
  url?: string
  queries?: string[]
  sources?: ResearchSource[]
}

const BLOCKED_HOST_PATTERN =
  /(?:youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|linkedin\.com\/posts|spotify\.com|audiomack\.com|soundcloud\.com|tidal\.com|deezer\.com|pandora\.com|genius\.com|music\.apple\.com)/i

const LOW_VALUE_PATH_PATTERN = /\/(?:playlist|track|album|song|artist|listen|episode)\b/i

const ARTICLE_SIGNAL_PATTERN =
  /(?:how\s+to|guide|tutorial|step[\s-]by[\s-]step|tips|ways?\s+to|walkthrough|explained|blog)/i

const ARTICLE_PATH_PATTERN = /\/(?:blog|article|guides?|how-to|posts?|tutorials?|learn)\b/i

const STREAMING_PAGE_PATTERN =
  /(?:listen\s+on|stream\s+now|official\s+(?:anthem|video|audio)|play\s+on\s+spotify|playlist\s*·|teams?\s+up\s+for|unite\s+on)/i

function scoreSearchResult(item: TavilySearchResult): number {
  let score = 10
  const url = item.link.toLowerCase()
  const title = item.title.toLowerCase()
  const snippet = (item.snippet ?? '').toLowerCase()
  const combined = `${title} ${snippet}`

  if (ARTICLE_SIGNAL_PATTERN.test(combined)) score += 15
  if (ARTICLE_PATH_PATTERN.test(url)) score += 12
  if (snippet.length > 180) score += 5
  if (LOW_VALUE_PATH_PATTERN.test(url)) score -= 20
  if (STREAMING_PAGE_PATTERN.test(combined)) score -= 15
  if (/community\./i.test(url)) score -= 10

  return score
}

function filterAndRankSearchResults(results: TavilySearchResult[]): TavilySearchResult[] {
  const filtered = results.filter((item) => {
    try {
      const host = new URL(item.link).hostname
      return !BLOCKED_HOST_PATTERN.test(host)
    } catch {
      return false
    }
  })

  return filtered.sort((a, b) => scoreSearchResult(b) - scoreSearchResult(a))
}

function dedupeResults(allResults: TavilySearchResult[]): TavilySearchResult[] {
  const seen = new Map<string, TavilySearchResult>()
  for (const item of allResults) {
    const key = item.link.replace(/\/$/, '').toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, item)
    }
  }
  return [...seen.values()]
}

function normalizeUrlKey(url: string): string {
  try {
    return new URL(url).href.replace(/\/$/, '').toLowerCase()
  } catch {
    return url.replace(/\/$/, '').toLowerCase()
  }
}

export async function searchWithQueries(
  queries: string[],
  config: ResearchConfig,
  onProgress: (event: ResearchProgress) => void,
  options?: { excludeUrls?: string[] }
): Promise<ResearchSource[]> {
  const exclude = new Set((options?.excludeUrls ?? []).map(normalizeUrlKey))
  // Fetch extra candidates so blog/how-to pages survive filtering and ranking.
  const perQuery = Math.min(20, Math.max(5, Math.ceil((config.maxSearchResults * 2) / queries.length)))
  const merged: TavilySearchResult[] = []

  for (const query of queries) {
    onProgress({
      phase: 'search',
      message: `Tavily 搜索：${query}`,
      queries
    })
    const results = await searchWeb(query, {
      apiKey: config.tavilyApiKey,
      num: perQuery,
      region: config.searchRegion
    })
    merged.push(...results.map((item) => ({ ...item, position: merged.length + 1 })))
  }

  const filtered = dedupeResults(filterAndRankSearchResults(merged))
    .filter((item) => !exclude.has(normalizeUrlKey(item.link)))
    .slice(0, config.maxSearchResults)
  if (filtered.length === 0) {
    throw new Error('未找到可用的搜索结果，请尝试更换主题或搜索参数。')
  }

  const sources: ResearchSource[] = filtered.map((item, index) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    position: index + 1
  }))

  onProgress({
    phase: 'search',
    message: `已收集 ${sources.length} 个候选 URL，开始抓取正文…`,
    queries,
    sources
  })

  const scrapeLimit = Math.min(config.maxPagesToScrape, sources.length)
  for (let i = 0; i < scrapeLimit; i += 1) {
    const source = sources[i]
    onProgress({
      phase: 'scrape',
      message: `Firecrawl 抓取 (${i + 1}/${scrapeLimit})：${source.title}`,
      url: source.url,
      queries,
      sources
    })

    try {
      const page = await scrapeToMarkdown(source.url, config.firecrawlApiKey)
      source.markdown = page.markdown
      if (page.title) source.title = page.title
    } catch (error) {
      source.scrapeError = error instanceof Error ? error.message : '抓取失败'
    }
  }

  onProgress({ phase: 'summarize', message: '搜索与抓取完成', queries, sources })
  return sources
}

export function buildResearchDisplayMarkdown(
  topic: string,
  queries: string[],
  sources: ResearchSource[],
  config: ResearchConfig,
  extras?: { intentSummary?: string; extractedPreview?: string; outlinePreview?: string }
): string {
  const lines = [
    `**主题：** ${topic}`,
    `**市场 / 语言：** ${getRegionLabel(config.searchRegion)} · ${getLanguageLabel(config.searchLanguage)}`,
    ''
  ]

  if (extras?.intentSummary) {
    lines.push('**⓪ 搜索意图分析：**', extras.intentSummary, '')
  }

  lines.push(
    '**① 意图扩展（搜索词）：**',
    ...queries.map((q) => `- ${q}`),
    '',
    '**② 搜索与抓取来源：**',
    ...sources.map(
      (item) =>
        `- [#${item.position}] [${item.title}](${item.url})${item.scrapeError ? ' _(抓取失败)_' : item.markdown ? ' ✓' : ''}`
    )
  )

  if (extras?.extractedPreview) {
    lines.push('', '**③ E-E-A-T 萃取摘要：**', extras.extractedPreview)
  }
  if (extras?.outlinePreview) {
    lines.push('', '**④ 差异化大纲：**', '```markdown', extras.outlinePreview, '```')
  }

  return lines.join('\n')
}

export function canRunResearch(config: ResearchConfig): boolean {
  return config.enabled && Boolean(config.tavilyApiKey.trim()) && Boolean(config.firecrawlApiKey.trim())
}

export function buildScrapedCorpus(sources: ResearchSource[], maxChars = 48000): string {
  const parts: string[] = []
  let total = 0

  for (const source of sources) {
    if (!source.markdown) continue
    const block = [
      `## ${source.title}`,
      `URL: ${source.url}`,
      '',
      source.markdown
    ].join('\n')
    if (total + block.length > maxChars) {
      parts.push(`${block.slice(0, maxChars - total)}\n\n…（内容已截断）`)
      break
    }
    parts.push(block)
    total += block.length
  }

  return parts.join('\n\n---\n\n')
}
