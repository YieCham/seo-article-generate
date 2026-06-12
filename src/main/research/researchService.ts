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

const SKIP_HOST_PATTERN = /(?:youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com\/posts)/i

function filterSearchResults(results: TavilySearchResult[]): TavilySearchResult[] {
  return results.filter((item) => {
    try {
      const host = new URL(item.link).hostname
      return !SKIP_HOST_PATTERN.test(host)
    } catch {
      return false
    }
  })
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

export async function searchWithQueries(
  queries: string[],
  config: ResearchConfig,
  onProgress: (event: ResearchProgress) => void
): Promise<ResearchSource[]> {
  const perQuery = Math.max(3, Math.ceil(config.maxSearchResults / queries.length))
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

  const filtered = dedupeResults(filterSearchResults(merged)).slice(0, config.maxSearchResults)
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
  extras?: { extractedPreview?: string; outlinePreview?: string }
): string {
  const lines = [
    `**主题：** ${topic}`,
    `**市场 / 语言：** ${getRegionLabel(config.searchRegion)} · ${getLanguageLabel(config.searchLanguage)}`,
    '',
    '**① 意图扩展（搜索词）：**',
    ...queries.map((q) => `- ${q}`),
    '',
    '**② 搜索与抓取来源：**',
    ...sources.map(
      (item) =>
        `- [#${item.position}] [${item.title}](${item.url})${item.scrapeError ? ' _(抓取失败)_' : item.markdown ? ' ✓' : ''}`
    )
  ]

  if (extras?.extractedPreview) {
    lines.push('', '**③ E-E-A-T 萃取摘要：**', extras.extractedPreview.slice(0, 600))
  }
  if (extras?.outlinePreview) {
    lines.push('', '**④ 差异化大纲：**', '```', extras.outlinePreview.slice(0, 800), '```')
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
