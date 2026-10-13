import { normalizeTags } from './knowledgeBase'

export type ArticleType = 'how-to' | 'review' | 'top-rank'

export type BuiltinDomainPackId = 'streaming-audio' | 'ios-security' | 'generic-review'
export type DomainPackId = string

export const ARTICLE_TYPES: ArticleType[] = ['how-to', 'review', 'top-rank']

export interface DomainPack {
  id: DomainPackId
  name: string
  formats: ArticleType[]
  domainSkillIds: string[]
  complianceSkillIds: string[]
  formatSkillIds: Partial<Record<ArticleType, string[]>>
  styleHint: string
  bannedTerms: string[]
  preferredTerms: string[]
  searchHints?: string[]
  excludeQueryTerms?: string[]
  knowledgeTags?: string[]
}

export type DomainPackFields = Omit<DomainPack, 'id'>

export interface SaveDomainPackInput extends Partial<DomainPackFields> {
  id?: string
  name: string
  formats: ArticleType[]
}

export const DEFAULT_DOMAIN_PACK_ID: DomainPackId = 'streaming-audio'
export const DOMAIN_PACK_STORAGE_KEY = 'composer.domainPackId'

export const STREAMING_DOMAIN_SKILL_ID = 'streaming-audio-domain'
export const STREAMING_COMPLIANCE_SKILL_ID = 'streaming-audio-compliance'
export const STREAMING_TOP_SKILL_ID = 'seo-geo-streaming-top'
export const LEGACY_STREAMING_SKILL_ID = 'seo-geo-streaming-audio'
export const IOS_GEO_SKILL_ID = 'seo-geo-ios-security'
export const REVIEW_SKILL_ID = 'product-review'

export const MAX_PACK_NAME_CHARS = 40
export const MAX_PACK_STYLE_CHARS = 1200
export const MAX_PACK_TERMS = 40
export const MAX_PACK_TERM_CHARS = 80

const PACK_OWNED_SKILL_IDS = new Set([
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  STREAMING_TOP_SKILL_ID,
  LEGACY_STREAMING_SKILL_ID,
  IOS_GEO_SKILL_ID,
  REVIEW_SKILL_ID
])

export const PACK_BIND_EXCLUDED_SKILL_IDS = new Set(['explainer-voice', 'humanizer'])

export const BUILTIN_DOMAIN_PACKS: DomainPack[] = [
  {
    id: 'streaming-audio',
    name: '流媒体音频',
    formats: ['how-to', 'top-rank', 'review'],
    domainSkillIds: [STREAMING_DOMAIN_SKILL_ID],
    complianceSkillIds: [STREAMING_COMPLIANCE_SKILL_ID],
    formatSkillIds: {
      'top-rank': [STREAMING_TOP_SKILL_ID],
      review: [REVIEW_SKILL_ID]
    },
    styleHint:
      'Domain style (streaming audio): geek-friendly tone; use accurate audio terms (bitrate, lossless, ID3 tags, metadata, batch conversion).',
    bannedTerms: ['DRM', 'remove DRM', 'crack', 'bypass DRM', 'strip DRM'],
    preferredTerms: [
      'format limitations',
      'playback restrictions',
      'unlock full access',
      'convert for personal offline listening'
    ],
    searchHints: [
      'Spotify',
      'Tidal',
      'Apple Music',
      'Audible',
      'converter',
      'offline listening',
      'MP3',
      'FLAC',
      'format conversion'
    ],
    knowledgeTags: []
  },
  {
    id: 'ios-security',
    name: 'iOS 安全',
    formats: ['how-to'],
    domainSkillIds: [IOS_GEO_SKILL_ID],
    complianceSkillIds: [],
    formatSkillIds: {},
    styleHint:
      'Domain style (iOS repair/security): calm troubleshooting tone; cite Settings paths, iOS versions, and Apple official terms accurately; emphasize backup-first. Never claim the tool can fix stolen devices or remove someone else\'s Apple ID / Find My protection.',
    bannedTerms: [
      'jailbreak',
      'jailbreaking',
      'unlock bootloader',
      "remove iCloud lock (on others' devices)",
      'bypass Activation Lock',
      'crack',
      'pirate',
      'stolen iPhone unlock'
    ],
    preferredTerms: [
      'official restore',
      'authorized repair',
      'devices you own',
      'Activation Lock on your own account',
      'system repair',
      'contact Apple Support'
    ],
    searchHints: [
      'iPhone',
      'iPad',
      'iOS',
      'Settings',
      'restore',
      'Apple Support',
      'boot loop',
      'storage',
      'Activation Lock'
    ],
    excludeQueryTerms: [
      'Spotify',
      'Tidal',
      'Apple Music',
      'Audible',
      'DRM',
      'MP3 converter',
      'lossless',
      'FLAC'
    ],
    knowledgeTags: []
  },
  {
    id: 'generic-review',
    name: '通用测评',
    formats: ['review'],
    domainSkillIds: [REVIEW_SKILL_ID],
    complianceSkillIds: [],
    formatSkillIds: {},
    styleHint:
      'Domain style (product review): credible reviewer voice; the reviewed product is the primary subject; do not invent ratings, download counts, or quotes.',
    bannedTerms: [],
    preferredTerms: [],
    searchHints: ['product review', 'alternatives', 'comparison', 'pros and cons'],
    knowledgeTags: []
  }
]

export const DOMAIN_PACK_OPTIONS: Array<{ value: DomainPackId; label: string }> = BUILTIN_DOMAIN_PACKS.map(
  (pack) => ({ value: pack.id, label: pack.name })
)

export function isArticleType(value: string | null | undefined): value is ArticleType {
  return value === 'how-to' || value === 'review' || value === 'top-rank'
}

export function isBuiltinDomainPackId(value: string | null | undefined): value is BuiltinDomainPackId {
  return value === 'streaming-audio' || value === 'ios-security' || value === 'generic-review'
}

export function packOwnedSkillIds(): Set<string> {
  return new Set(PACK_OWNED_SKILL_IDS)
}

export function isPackOwnedSkillId(id: string): boolean {
  return PACK_OWNED_SKILL_IDS.has(id)
}

export function isPackBindableSkillId(id: string): boolean {
  return Boolean(id) && !PACK_BIND_EXCLUDED_SKILL_IDS.has(id)
}

export function domainPackOptions(packs: DomainPack[]): Array<{ value: DomainPackId; label: string }> {
  const catalog = packs.length > 0 ? packs : BUILTIN_DOMAIN_PACKS
  return catalog.map((pack) => ({ value: pack.id, label: pack.name }))
}

export function lookupDomainPack(id?: string | null, packs: DomainPack[] = BUILTIN_DOMAIN_PACKS): DomainPack {
  const catalog = packs.length > 0 ? packs : BUILTIN_DOMAIN_PACKS
  if (id) {
    const found = catalog.find((item) => item.id === id)
    if (found) return found
  }
  return catalog.find((item) => item.id === DEFAULT_DOMAIN_PACK_ID) ?? catalog[0]
}

export function lookupDomainPackByName(
  name?: string | null,
  packs: DomainPack[] = BUILTIN_DOMAIN_PACKS
): DomainPack | null {
  const key = name?.trim()
  if (!key) return null
  return packs.find((item) => item.name === key || item.id === key) ?? null
}

/** Builtin-only lookup. Main process should use the stored catalog. */
export function getDomainPack(id?: string | null): DomainPack {
  return lookupDomainPack(id, BUILTIN_DOMAIN_PACKS)
}

export function resolveDomainPack(id?: string | null): DomainPack {
  return getDomainPack(id)
}

export function getDomainPackByName(name?: string | null): DomainPack | null {
  return lookupDomainPackByName(name, BUILTIN_DOMAIN_PACKS)
}

export function clampFormatForPack(pack: DomainPack, format?: string | null): ArticleType {
  if (isArticleType(format) && pack.formats.includes(format)) return format
  return pack.formats[0] ?? 'how-to'
}

export function skillIdsForPack(pack: DomainPack, format: ArticleType): string[] {
  const clamped = clampFormatForPack(pack, format)
  const ids = [
    ...pack.domainSkillIds,
    ...pack.complianceSkillIds,
    ...(pack.formatSkillIds[clamped] ?? [])
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function formatDomainPackPrompt(pack?: DomainPack | null): string {
  if (!pack) return ''
  const parts: string[] = []
  if (pack.styleHint.trim()) parts.push(pack.styleHint.trim())

  const lines: string[] = []
  if (pack.bannedTerms.length > 0) {
    lines.push(`Never use: ${pack.bannedTerms.join(', ')}.`)
  }
  if (pack.preferredTerms.length > 0) {
    lines.push(`Use instead: ${pack.preferredTerms.join(', ')}.`)
  }
  if (lines.length > 0) parts.push(lines.join('\n'))
  return parts.join('\n\n')
}

export function formatDomainPackSearchGuidance(pack?: DomainPack | null): string {
  if (!pack) return ''
  const parts: string[] = []
  if (pack.styleHint.trim()) parts.push(`领域语境：${pack.styleHint.trim()}`)
  if (pack.searchHints && pack.searchHints.length > 0) {
    parts.push(`扩词时优先覆盖的品类概念：${pack.searchHints.join('、')}`)
  }
  if (pack.excludeQueryTerms && pack.excludeQueryTerms.length > 0) {
    parts.push(
      `搜索词禁止引入下列概念（除非主题原文已经出现）：${pack.excludeQueryTerms.join('、')}`
    )
  }
  return parts.join('\n')
}

export function normalizePackTerms(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，]/)
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const term = String(item).trim().slice(0, MAX_PACK_TERM_CHARS)
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= MAX_PACK_TERMS) break
  }
  return out
}

export function formatPackTermInput(terms: string[] | undefined): string {
  return (terms ?? []).join('，')
}

function normalizeIdList(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，]/)
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const id = String(item).trim()
    if (!id || seen.has(id) || PACK_BIND_EXCLUDED_SKILL_IDS.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function normalizeFormats(raw: unknown): ArticleType[] {
  const list = Array.isArray(raw) ? raw : []
  const out: ArticleType[] = []
  for (const item of list) {
    if (isArticleType(item) && !out.includes(item)) out.push(item)
  }
  return out.length > 0 ? out : ['how-to']
}

function normalizeFormatSkillIds(
  raw: unknown,
  formats: ArticleType[]
): Partial<Record<ArticleType, string[]>> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: Partial<Record<ArticleType, string[]>> = {}
  for (const format of formats) {
    const ids = normalizeIdList(source[format])
    if (ids.length > 0) out[format] = ids
  }
  return out
}

export function sanitizeDomainPackFields(raw: Partial<DomainPackFields> & { name?: unknown }): DomainPackFields {
  const formats = normalizeFormats(raw.formats)
  return {
    name: String(raw.name ?? '').trim().slice(0, MAX_PACK_NAME_CHARS) || '未命名领域',
    formats,
    domainSkillIds: normalizeIdList(raw.domainSkillIds),
    complianceSkillIds: normalizeIdList(raw.complianceSkillIds),
    formatSkillIds: normalizeFormatSkillIds(raw.formatSkillIds, formats),
    styleHint: String(raw.styleHint ?? '').slice(0, MAX_PACK_STYLE_CHARS),
    bannedTerms: normalizePackTerms(raw.bannedTerms),
    preferredTerms: normalizePackTerms(raw.preferredTerms),
    searchHints: normalizePackTerms(raw.searchHints),
    excludeQueryTerms: normalizePackTerms(raw.excludeQueryTerms),
    knowledgeTags: normalizeTags(raw.knowledgeTags)
  }
}

export function slugifyDomainPackId(name: string): string {
  const fromAscii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return fromAscii || 'pack'
}
