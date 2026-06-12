export interface ResearchSourcePreview {
  title: string
  url: string
  snippet: string
  position: number
  scraped: boolean
  error?: string
}

export interface GenerateProgressEvent {
  type: 'chunk' | 'status' | 'error' | 'done' | 'research' | 'reset' | 'planning'
  text?: string
  message?: string
  step?: string
  researchSummary?: string
  planningSummary?: string
  sources?: ResearchSourcePreview[]
}

export interface GenerateArticleResult {
  ok: boolean
  message?: string
}

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
}

export interface SkillItem {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  bundled?: boolean
}

export interface ChatStoreData {
  activeSessionId: string
  sessions: Array<{
    id: string
    title: string
    messages: Array<{
      id: string
      role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
      content: string
      status?: 'streaming' | 'done' | 'error'
    }>
    updatedAt: number
  }>
}

export interface ActionResult {
  ok: boolean
  message?: string
}

declare global {
  interface Window {
    app: {
      generateArticle: (request: {
        topic: string
        extraInstructions?: string
      }) => Promise<GenerateArticleResult>
      onProgress: (callback: (event: GenerateProgressEvent) => void) => () => void
      getConfig: () => Promise<AppConfig>
      saveConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
      testLlmConnection: () => Promise<ActionResult>
      testTavilyConnection: (apiKey: string) => Promise<ActionResult>
      testFirecrawlConnection: (apiKey: string) => Promise<ActionResult>
      listSkills: () => Promise<SkillItem[]>
      saveSkill: (skill: SkillItem) => Promise<SkillItem>
      deleteSkill: (id: string) => Promise<void>
      setSkillEnabled: (id: string, enabled: boolean) => Promise<void>
      loadChatStore: () => Promise<ChatStoreData>
      saveChatStore: (data: ChatStoreData) => Promise<{ ok: true }>
    }
  }
}

export {}
