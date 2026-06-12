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

const MAX_MARKDOWN_CHARS = 6000

function truncateMarkdown(text: string): string {
  if (text.length <= MAX_MARKDOWN_CHARS) return text
  return `${text.slice(0, MAX_MARKDOWN_CHARS)}\n\n…（内容已截断）`
}

export async function scrapeToMarkdown(url: string, apiKey: string): Promise<ScrapedPage> {
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
    markdown: truncateMarkdown(payload.data.markdown.trim())
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
