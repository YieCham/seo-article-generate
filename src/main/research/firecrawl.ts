interface FirecrawlScrapeResponse {
  success?: boolean
  data?: {
    markdown?: string
    metadata?: {
      title?: string
      description?: string
      sourceURL?: string
    }
  }
  error?: string
}

export interface ScrapedPage {
  url: string
  title: string
  markdown: string
}

const DEFAULT_MAX_MARKDOWN_CHARS = 6000
export const OPTIMIZE_MAX_MARKDOWN_CHARS = 28000

/** Remove WordPress comment blocks and other CMS footer noise before section parsing. */
export function stripScrapedMarkdownJunk(markdown: string): string {
  let text = markdown.trim()
  if (!text) return text

  const cutPatterns = [
    /(?:^|\n)#{1,2}\s+Leave a Reply\b/im,
    /(?:^|\n)#{1,2}\s+Related Posts?\b/im,
    /(?:^|\n)#{1,2}\s+You May Also Like\b/im,
    /(?:^|\n)#{1,2}\s+Comments?\s*$/im
  ]

  let cutAt = -1
  for (const pattern of cutPatterns) {
    const match = pattern.exec(text)
    if (match && match.index >= 0) {
      if (cutAt < 0 || match.index < cutAt) cutAt = match.index
    }
  }

  if (cutAt >= 0 && cutAt > text.length * 0.25) {
    text = text.slice(0, cutAt).trimEnd()
  }

  return text
}

function truncateMarkdown(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n…（内容已截断）`
}

export async function scrapeToMarkdown(
  url: string,
  apiKey: string,
  maxChars = DEFAULT_MAX_MARKDOWN_CHARS
): Promise<ScrapedPage> {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true
    })
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Firecrawl 抓取失败 (${response.status})：${detail.slice(0, 180)}`)
  }

  const payload = (await response.json()) as FirecrawlScrapeResponse
  if (!payload.success || !payload.data?.markdown) {
    throw new Error(payload.error ?? 'Firecrawl 未返回 Markdown 内容')
  }

  return {
    url,
    title: payload.data.metadata?.title ?? url,
    markdown: truncateMarkdown(stripScrapedMarkdownJunk(payload.data.markdown.trim()), maxChars)
  }
}

export async function testFirecrawlConnection(
  apiKey: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (!apiKey) return { ok: false, message: '请先填写 Firecrawl API Key' }
  try {
    await scrapeToMarkdown('https://example.com', apiKey)
    return { ok: true, message: 'Firecrawl 连接成功' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Firecrawl 连接失败' }
  }
}
