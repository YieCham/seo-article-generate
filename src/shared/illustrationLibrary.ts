export const ILLUSTRATION_SCHEME = 'illustration'

export const MAX_ILLUSTRATION_PRODUCT_NAME = 80
export const MAX_ILLUSTRATION_URL = 2000
export const MAX_ILLUSTRATION_ALT = 200
export const MAX_ILLUSTRATION_CAPTION = 300
export const MAX_ILLUSTRATION_STEP_KEY = 64
export const MAX_ILLUSTRATION_KEYWORDS = 8
export const MAX_ILLUSTRATION_KEYWORD_CHARS = 32

export interface IllustrationImage {
  id: string
  url: string
  alt: string
  caption: string
  stepKey: string
  matchKeywords: string[]
  createdAt: number
}

export interface IllustrationProduct {
  id: string
  name: string
  images: IllustrationImage[]
}

export interface IllustrationLibrary {
  products: IllustrationProduct[]
}

export const EMPTY_ILLUSTRATION_LIBRARY: IllustrationLibrary = { products: [] }

export function isSafeIllustrationFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(fileName) && !fileName.includes('..')
}

export function toIllustrationSrc(fileName: string): string {
  return `${ILLUSTRATION_SCHEME}://local/${encodeURIComponent(fileName)}`
}

export function illustrationFileNameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== `${ILLUSTRATION_SCHEME}:`) return null
    const fileName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return isSafeIllustrationFileName(fileName) ? fileName : null
  } catch {
    return null
  }
}

export function isAllowedIllustrationUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed || trimmed.length > MAX_ILLUSTRATION_URL) return false
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return true
    if (parsed.protocol === `${ILLUSTRATION_SCHEME}:`) {
      return illustrationFileNameFromUrl(trimmed) !== null
    }
    return false
  } catch {
    return false
  }
}

export function normalizeIllustrationKeywords(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，]/)
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const keyword = String(item).trim().slice(0, MAX_ILLUSTRATION_KEYWORD_CHARS)
    if (!keyword) continue
    const key = keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(keyword)
    if (out.length >= MAX_ILLUSTRATION_KEYWORDS) break
  }
  return out
}

export function formatIllustrationKeywords(keywords: string[]): string {
  return keywords.join('，')
}
