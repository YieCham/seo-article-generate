export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

export interface PromptConfig {
  systemPrompt: string
  userPrompt: string
}

export interface ResearchConfig {
  enabled: boolean
  tavilyApiKey: string
  firecrawlApiKey: string
  maxSearchResults: number
  maxPagesToScrape: number
  searchRegion: string
  searchLanguage: string
}

export interface QuickPickOption {
  id: string
  label: string
}

export interface QuickPicksConfig {
  products: QuickPickOption[]
  audiences: QuickPickOption[]
}

export interface AppConfig {
  llm: LlmConfig
  prompts: PromptConfig
  research: ResearchConfig
  quickPicks: QuickPicksConfig
  enabledSkills: string[]
  skillEnablementInitialized: boolean
}

export interface SkillItem {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  bundled?: boolean
}

export const DEFAULT_SYSTEM_PROMPT = `你是一位专业内容创作者。请严格遵循以下 Skills 中的写作规范：

{{skills}}

{{research}}`

export const DEFAULT_USER_PROMPT = `请围绕以下主题创作一篇完整文章（Markdown 格式）：

主题：{{topic}}
{{extraInstructions}}

在动笔前，请结合上方竞品调研参考（如有），确保文章在观点、结构或深度上具备差异化。
直接输出正文，不要解释你将如何写作。`

export const DEFAULT_QUICK_PICKS: QuickPicksConfig = {
  products: [],
  audiences: []
}

export function normalizeQuickPicks(quickPicks?: Partial<QuickPicksConfig>): QuickPicksConfig {
  const sanitize = (items: QuickPickOption[] | undefined): QuickPickOption[] =>
    (items ?? [])
      .filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
      .map((item) => ({ id: item.id, label: item.label.trim() }))
      .filter((item) => item.label.length > 0)

  return {
    products: sanitize(quickPicks?.products),
    audiences: sanitize(quickPicks?.audiences)
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  llm: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    temperature: 0.7
  },
  prompts: {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPrompt: DEFAULT_USER_PROMPT
  },
  research: {
    enabled: true,
    tavilyApiKey: '',
    firecrawlApiKey: '',
    maxSearchResults: 10,
    maxPagesToScrape: 10,
    searchRegion: 'us',
    searchLanguage: 'en'
  },
  quickPicks: DEFAULT_QUICK_PICKS,
  enabledSkills: [],
  skillEnablementInitialized: false
}

/** @deprecated fields from older configs */
interface LegacyResearchFields {
  serperApiKey?: string
  searchGl?: string
  searchHl?: string
}

export function normalizeResearchConfig(
  research?: Partial<ResearchConfig> & LegacyResearchFields
): ResearchConfig {
  const glToRegion: Record<string, string> = {
    us: 'us',
    uk: 'uk',
    cn: 'cn',
    jp: 'jp',
    de: 'de',
    fr: 'fr',
    au: 'au',
    ca: 'ca'
  }
  const hlToLanguage: Record<string, string> = {
    en: 'en',
    'en-us': 'en',
    'en-gb': 'en',
    zh: 'zh',
    'zh-cn': 'zh',
    'zh-tw': 'zh',
    ja: 'ja',
    de: 'de',
    fr: 'fr',
    es: 'es'
  }

  const merged = { ...DEFAULT_CONFIG.research, ...research }
  return {
    ...merged,
    tavilyApiKey: merged.tavilyApiKey || research?.serperApiKey || '',
    searchRegion: merged.searchRegion || glToRegion[research?.searchGl ?? ''] || 'us',
    searchLanguage: merged.searchLanguage || hlToLanguage[research?.searchHl ?? ''] || 'en'
  }
}
