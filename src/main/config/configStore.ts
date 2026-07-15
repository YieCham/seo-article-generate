import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import {
  DEFAULT_CONFIG,
  normalizeLlmMaxTokens,
  normalizeLlmPresets,
  normalizeLlmRoleRouting,
  normalizeModeEnabledSkills,
  normalizeModePrompts,
  normalizeQuickPicks,
  normalizeResearchConfig,
  normalizeWindowClose,
  resolveLlmConfigFromSelection,
  type AppConfig,
  type LlmConfig,
  type LlmRoleRoutingConfig,
  type LlmSelection,
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
    llmRoleRouting: normalizeLlmRoleRouting(partial.llmRoleRouting),
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

function applyEnvToLlmConfig(llm: LlmConfig): LlmConfig {
  const apiKey =
    llm.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.CURSOR_API_KEY ||
    ''

  return {
    ...llm,
    apiKey,
    baseUrl: llm.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: llm.model || process.env.LLM_MODEL || 'gpt-4o'
  }
}

function mergeWithEnv(config: AppConfig, selection?: LlmSelection | null): EffectiveAppConfig {
  const resolved = resolveLlmConfigFromSelection(config, selection)
  const activeLlm = applyEnvToLlmConfig(
    resolved ?? {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.7
    }
  )

  return {
    ...config,
    llm: activeLlm,
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

export async function getEffectiveConfig(selection?: LlmSelection | null): Promise<EffectiveAppConfig> {
  const config = await loadConfig()
  return mergeWithEnv(config, selection)
}

export type LlmRoutingRole = 'preBodyAndMeta' | 'bodyWork'

/** Resolve LLM for a pipeline role; falls back to session/effective llm when routing off or incomplete. */
export function resolveRoutedLlm(
  config: AppConfig,
  role: LlmRoutingRole,
  fallback: LlmConfig
): LlmConfig {
  const routing = config.llmRoleRouting
  if (!routing?.enabled) return fallback

  const ref = routing[role]
  if (!ref?.presetId || !ref?.model) return fallback

  const resolved = resolveLlmConfigFromSelection(config, {
    presetId: ref.presetId,
    model: ref.model
  })
  if (!resolved) return fallback
  return applyEnvToLlmConfig(resolved)
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
    optimize: partial.optimize ?? current.optimize,
    batchOptimize: partial.batchOptimize ?? current.batchOptimize
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

  if (partial.llmRoleRouting) {
    const currentRouting = normalizeLlmRoleRouting(current.llmRoleRouting)
    mergedPartial.llmRoleRouting = normalizeLlmRoleRouting({
      ...currentRouting,
      ...partial.llmRoleRouting,
      preBodyAndMeta: {
        ...currentRouting.preBodyAndMeta,
        ...partial.llmRoleRouting.preBodyAndMeta
      },
      bodyWork: {
        ...currentRouting.bodyWork,
        ...partial.llmRoleRouting.bodyWork
      }
    })
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
