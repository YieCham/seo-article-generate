export interface ResearchSourcePreview {
  title: string
  url: string
  snippet: string
  position: number
  scraped: boolean
  error?: string
}

export interface GenerateProgressEvent {
  type: 'chunk' | 'status' | 'error' | 'done' | 'cancelled' | 'replace' | 'research' | 'reset' | 'planning' | 'prepend'
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

export interface LlmPreset {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

export interface PromptConfig {
  systemPrompt: string
  userPrompt: string
}

export type PipelineMode = 'create' | 'optimize'

export interface ModePromptsConfig {
  create: PromptConfig
  optimize: PromptConfig
}

export interface ModeEnabledSkillsConfig {
  create: string[]
  optimize: string[]
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
  defaultOutputLanguage: string
}

export interface AppConfig {
  llmPresets: LlmPreset[]
  activeLlmPresetId: string
  llmMaxTokens: number
  prompts: ModePromptsConfig
  research: ResearchConfig
  quickPicks: QuickPicksConfig
  enabledSkills: ModeEnabledSkillsConfig
  skillEnablementInitialized?: boolean
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
    customTitle?: string
    messages: Array<{
      id: string
      role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
      content: string
      status?: 'streaming' | 'revising' | 'pendingApply' | 'done' | 'error'
    }>
    updatedAt: number
    writeMode?: 'create' | 'optimize'
  }>
}

export interface ActionResult {
  ok: boolean
  message?: string
}

export interface TokenUsageRecord {
  id: string
  timestamp: number
  runId: string
  pipeline: 'create' | 'optimize' | 'sectionEdit' | 'test' | 'other'
  step: string
  label: string
  model: string
  topic?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  maxTokensRequested?: number
  estimated: boolean
}

export interface TokenUsageSummary {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  recordCount: number
  runCount: number
  todayTotalTokens: number
  todayRecordCount: number
  byPipeline: Record<string, number>
}

export interface TokenUsageLogResponse {
  records: TokenUsageRecord[]
  summary: TokenUsageSummary
}

export type SectionEditMode = 'rewrite' | 'insert'

export interface RewriteArticleSectionRequest {
  fullArticle: string
  selectedText: string
  selectionStart: number
  selectionEnd: number
  instruction: string
  mode: SectionEditMode
  topic?: string
  outputLanguage?: string
}

export interface RewriteArticleSectionResult {
  ok: boolean
  message?: string
  updatedArticle?: string
}

declare global {
  interface Window {
    app: {
      generateArticle: (request: {
        topic: string
        extraInstructions?: string
        outputLanguage?: string
      }) => Promise<GenerateArticleResult>
      optimizeArticle: (request: {
        sourceUrl: string
        extraInstructions?: string
        outputLanguage?: string
      }) => Promise<GenerateArticleResult>
      cancelArticle: () => Promise<{ ok: boolean }>
      reviseArticle: (request: {
        article: string
        instruction: string
        outputLanguage?: string
        pipeline?: 'create' | 'optimize'
      }) => Promise<GenerateArticleResult>
      rewriteArticleSection: (request: RewriteArticleSectionRequest) => Promise<RewriteArticleSectionResult>
      onProgress: (callback: (event: GenerateProgressEvent) => void) => () => void
      getConfig: () => Promise<AppConfig>
      saveConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
      testLlmConnection: () => Promise<ActionResult>
      testTavilyConnection: (apiKey: string) => Promise<ActionResult>
      testFirecrawlConnection: (apiKey: string) => Promise<ActionResult>
      listSkills: (mode?: PipelineMode) => Promise<SkillItem[]>
      saveSkill: (skill: SkillItem, mode?: PipelineMode) => Promise<SkillItem>
      deleteSkill: (id: string) => Promise<void>
      setSkillEnabled: (id: string, enabled: boolean, mode?: PipelineMode) => Promise<void>
      syncArticleTypeSkills: (articleType: 'how-to' | 'review' | 'top-rank') => Promise<void>
      getTokenUsageLog: () => Promise<TokenUsageLogResponse>
      clearTokenUsageLog: () => Promise<{ ok: true }>
      loadChatStore: () => Promise<ChatStoreData>
      saveChatStore: (data: ChatStoreData) => Promise<{ ok: true }>
      platform: NodeJS.Platform
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      windowIsMaximized: () => Promise<boolean>
      popupAppMenu: (label: string, x: number, y: number) => Promise<void>
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
    }
  }
}

export {}
