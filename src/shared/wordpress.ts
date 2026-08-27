import { markdownToHtml } from './markdownToHtml'
import { normalizeArticleMarkdown } from './normalizeArticleMarkdown'

export type WordPressSeoPlugin = 'none' | 'yoast' | 'rankmath'

/** Connection + defaults for one WordPress site. */
export interface WordPressPreset {
  id: string
  name: string
  siteUrl: string
  username: string
  applicationPassword: string
  seoPlugin: WordPressSeoPlugin
  defaultCategoryIds: number[]
  defaultTagIds: number[]
}

/** @deprecated use WordPressPreset — kept as alias for call sites that mean “one site config”. */
export type WordPressConfig = WordPressPreset

export interface WordPressSettings {
  presets: WordPressPreset[]
  activePresetId: string
}

export const DEFAULT_WORDPRESS_PRESET_ID = 'wp-preset-default'

export function createDefaultWordPressPreset(
  partial?: Partial<WordPressPreset> | null
): WordPressPreset {
  return {
    id:
      typeof partial?.id === 'string' && partial.id.trim()
        ? partial.id.trim()
        : DEFAULT_WORDPRESS_PRESET_ID,
    name:
      typeof partial?.name === 'string' && partial.name.trim()
        ? partial.name.trim()
        : '默认站点',
    siteUrl: typeof partial?.siteUrl === 'string' ? partial.siteUrl.trim() : '',
    username: typeof partial?.username === 'string' ? partial.username.trim() : '',
    applicationPassword:
      typeof partial?.applicationPassword === 'string' ? partial.applicationPassword : '',
    seoPlugin: isWordPressSeoPlugin(partial?.seoPlugin) ? partial.seoPlugin : 'none',
    defaultCategoryIds: normalizeIdList(partial?.defaultCategoryIds),
    defaultTagIds: normalizeIdList(partial?.defaultTagIds)
  }
}

export const DEFAULT_WORDPRESS: WordPressPreset = createDefaultWordPressPreset()

export const DEFAULT_WORDPRESS_SETTINGS: WordPressSettings = {
  presets: [createDefaultWordPressPreset()],
  activePresetId: DEFAULT_WORDPRESS_PRESET_ID
}

export const WORDPRESS_SEO_PLUGIN_OPTIONS: Array<{
  value: WordPressSeoPlugin
  label: string
  hint: string
}> = [
  { value: 'none', label: '无', hint: '只写入文章标题与摘要，不写 SEO 插件字段' },
  { value: 'yoast', label: 'Yoast SEO', hint: '尝试写入 Yoast 的 SEO 标题与描述' },
  { value: 'rankmath', label: 'Rank Math', hint: '尝试写入 Rank Math 的 SEO 标题与描述' }
]

export interface WordPressDraftBinding {
  postId: number
  siteUrl: string
  editLink: string
  link?: string
  slug?: string
  title?: string
  featuredMediaId?: number
  presetId?: string
  updatedAt: number
}

export interface WordPressTerm {
  id: number
  name: string
  slug: string
  count?: number
}

export interface WordPressTestResult {
  ok: boolean
  message?: string
  siteName?: string
  userName?: string
  roles?: string[]
}

export interface WordPressTermsResult {
  ok: boolean
  message?: string
  categories: WordPressTerm[]
  tags: WordPressTerm[]
}

export interface WordPressPublishRequest {
  sessionId: string
  sessionTitle?: string
  markdown: string
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  categoryIds: number[]
  tagIds: number[]
  tagNamesToCreate?: string[]
  featuredImageFileName?: string | null
  existingPostId?: number | null
  forceNew?: boolean
  /** Which saved WordPress preset to publish with; defaults to active preset. */
  presetId?: string | null
}

export interface WordPressPublishResult {
  ok: boolean
  message?: string
  warning?: string
  created: boolean
  postId?: number
  editLink?: string
  link?: string
  slug?: string
  featuredMediaId?: number
  binding?: WordPressDraftBinding
}

export interface WordPressPublishLogRecord {
  id: string
  timestamp: number
  ok: boolean
  created: boolean
  sessionId: string
  sessionTitle?: string
  title: string
  slug?: string
  postId?: number
  siteUrl: string
  editLink?: string
  featuredMediaId?: number
  presetId?: string
  presetName?: string
  message: string
}

export interface ParsedWordPressArticle {
  title: string
  slug: string
  bodyMarkdown: string
  contentHtml: string
  metaTitle: string
  metaDescription: string
}

const SEO_META_BLOCK_RE = /^##\s+SEO Meta\s*\n([\s\S]*?)\n---\s*\n?/i

function normalizeIdList(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is number => typeof item === 'number' && item > 0))]
    : []
}

export function isWordPressConfigured(
  config?: Pick<WordPressPreset, 'siteUrl' | 'username' | 'applicationPassword'> | null
): boolean {
  return Boolean(
    config?.siteUrl?.trim() && config.username?.trim() && config.applicationPassword?.trim()
  )
}

export function normalizeSiteUrl(raw: string): string {
  let url = raw.trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    let path = parsed.pathname.replace(/\/+$/, '')
    path = path.replace(/\/wp-admin$/i, '')
    path = path.replace(/\/wp-login\.php$/i, '')
    path = path.replace(/\/wp-json$/i, '')
    path = path.replace(/\/index\.php$/i, '')
    parsed.pathname = path
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return url.replace(/\/+$/, '')
  }
}

export function wordpressEditLink(siteUrl: string, postId: number): string {
  const base = normalizeSiteUrl(siteUrl)
  return `${base}/wp-admin/post.php?post=${postId}&action=edit`
}

export function slugifyTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return 'draft'
  const slug = trimmed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
  return slug || 'draft'
}

export function stripSeoMetaBlock(markdown: string): string {
  return markdown.replace(SEO_META_BLOCK_RE, '').trimStart()
}

export function parseSeoMetaFromMarkdown(markdown: string): {
  metaTitle: string
  metaDescription: string
} | null {
  const match = markdown.match(SEO_META_BLOCK_RE)
  if (!match) return null
  const block = match[1]
  const metaTitle = block.match(/\*\*Meta Title:\*\*\s*(.+)/i)?.[1]?.trim() ?? ''
  const metaDescription = block.match(/\*\*Meta Description:\*\*\s*(.+)/i)?.[1]?.trim() ?? ''
  if (!metaTitle && !metaDescription) return null
  return { metaTitle, metaDescription }
}

export function extractMarkdownH1(markdown: string): string | null {
  const match = stripSeoMetaBlock(markdown).match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || null
}

export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, '').trimStart()
}

export function parseArticleForWordPress(markdown: string): ParsedWordPressArticle {
  const source = normalizeArticleMarkdown(markdown)
  const seo = parseSeoMetaFromMarkdown(source)
  const withoutMeta = stripSeoMetaBlock(source)
  const title = extractMarkdownH1(withoutMeta) || 'Untitled'
  const bodyMarkdown = stripLeadingH1(withoutMeta).trim()
  const metaTitle = seo?.metaTitle || title
  const metaDescription = seo?.metaDescription || ''
  return {
    title,
    slug: slugifyTitle(title),
    bodyMarkdown,
    contentHtml: markdownToHtml(bodyMarkdown),
    metaTitle,
    metaDescription
  }
}

export function isWordPressSeoPlugin(value: unknown): value is WordPressSeoPlugin {
  return value === 'none' || value === 'yoast' || value === 'rankmath'
}

export function normalizeWordPressPreset(
  partial?: Partial<WordPressPreset> | null,
  fallbackId = DEFAULT_WORDPRESS_PRESET_ID
): WordPressPreset {
  return createDefaultWordPressPreset({
    ...partial,
    id:
      typeof partial?.id === 'string' && partial.id.trim()
        ? partial.id.trim()
        : fallbackId
  })
}

/** Normalize a single-site config (legacy flat `wordpress` object). */
export function normalizeWordPressConfig(
  partial?: Partial<WordPressPreset> | null
): WordPressPreset {
  return normalizeWordPressPreset(partial)
}

function looksLikeLegacyFlatConfig(raw: unknown): raw is Partial<WordPressPreset> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const item = raw as Record<string, unknown>
  return (
    !Array.isArray(item.presets) &&
    (typeof item.siteUrl === 'string' ||
      typeof item.username === 'string' ||
      typeof item.applicationPassword === 'string')
  )
}

export function normalizeWordPressSettings(
  partial?: Partial<WordPressSettings> | Partial<WordPressPreset> | null
): WordPressSettings {
  if (looksLikeLegacyFlatConfig(partial)) {
    const preset = normalizeWordPressPreset(
      {
        ...partial,
        id: DEFAULT_WORDPRESS_PRESET_ID,
        name: typeof partial.name === 'string' && partial.name.trim() ? partial.name : '默认站点'
      },
      DEFAULT_WORDPRESS_PRESET_ID
    )
    return { presets: [preset], activePresetId: preset.id }
  }

  const settings = (partial ?? {}) as Partial<WordPressSettings>
  const rawPresets = Array.isArray(settings.presets) ? settings.presets : null

  if (!rawPresets || rawPresets.length === 0) {
    return {
      presets: [createDefaultWordPressPreset()],
      activePresetId: DEFAULT_WORDPRESS_PRESET_ID
    }
  }

  const presets = rawPresets
    .filter((item) => item && typeof item === 'object')
    .map((item, index) =>
      normalizeWordPressPreset(item, `wp-preset-${index + 1}`)
    )

  if (presets.length === 0) {
    return {
      presets: [createDefaultWordPressPreset()],
      activePresetId: DEFAULT_WORDPRESS_PRESET_ID
    }
  }

  const ids = new Set<string>()
  const uniquePresets = presets.map((preset, index) => {
    let id = preset.id
    if (!id || ids.has(id)) {
      id = `wp-preset-${index + 1}-${Math.random().toString(36).slice(2, 8)}`
    }
    ids.add(id)
    return { ...preset, id }
  })

  const activePresetId =
    typeof settings.activePresetId === 'string' &&
    uniquePresets.some((item) => item.id === settings.activePresetId)
      ? settings.activePresetId
      : uniquePresets[0].id

  return { presets: uniquePresets, activePresetId }
}

export function resolveActiveWordPressPreset(
  settings?: WordPressSettings | null
): WordPressPreset {
  const normalized = normalizeWordPressSettings(settings)
  return (
    normalized.presets.find((item) => item.id === normalized.activePresetId) ??
    normalized.presets[0] ??
    createDefaultWordPressPreset()
  )
}

export function resolveWordPressPreset(
  settings: WordPressSettings | null | undefined,
  presetId?: string | null
): WordPressPreset {
  const normalized = normalizeWordPressSettings(settings)
  if (presetId) {
    const matched = normalized.presets.find((item) => item.id === presetId)
    if (matched) return matched
  }
  return resolveActiveWordPressPreset(normalized)
}

export function normalizeWordPressDraftBinding(raw: unknown): WordPressDraftBinding | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const item = raw as Partial<WordPressDraftBinding>
  if (typeof item.postId !== 'number' || item.postId <= 0) return undefined
  if (typeof item.siteUrl !== 'string' || !item.siteUrl.trim()) return undefined
  if (typeof item.editLink !== 'string' || !item.editLink.trim()) return undefined
  return {
    postId: item.postId,
    siteUrl: item.siteUrl.trim(),
    editLink: item.editLink.trim(),
    link: typeof item.link === 'string' ? item.link : undefined,
    slug: typeof item.slug === 'string' ? item.slug : undefined,
    title: typeof item.title === 'string' ? item.title : undefined,
    featuredMediaId: typeof item.featuredMediaId === 'number' ? item.featuredMediaId : undefined,
    presetId: typeof item.presetId === 'string' ? item.presetId : undefined,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
  }
}
