export type WriteMode = 'create' | 'optimize'

export const OPTIMIZER_SKILL_ID = 'article-optimizer'
export const SEO_GEO_SKILL_ID = 'seo-geo-streaming-audio'
export const IOS_GEO_SKILL_ID = 'seo-geo-ios-security'
export const STREAMING_TOP_SKILL_ID = 'seo-geo-streaming-top'

export const WRITE_MODE_STORAGE_KEY = 'composer.writeMode'
export const SEO_GEO_ENABLED_BEFORE_OPTIMIZE_KEY = 'composer.seoGeoEnabledBeforeOptimize'

export const WRITE_MODE_OPTIONS: Array<{ value: WriteMode; label: string }> = [
  { value: 'create', label: '文章创作' },
  { value: 'optimize', label: '文章优化' }
]
