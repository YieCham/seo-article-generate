import { DEFAULT_LLM_MAX_TOKENS, normalizeLlmMaxTokens } from './llmTokenLimits'
import {
  DEFAULT_WORDPRESS_SETTINGS,
  type WordPressSettings
} from '../../shared/wordpress'

export {
  DEFAULT_WORDPRESS,
  DEFAULT_WORDPRESS_SETTINGS,
  normalizeWordPressConfig,
  normalizeWordPressSettings,
  resolveActiveWordPressPreset,
  resolveWordPressPreset,
  type WordPressConfig,
  type WordPressPreset,
  type WordPressSettings
} from '../../shared/wordpress'

export { DEFAULT_LLM_MAX_TOKENS, normalizeLlmMaxTokens }

/** Per-model reasoning intensity for OpenAI-compatible `reasoning_effort`. */
export type LlmReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'max'

export const LLM_REASONING_EFFORT_OPTIONS: Array<{
  value: LlmReasoningEffort | 'default'
  label: string
  hint: string
}> = [
  { value: 'default', label: '默认', hint: '不传参，使用接口默认' },
  { value: 'none', label: '关闭', hint: '尽量不推理（部分模型支持）' },
  { value: 'low', label: '低', hint: '轻度推理' },
  { value: 'medium', label: '中', hint: '均衡（多数推理模型默认）' },
  { value: 'high', label: '高', hint: '更强推理，更慢更费' },
  { value: 'max', label: '最大', hint: '最强推理（DeepSeek 等支持）' }
]

const REASONING_EFFORT_SET = new Set<string>(['none', 'low', 'medium', 'high', 'max'])

export function isLlmReasoningEffort(value: unknown): value is LlmReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORT_SET.has(value)
}

export function normalizeModelReasoningEffort(
  raw: unknown,
  models: string[]
): Record<string, LlmReasoningEffort> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const modelSet = new Set(models)
  const out: Record<string, LlmReasoningEffort> = {}
  for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!modelSet.has(model) || !isLlmReasoningEffort(value)) continue
    out[model] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function getModelReasoningEffort(
  preset: Pick<LlmPreset, 'modelReasoningEffort'> | undefined,
  model: string
): LlmReasoningEffort | undefined {
  const value = preset?.modelReasoningEffort?.[model]
  return isLlmReasoningEffort(value) ? value : undefined
}

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  /** When set, sent as OpenAI-compatible `reasoning_effort`. */
  reasoningEffort?: LlmReasoningEffort
}

export interface LlmSelection {
  presetId: string
  model: string
}

export interface LlmPreset {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  models: string[]
  temperature: number
  /** Per-model reasoning intensity (global for that model in this preset). */
  modelReasoningEffort?: Record<string, LlmReasoningEffort>
}

export const DEFAULT_LLM_PRESET_ID = 'preset-openai-gpt4o'

export const DEFAULT_LLM_PRESET: LlmPreset = {
  id: DEFAULT_LLM_PRESET_ID,
  name: 'OpenAI GPT-4o',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  models: ['gpt-4o'],
  temperature: 0.7
}

function normalizePresetModels(item: { models?: string[]; model?: string }): string[] {
  if (Array.isArray(item.models)) {
    return [...new Set(item.models.map((model) => model.trim()).filter(Boolean))]
  }
  const legacyModel = item.model?.trim()
  return legacyModel ? [legacyModel] : []
}

function buildLlmConfigFromPreset(preset: LlmPreset, model: string): LlmConfig {
  const reasoningEffort = getModelReasoningEffort(preset, model)
  return {
    apiKey: preset.apiKey,
    baseUrl: preset.baseUrl,
    model,
    temperature: preset.temperature,
    ...(reasoningEffort ? { reasoningEffort } : {})
  }
}

export function normalizeLlmPresets(
  partial: Partial<AppConfig> & { llm?: LlmConfig }
): { presets: LlmPreset[]; activePresetId: string } {
  if (partial.llmPresets && partial.llmPresets.length > 0) {
    const presets = partial.llmPresets
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => {
        const models = normalizePresetModels(item)
        return {
          id: item.id,
          name: item.name.trim() || '未命名预设',
          apiKey: item.apiKey ?? '',
          baseUrl: item.baseUrl?.trim() || DEFAULT_LLM_PRESET.baseUrl,
          models,
          temperature:
            typeof item.temperature === 'number' ? item.temperature : DEFAULT_LLM_PRESET.temperature,
          modelReasoningEffort: normalizeModelReasoningEffort(item.modelReasoningEffort, models)
        }
      })

    if (presets.length === 0) {
      return { presets: [{ ...DEFAULT_LLM_PRESET }], activePresetId: DEFAULT_LLM_PRESET_ID }
    }

    const activePresetId = presets.some((item) => item.id === partial.activeLlmPresetId)
      ? partial.activeLlmPresetId!
      : presets[0].id

    return { presets, activePresetId }
  }

  if (partial.llm) {
    return {
      presets: [
        {
          id: DEFAULT_LLM_PRESET_ID,
          name: '默认',
          apiKey: partial.llm.apiKey ?? '',
          baseUrl: partial.llm.baseUrl || DEFAULT_LLM_PRESET.baseUrl,
          models: partial.llm.model?.trim() ? [partial.llm.model.trim()] : [...DEFAULT_LLM_PRESET.models],
          temperature: partial.llm.temperature ?? DEFAULT_LLM_PRESET.temperature
        }
      ],
      activePresetId: DEFAULT_LLM_PRESET_ID
    }
  }

  return { presets: [{ ...DEFAULT_LLM_PRESET }], activePresetId: DEFAULT_LLM_PRESET_ID }
}

export function resolveActiveLlmPreset(config: AppConfig): LlmPreset {
  return (
    config.llmPresets.find((item) => item.id === config.activeLlmPresetId) ?? config.llmPresets[0] ?? {
      ...DEFAULT_LLM_PRESET
    }
  )
}

export function resolveLlmConfigFromSelection(
  config: AppConfig,
  selection?: LlmSelection | null
): LlmConfig | null {
  if (selection?.presetId && selection.model) {
    const preset = config.llmPresets.find((item) => item.id === selection.presetId)
    if (preset) {
      return buildLlmConfigFromPreset(preset, selection.model)
    }
  }

  if (selection?.model) {
    for (const preset of config.llmPresets) {
      if (preset.models.includes(selection.model)) {
        return buildLlmConfigFromPreset(preset, selection.model)
      }
    }
  }

  const preset = resolveActiveLlmPreset(config)
  const model = preset.models[0]
  if (!model) return null

  return buildLlmConfigFromPreset(preset, model)
}

/** @deprecated use resolveLlmConfigFromSelection */
export function resolveActiveLlmConfig(config: AppConfig): LlmConfig {
  return resolveLlmConfigFromSelection(config) ?? {
    apiKey: DEFAULT_LLM_PRESET.apiKey,
    baseUrl: DEFAULT_LLM_PRESET.baseUrl,
    model: DEFAULT_LLM_PRESET.models[0],
    temperature: DEFAULT_LLM_PRESET.temperature
  }
}

export interface PromptConfig {
  systemPrompt: string
  userPrompt: string
}

export type PipelineMode = 'create' | 'optimize' | 'batch-optimize'

export interface ModePromptsConfig {
  create: PromptConfig
  optimize: PromptConfig
}

export interface ModeEnabledSkillsConfig {
  create: string[]
  optimize: string[]
  batchOptimize: string[]
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
  /** Optional WordPress site preset to prefer when publishing with this product selected. */
  wordpressPresetId?: string
}

export interface QuickPicksConfig {
  products: QuickPickOption[]
  /** @deprecated migrated away — ignored on load */
  audiences?: QuickPickOption[]
  defaultOutputLanguage: string
}

export type WindowCloseAction = 'minimize-to-tray' | 'quit'

export interface WindowCloseBehavior {
  skipPrompt: boolean
  defaultAction: WindowCloseAction
}

export function normalizeWindowClose(partial?: Partial<WindowCloseBehavior>): WindowCloseBehavior {
  return {
    skipPrompt: partial?.skipPrompt ?? false,
    defaultAction: partial?.defaultAction === 'quit' ? 'quit' : 'minimize-to-tray'
  }
}

export interface ImageGenConfig {
  /** Full generations endpoint, e.g. https://uuapi.shop/v1/images/generations */
  apiUrl: string
  apiKey: string
  model: string
  size: string
  defaultPrompt: string
}

export const DEFAULT_IMAGE_GEN: ImageGenConfig = {
  apiUrl: 'https://uuapi.shop/v1/images/generations',
  apiKey: '',
  model: 'gpt-image-2',
  size: '1024x1024',
  defaultPrompt: ''
}

export function normalizeImageGenConfig(partial?: Partial<ImageGenConfig> | null): ImageGenConfig {
  return {
    apiUrl: partial?.apiUrl?.trim() || DEFAULT_IMAGE_GEN.apiUrl,
    apiKey: partial?.apiKey ?? '',
    model: partial?.model?.trim() || DEFAULT_IMAGE_GEN.model,
    size: partial?.size?.trim() || DEFAULT_IMAGE_GEN.size,
    defaultPrompt: partial?.defaultPrompt ?? ''
  }
}

/** HTTP proxy for outbound API requests (LLM / research / image, etc.). */
export interface NetworkProxyConfig {
  enabled: boolean
  host: string
  port: number
}

export const DEFAULT_NETWORK_PROXY: NetworkProxyConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 8889
}

export function normalizeNetworkProxy(partial?: Partial<NetworkProxyConfig> | null): NetworkProxyConfig {
  const rawPort = partial?.port as unknown
  let port = DEFAULT_NETWORK_PROXY.port
  if (typeof rawPort === 'number' && Number.isFinite(rawPort)) {
    port = Math.min(65535, Math.max(1, Math.round(rawPort)))
  } else if (typeof rawPort === 'string' && rawPort.trim() !== '') {
    const parsed = Number(rawPort)
    if (Number.isFinite(parsed)) {
      port = Math.min(65535, Math.max(1, Math.round(parsed)))
    }
  }

  return {
    enabled: Boolean(partial?.enabled),
    host: (partial?.host?.trim() || DEFAULT_NETWORK_PROXY.host).replace(/\/$/, ''),
    port
  }
}

/** Optional multi-model routing: pre-body+meta vs body writing. */
export interface LlmModelRef {
  presetId: string
  model: string
}

export interface LlmRoleRoutingConfig {
  /** When false, conversation / active selection model is used for all steps. */
  enabled: boolean
  /** expand, extract, writingBrief, plan, seo meta */
  preBodyAndMeta: LlmModelRef
  /** outline, section draft, polish, length adjust (and optimize body steps) */
  bodyWork: LlmModelRef
}

export const DEFAULT_LLM_ROLE_ROUTING: LlmRoleRoutingConfig = {
  enabled: false,
  preBodyAndMeta: { presetId: '', model: '' },
  bodyWork: { presetId: '', model: '' }
}

export function normalizeLlmModelRef(partial?: Partial<LlmModelRef> | null): LlmModelRef {
  return {
    presetId: typeof partial?.presetId === 'string' ? partial.presetId.trim() : '',
    model: typeof partial?.model === 'string' ? partial.model.trim() : ''
  }
}

export function normalizeLlmRoleRouting(
  partial?: Partial<LlmRoleRoutingConfig> | null
): LlmRoleRoutingConfig {
  return {
    enabled: Boolean(partial?.enabled),
    preBodyAndMeta: normalizeLlmModelRef(partial?.preBodyAndMeta),
    bodyWork: normalizeLlmModelRef(partial?.bodyWork)
  }
}

export interface AppConfig {
  llmPresets: LlmPreset[]
  activeLlmPresetId: string
  llmMaxTokens: number
  llmRoleRouting: LlmRoleRoutingConfig
  prompts: ModePromptsConfig
  research: ResearchConfig
  quickPicks: QuickPicksConfig
  enabledSkills: ModeEnabledSkillsConfig
  skillEnablementInitialized: boolean
  windowClose?: WindowCloseBehavior
  imageGen: ImageGenConfig
  networkProxy: NetworkProxyConfig
  wordpress: WordPressSettings
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
  defaultOutputLanguage: 'en'
}

export function normalizeQuickPicks(quickPicks?: Partial<QuickPicksConfig>): QuickPicksConfig {
  const sanitize = (items: QuickPickOption[] | undefined): QuickPickOption[] =>
    (items ?? [])
      .filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
      .map((item) => {
        const wordpressPresetId =
          typeof item.wordpressPresetId === 'string' && item.wordpressPresetId.trim()
            ? item.wordpressPresetId.trim()
            : undefined
        return {
          id: item.id,
          label: item.label.trim(),
          ...(wordpressPresetId ? { wordpressPresetId } : {})
        }
      })
      .filter((item) => item.label.length > 0)

  const lang = quickPicks?.defaultOutputLanguage?.trim()
  const defaultOutputLanguage =
    lang && ['en', 'zh', 'es', 'fr', 'de', 'ja'].includes(lang) ? lang : 'en'

  return {
    products: sanitize(quickPicks?.products),
    defaultOutputLanguage
  }
}

export const DEFAULT_OPTIMIZE_SYSTEM_PROMPT = `你是一位资深 SEO/GEO 编辑。请严格遵循以下 Skills 中的优化规范：

{{skills}}

{{research}}`

export const DEFAULT_OPTIMIZE_USER_PROMPT = `请基于以下原文 URL 与抓取内容，输出优化后的完整文章（Markdown）：

原文：{{sourceUrl}}
{{extraInstructions}}

在动笔前，请结合竞品调研与 E-E-A-T 萃取（如有），在保留原文骨架的前提下做增量优化。
直接输出正文，不要解释你将如何优化。`

export const DEFAULT_CREATE_PROMPTS: PromptConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userPrompt: DEFAULT_USER_PROMPT
}

export const DEFAULT_OPTIMIZE_PROMPTS: PromptConfig = {
  systemPrompt: DEFAULT_OPTIMIZE_SYSTEM_PROMPT,
  userPrompt: DEFAULT_OPTIMIZE_USER_PROMPT
}

export const DEFAULT_MODE_PROMPTS: ModePromptsConfig = {
  create: DEFAULT_CREATE_PROMPTS,
  optimize: DEFAULT_OPTIMIZE_PROMPTS
}

export const DEFAULT_MODE_ENABLED_SKILLS: ModeEnabledSkillsConfig = {
  create: [],
  optimize: [],
  batchOptimize: []
}

/** @deprecated legacy flat prompts */
interface LegacyPromptsConfig {
  systemPrompt?: string
  userPrompt?: string
}

export function normalizeModePrompts(partial?: Partial<ModePromptsConfig> | LegacyPromptsConfig): ModePromptsConfig {
  if (partial && 'create' in partial && partial.create) {
    return {
      create: { ...DEFAULT_CREATE_PROMPTS, ...partial.create },
      optimize: { ...DEFAULT_OPTIMIZE_PROMPTS, ...partial.optimize }
    }
  }

  if (partial && 'systemPrompt' in partial && typeof partial.systemPrompt === 'string') {
    return {
      create: {
        systemPrompt: partial.systemPrompt,
        userPrompt: partial.userPrompt ?? DEFAULT_USER_PROMPT
      },
      optimize: { ...DEFAULT_OPTIMIZE_PROMPTS }
    }
  }

  return DEFAULT_MODE_PROMPTS
}

export function normalizeModeEnabledSkills(
  partial?: Partial<ModeEnabledSkillsConfig> | string[],
  legacyInitialized = false
): ModeEnabledSkillsConfig {
  const sanitizeCreate = (ids: string[]) => ids.filter((id) => id !== 'article-optimizer')
  const sanitizeOptimize = (ids: string[]) =>
    ids.includes('article-optimizer') ? ['article-optimizer'] : []
  const migrateStreaming = (ids: string[]) => {
    if (!ids.includes('seo-geo-streaming-audio')) return ids
    const next = ids.filter((id) => id !== 'seo-geo-streaming-audio')
    if (!next.includes('streaming-audio-domain')) next.push('streaming-audio-domain')
    if (!next.includes('streaming-audio-compliance')) next.push('streaming-audio-compliance')
    return next
  }

  const sanitizeBatchOptimize = (ids: string[]) =>
    ids.includes('page-batch-optimizer') ? ['page-batch-optimizer'] : []

  if (partial && !Array.isArray(partial)) {
    return {
      create: migrateStreaming(sanitizeCreate(partial.create ?? DEFAULT_MODE_ENABLED_SKILLS.create)),
      optimize: sanitizeOptimize(partial.optimize ?? DEFAULT_MODE_ENABLED_SKILLS.optimize),
      batchOptimize: sanitizeBatchOptimize(
        partial.batchOptimize ?? DEFAULT_MODE_ENABLED_SKILLS.batchOptimize
      )
    }
  }

  const legacy = Array.isArray(partial) ? partial : []

  return {
    create: migrateStreaming(sanitizeCreate(legacy)),
    optimize: legacyInitialized || legacy.length > 0 ? ['article-optimizer'] : [],
    batchOptimize: []
  }
}

export const DEFAULT_CONFIG: AppConfig = {
  llmPresets: [{ ...DEFAULT_LLM_PRESET }],
  activeLlmPresetId: DEFAULT_LLM_PRESET_ID,
  llmMaxTokens: DEFAULT_LLM_MAX_TOKENS,
  llmRoleRouting: { ...DEFAULT_LLM_ROLE_ROUTING },
  prompts: DEFAULT_MODE_PROMPTS,
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
  enabledSkills: DEFAULT_MODE_ENABLED_SKILLS,
  skillEnablementInitialized: false,
  windowClose: {
    skipPrompt: false,
    defaultAction: 'minimize-to-tray'
  },
  imageGen: { ...DEFAULT_IMAGE_GEN },
  networkProxy: { ...DEFAULT_NETWORK_PROXY },
  wordpress: {
    presets: DEFAULT_WORDPRESS_SETTINGS.presets.map((item) => ({ ...item })),
    activePresetId: DEFAULT_WORDPRESS_SETTINGS.activePresetId
  }
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
