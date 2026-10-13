import { gunzipSync } from 'zlib'
import { normalizeSiteUrl } from '../../shared/wordpress'
import {
  MAX_INTERNAL_LINKS,
  decodeXmlEntities,
  isArticleLikeUrl,
  parseUrlFilterPatterns,
  shouldFollowChildSitemap,
  slugFromUrl,
  titleFromSlug,
  urlMatchesFilters,
  type InternalLinkCatalog,
  type InternalLinkDoc,
  type InternalLinkUrlFilter
} from '../../shared/internalLinks'
import { saveInternalLinkCatalog } from './internalLinkStore'

const FETCH_TIMEOUT_MS = 45_000
const TITLE_TIMEOUT_MS = 8_000
const TITLE_CONCURRENCY = 6
const MAX_TITLE_ENRICH = 400
const MAX_CHILD_SITEMAPS = 40
const USER_AGENT = 'AIWritingAssistant/0.1 (SitemapImport)'

export interface ImportInternalLinksInput {
  productId: string
  productName?: string
  siteUrl: string
  sitemapUrl?: string
  includePatterns?: string[] | string
  excludePatterns?: string[] | string
}

export interface ImportInternalLinksResult {
  ok: boolean
  message?: string
  productId: string
  productName?: string
  siteUrl: string
  sitemapUrl?: string
  count: number
  truncated?: boolean
  includePatterns?: string[]
  excludePatterns?: string[]
  importedAt: number
}

function defaultSitemapCandidates(siteUrl: string): string[] {
  const base = normalizeSiteUrl(siteUrl)
  if (!base) return []
  return [`${base}/sitemap_index.xml`, `${base}/sitemap.xml`, `${base}/wp-sitemap.xml`]
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,text/html;q=0.8,*/*;q=0.5' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

function maybeGunzip(url: string, buffer: Buffer, encoding: string | null): string {
  const looksGzip =
    /gzip/i.test(encoding ?? '') || /\.gz$/i.test(url) || buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b
  if (!looksGzip) return buffer.toString('utf-8')
  try {
    return gunzipSync(buffer).toString('utf-8')
  } catch {
    return buffer.toString('utf-8')
  }
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const response = await fetchWithTimeout(url, timeoutMs)
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})：${url}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  return maybeGunzip(url, buffer, response.headers.get('content-encoding'))
}

interface SitemapLoc {
  loc: string
  lastmod?: string
}

function locFromBlock(block: string): SitemapLoc | null {
  const locMatch = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)
  if (!locMatch?.[1]) return null
  const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1]?.trim()
  return { loc: decodeXmlEntities(locMatch[1]), lastmod: lastmod ? decodeXmlEntities(lastmod) : undefined }
}

function extractLocs(xml: string): SitemapLoc[] {
  const urlBlocks = xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? []
  if (urlBlocks.length > 0) {
    return urlBlocks.map(locFromBlock).filter((item): item is SitemapLoc => Boolean(item))
  }
  const sitemapBlocks = xml.match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) ?? []
  if (sitemapBlocks.length > 0) {
    return sitemapBlocks.map(locFromBlock).filter((item): item is SitemapLoc => Boolean(item))
  }
  const loose: SitemapLoc[] = []
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    loose.push({ loc: decodeXmlEntities(match[1]) })
  }
  return loose
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml)
}

async function collectSitemapLocs(startUrl: string): Promise<{ sitemapUrl: string; locs: SitemapLoc[] }> {
  const xml = await fetchText(startUrl)
  if (!isSitemapIndex(xml)) {
    return { sitemapUrl: startUrl, locs: extractLocs(xml) }
  }

  const children = extractLocs(xml)
    .map((item) => item.loc)
    .filter((loc) => shouldFollowChildSitemap(loc))
    .slice(0, MAX_CHILD_SITEMAPS)

  const locs: SitemapLoc[] = []
  const seen = new Set<string>()
  for (const child of children) {
    try {
      const childXml = await fetchText(child)
      const nested = extractLocs(childXml)
      const articleEntries: SitemapLoc[] = isSitemapIndex(childXml) ? [] : nested
      if (isSitemapIndex(childXml)) {
        for (const nestedSitemap of nested.slice(0, MAX_CHILD_SITEMAPS)) {
          if (!shouldFollowChildSitemap(nestedSitemap.loc)) continue
          try {
            const innerXml = await fetchText(nestedSitemap.loc)
            articleEntries.push(...extractLocs(innerXml))
          } catch {
            // skip nested sitemap
          }
        }
      }
      for (const entry of articleEntries) {
        const key = entry.loc.replace(/\/+$/, '').toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        locs.push(entry)
      }
    } catch {
      // skip unreadable child sitemaps
    }
  }
  return { sitemapUrl: startUrl, locs }
}

function extractHtmlTitle(html: string): string {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
  const raw = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  if (!raw) return ''
  let title = decodeXmlEntities(raw).replace(/\s+/g, ' ').trim()
  if (title.includes(' | ')) {
    const left = title.split(' | ')[0]?.trim() ?? ''
    if (left.length >= 8) title = left
  }
  return title.slice(0, 180)
}

async function enrichTitles(docs: InternalLinkDoc[]): Promise<void> {
  const targets = [...docs]
    .sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''))
    .slice(0, MAX_TITLE_ENRICH)
  let index = 0
  async function worker(): Promise<void> {
    while (index < targets.length) {
      const current = index
      index += 1
      const doc = targets[current]
      try {
        const html = await fetchText(doc.url, TITLE_TIMEOUT_MS)
        const title = extractHtmlTitle(html.slice(0, 80_000))
        if (title) doc.title = title
      } catch {
        // keep slug title
      }
    }
  }
  const workers = Array.from({ length: Math.min(TITLE_CONCURRENCY, targets.length) }, () => worker())
  await Promise.all(workers)
}

function toDocs(
  siteUrl: string,
  locs: SitemapLoc[],
  filter: InternalLinkUrlFilter
): { documents: InternalLinkDoc[]; truncated: boolean } {
  const seen = new Set<string>()
  const documents: InternalLinkDoc[] = []
  for (const entry of locs) {
    if (!isArticleLikeUrl(entry.loc, siteUrl)) continue
    if (!urlMatchesFilters(entry.loc, filter)) continue
    const url = entry.loc.replace(/\/+$/, '')
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const slug = slugFromUrl(url)
    documents.push({
      siteUrl,
      url,
      slug,
      title: titleFromSlug(slug),
      lastmod: entry.lastmod
    })
    if (documents.length >= MAX_INTERNAL_LINKS) {
      return { documents, truncated: true }
    }
  }
  return { documents, truncated: false }
}

export async function importInternalLinksFromSitemap(
  input: ImportInternalLinksInput
): Promise<ImportInternalLinksResult> {
  const productId = input.productId?.trim()
  if (!productId) {
    throw new Error('请先选择产品')
  }
  const productName = input.productName?.trim() || undefined

  const siteUrl = normalizeSiteUrl(input.siteUrl)
  if (!siteUrl) {
    throw new Error('请先填写站点地址')
  }

  const filter: InternalLinkUrlFilter = {
    includePatterns: parseUrlFilterPatterns(input.includePatterns),
    excludePatterns: parseUrlFilterPatterns(input.excludePatterns)
  }

  const candidates = input.sitemapUrl?.trim()
    ? [input.sitemapUrl.trim()]
    : defaultSitemapCandidates(siteUrl)

  let lastError = '未找到可用的 Sitemap'
  for (const candidate of candidates) {
    try {
      const { sitemapUrl, locs } = await collectSitemapLocs(candidate)
      const { documents, truncated } = toDocs(siteUrl, locs, filter)
      if (documents.length === 0) {
        lastError =
          filter.includePatterns.length > 0 || filter.excludePatterns.length > 0
            ? '没有符合 URL 筛选条件的文章'
            : 'Sitemap 中没有可导入的文章 URL'
        continue
      }
      await enrichTitles(documents)
      const catalog: InternalLinkCatalog = {
        productId,
        productName,
        siteUrl,
        sitemapUrl,
        importedAt: Date.now(),
        truncated,
        includePatterns: filter.includePatterns,
        excludePatterns: filter.excludePatterns,
        documents
      }
      await saveInternalLinkCatalog(catalog)
      return {
        ok: true,
        productId,
        productName,
        siteUrl,
        sitemapUrl,
        count: documents.length,
        truncated,
        includePatterns: filter.includePatterns,
        excludePatterns: filter.excludePatterns,
        importedAt: catalog.importedAt,
        message: truncated
          ? `已导入 ${documents.length} 篇（已达 ${MAX_INTERNAL_LINKS} 条上限）`
          : `已导入 ${documents.length} 篇站内文章`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError
    }
  }

  throw new Error(lastError)
}
