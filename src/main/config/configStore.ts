import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { DEFAULT_CONFIG, normalizeQuickPicks, normalizeResearchConfig, type AppConfig } from './types'

let cachedConfig: AppConfig | null = null

function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function mergeWithDefaults(partial: Partial<AppConfig>): AppConfig {
  return {
    llm: { ...DEFAULT_CONFIG.llm, ...partial.llm },
    prompts: { ...DEFAULT_CONFIG.prompts, ...partial.prompts },
    research: normalizeResearchConfig(partial.research),
    quickPicks: normalizeQuickPicks(partial.quickPicks ?? DEFAULT_CONFIG.quickPicks),
    enabledSkills: partial.enabledSkills ?? DEFAULT_CONFIG.enabledSkills,
    skillEnablementInitialized:
      partial.skillEnablementInitialized ?? DEFAULT_CONFIG.skillEnablementInitialized
  }
}

function mergeWithEnv(config: AppConfig): AppConfig {
  const apiKey =
    config.llm.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.CURSOR_API_KEY ||
    ''

  return {
    ...config,
    llm: {
      ...config.llm,
      apiKey,
      baseUrl: config.llm.baseUrl || process.env.LLM_BASE_URL || DEFAULT_CONFIG.llm.baseUrl,
      model: config.llm.model || process.env.LLM_MODEL || DEFAULT_CONFIG.llm.model
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
    cachedConfig = mergeWithDefaults(JSON.parse(raw) as Partial<AppConfig>)
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG }
  }

  return cachedConfig
}

export async function getEffectiveConfig(): Promise<AppConfig> {
  const config = await loadConfig()
  return mergeWithEnv(config)
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
  const current = await loadConfig()
  const next = mergeWithDefaults({
    ...current,
    ...partial,
    llm: { ...current.llm, ...partial.llm },
    prompts: { ...current.prompts, ...partial.prompts },
    research: { ...current.research, ...partial.research },
    quickPicks: partial.quickPicks ? normalizeQuickPicks({ ...current.quickPicks, ...partial.quickPicks }) : current.quickPicks
  })

  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getConfigPath(), JSON.stringify(next, null, 2), 'utf-8')
  cachedConfig = next
  return next
}

export function invalidateConfigCache(): void {
  cachedConfig = null
}
