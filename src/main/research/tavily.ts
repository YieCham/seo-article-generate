export interface TavilySearchResult {
  title: string
  link: string
  snippet: string
  position: number
}

interface TavilyResponse {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    score?: number
  }>
  error?: string
}

const REGION_TO_TAVILY_COUNTRY: Record<string, string | undefined> = {
  us: 'united states',
  uk: 'united kingdom',
  cn: 'china',
  jp: 'japan',
  de: 'germany',
  fr: 'france',
  au: 'australia',
  ca: 'canada',
  sg: 'singapore',
  global: undefined
}

export function mapRegionToTavilyCountry(region: string): string | undefined {
  return REGION_TO_TAVILY_COUNTRY[region] ?? REGION_TO_TAVILY_COUNTRY.us
}

export async function searchWeb(
  query: string,
  options: {
    apiKey: string
    num?: number
    region?: string
  }
): Promise<TavilySearchResult[]> {
  const country = mapRegionToTavilyCountry(options.region ?? 'us')
  const body: Record<string, unknown> = {
    query,
    max_results: options.num ?? 8,
    search_depth: 'basic',
    topic: 'general'
  }
  if (country) body.country = country

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Tavily 搜索失败 (${response.status})：${detail.slice(0, 180)}`)
  }

  const data = (await response.json()) as TavilyResponse
  if (data.error) {
    throw new Error(data.error)
  }

  return (data.results ?? [])
    .filter((item) => item.url && item.title)
    .map((item, index) => ({
      title: item.title!,
      link: item.url!,
      snippet: item.content ?? '',
      position: index + 1
    }))
}

export async function testTavilyConnection(
  apiKey: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (!apiKey) return { ok: false, message: '请先填写 Tavily API Key' }
  try {
    const results = await searchWeb('AI writing tools', { apiKey, num: 1, region: 'us' })
    return { ok: true, message: `Tavily 连接成功，返回 ${results.length} 条结果` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Tavily 连接失败' }
  }
}
