import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import {
  DEFAULT_CONFIG,
  normalizeLlmMaxTokens,
  normalizeLlmPresets,
  normalizeModeEnabledSkills,
  normalizeModePrompts,
  normalizeQuickPicks,
  normalizeResearchConfig,
  normalizeWindowClose,
  resolveActiveLlmConfig,
  type AppConfig,
  type LlmConfig,
  type ModeEnabledSkillsConfig,
  type ModePromptsConfig
} from './types'

type ConfigPartial = Partial<AppConfig> & {
  llm?: LlmConfig
  llmTokenLimits?: unknown
  prompts?: Partial<ModePromptsConfig> | AppConfig['prompts']
  enabledSkills?: Partial<ModeEnabledSkillsConfig> | string[]
}

let cachedConfig: AppConfig | null = null

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function mergeWithDefaults(partial: ConfigPartial): AppConfig {
  const { presets, activePresetId } = normalizeLlmPresets(partial)

  return {
    llmPresets: presets,
    activeLlmPresetId: activePresetId,
    llmMaxTokens: normalizeLlmMaxTokens(partial.llmMaxTokens ?? partial.llmTokenLimits),
    prompts: normalizeModePrompts(partial.prompts),
    research: normalizeResearchConfig(partial.research),
    quickPicks: normalizeQuickPicks(partial.quickPicks ?? DEFAULT_CONFIG.quickPicks),
    enabledSkills: normalizeModeEnabledSkills(
      partial.enabledSkills,
      partial.skillEnablementInitialized ?? DEFAULT_CONFIG.skillEnablementInitialized
    ),
    skillEnablementInitialized:
      partial.skillEnablementInitialized ?? DEFAULT_CONFIG.skillEnablementInitialized,
    windowClose: normalizeWindowClose(partial.windowClose ?? DEFAULT_CONFIG.windowClose)
  }
}

export type EffectiveAppConfig = AppConfig & { llm: LlmConfig }

function mergeWithEnv(config: AppConfig): EffectiveAppConfig {
  const activeLlm = resolveActiveLlmConfig(config)
  const apiKey =
    activeLlm.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.CURSOR_API_KEY ||
    ''

  return {
    ...config,
    llm: {
      ...activeLlm,
      apiKey,
      baseUrl: activeLlm.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      model: activeLlm.model || process.env.LLM_MODEL || 'gpt-4o'
    },
    research: {
      ...config.research,
      tavilyApiKey: config.research.tavilyApiKey || process.env.TAVILY_API_KEY || '',
      firecrawlApiKey: config.research.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || ''
    }
  }
}

export async function loadConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig

  try {
    const raw = await readFile(getConfigPath(), 'utf-8')
    cachedConfig = mergeWithDefaults(JSON.parse(raw) as ConfigPartial)
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG }
  }

  return cachedConfig
}

export async function getEffectiveConfig(): Promise<EffectiveAppConfig> {
  const config = await loadConfig()
  return mergeWithEnv(config)
}

function mergeModePrompts(
  current: ModePromptsConfig,
  partial?: Partial<ModePromptsConfig>
): ModePromptsConfig {
  if (!partial) return current
  return {
    create: { ...current.create, ...partial.create },
    optimize: { ...current.optimize, ...partial.optimize }
  }
}

function mergeModeEnabledSkills(
  current: ModeEnabledSkillsConfig,
  partial?: Partial<ModeEnabledSkillsConfig>
): ModeEnabledSkillsConfig {
  if (!partial) return current
  return {
    create: partial.create ?? current.create,
    optimize: partial.optimize ?? current.optimize
  }
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const mergedPartial: ConfigPartial = {
    ...current,
    ...partial,
    prompts: mergeModePrompts(current.prompts, partial.prompts),
    research: { ...current.research, ...partial.research },
    enabledSkills: mergeModeEnabledSkills(current.enabledSkills, partial.enabledSkills),
    quickPicks: partial.quickPicks
      ? normalizeQuickPicks({ ...current.quickPicks, ...partial.quickPicks })
      : current.quickPicks
  }

  if (partial.llmPresets || partial.activeLlmPresetId) {
    const normalized = normalizeLlmPresets({
      llmPresets: partial.llmPresets ?? current.llmPresets,
      activeLlmPresetId: partial.activeLlmPresetId ?? current.activeLlmPresetId
    })
    mergedPartial.llmPresets = normalized.presets
    mergedPartial.activeLlmPresetId = normalized.activePresetId
  }

  if (typeof partial.llmMaxTokens === 'number') {
    mergedPartial.llmMaxTokens = normalizeLlmMaxTokens(partial.llmMaxTokens)
  }

  const next = mergeWithDefaults(mergedPartial)

  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8')
  cachedConfig = next
  return next
}

export function invalidateConfigCache(): void {
  cachedConfig = null
}
