export type WriteMode = 'create' | 'optimize' | 'batch-optimize'

/** Legacy batch dialog modes for create/optimize write modes. */
export type BatchWriteMode = 'create' | 'optimize'

/** Batch dialog mode including page batch-optimize pipeline. */
export type BatchDialogMode = BatchWriteMode | 'batch-optimize'

export const OPTIMIZER_SKILL_ID = 'article-optimizer'
export const BATCH_OPTIMIZER_SKILL_ID = 'page-batch-optimizer'
/** @deprecated Use STREAMING_DOMAIN_SKILL_ID + STREAMING_COMPLIANCE_SKILL_ID */
export const SEO_GEO_SKILL_ID = 'seo-geo-streaming-audio'
export const STREAMING_DOMAIN_SKILL_ID = 'streaming-audio-domain'
export const STREAMING_COMPLIANCE_SKILL_ID = 'streaming-audio-compliance'
export const IOS_GEO_SKILL_ID = 'seo-geo-ios-security'
export const STREAMING_TOP_SKILL_ID = 'seo-geo-streaming-top'

export const WRITE_MODE_STORAGE_KEY = 'composer.writeMode'
export const SEO_GEO_ENABLED_BEFORE_OPTIMIZE_KEY = 'composer.seoGeoEnabledBeforeOptimize'

export const WRITE_MODE_OPTIONS: Array<{ value: WriteMode; label: string; hint: string }> = [
  { value: 'create', label: '文章创作', hint: '从零撰写 SEO/GEO 软文' },
  { value: 'optimize', label: '文章优化', hint: '优化已有页面内容' },
  { value: 'batch-optimize', label: '页面批量优化', hint: '批量输入 URL，每个页面独立对话' }
]

export function normalizeWriteMode(value: unknown): WriteMode {
  if (value === 'optimize') return 'optimize'
  if (value === 'batch-optimize') return 'batch-optimize'
  return 'create'
}

export function getWriteModeLabel(mode: WriteMode): string {
  return WRITE_MODE_OPTIONS.find((item) => item.value === mode)?.label ?? '文章创作'
}
