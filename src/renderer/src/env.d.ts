export interface ResearchSourcePreview {
  title: string
  url: string
  snippet: string
  position: number
  scraped: boolean
  error?: string
}

export interface GenerateProgressEvent {
  type:
    | 'chunk'
    | 'status'
    | 'error'
    | 'done'
    | 'cancelled'
    | 'replace'
    | 'research'
    | 'reset'
    | 'planning'
    | 'prepend'
    | 'checkpoint'
    | 'clearCheckpoint'
  text?: string
  message?: string
  step?: string
  researchSummary?: string
  planningSummary?: string
  sources?: ResearchSourcePreview[]
  checkpoint?: import('../../shared/pipelineCheckpoint').PipelineCheckpoint
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
  models: string[]
  temperature: number
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
}

export interface QuickPicksConfig {
  products: QuickPickOption[]
  defaultOutputLanguage: string
}

export type WindowCloseAction = 'minimize-to-tray' | 'quit'

export interface WindowCloseBehavior {
  skipPrompt: boolean
  defaultAction: WindowCloseAction
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
  windowClose?: WindowCloseBehavior
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
    pinned?: boolean
    pinnedAt?: number
    sortOrder?: number
    listStatus?: 'active' | 'completed'
    messages: Array<{
      id: string
      role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
      content: string
      status?: 'streaming' | 'revising' | 'pendingApply' | 'done' | 'error' | 'interrupted'
    }>
    updatedAt: number
    writeMode?: 'create' | 'optimize' | 'batch-optimize'
    llmPresetId?: string
    llmModel?: string
    pipelineCheckpoint?: import('../../shared/pipelineCheckpoint').PipelineCheckpoint
  }>
}

export interface ActionResult {
  ok: boolean
  message?: string
}

export interface LlmModelBrandGroup {
  brand: string
  models: string[]
}

export interface ListLlmModelsResult {
  ok: boolean
  message?: string
  groups?: LlmModelBrandGroup[]
  total?: number
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

export interface ReviseArticleSelection {
  start: number
  end: number
  text: string
  displayText: string
}

declare global {
  interface Window {
    app: {
      generateArticle: (request: {
        topic: string
        extraInstructions?: string
        outputLanguage?: string
        llmPresetId?: string
        llmModel?: string
      }) => Promise<GenerateArticleResult>
      optimizeArticle: (request: {
        sourceUrl: string
        extraInstructions?: string
        outputLanguage?: string
        llmPresetId?: string
        llmModel?: string
      }) => Promise<GenerateArticleResult>
      batchOptimizePage: (request: {
        sourceUrl: string
        extraInstructions?: string
        outputLanguage?: string
        llmPresetId?: string
        llmModel?: string
      }) => Promise<GenerateArticleResult>
      resumeArticle: (
        checkpoint: import('../../shared/pipelineCheckpoint').PipelineCheckpoint
      ) => Promise<GenerateArticleResult>
      cancelArticle: () => Promise<{ ok: boolean }>
      reviseArticle: (request: {
        article: string
        instruction: string
        outputLanguage?: string
        pipeline?: 'create' | 'optimize'
        topic?: string
        selection?: ReviseArticleSelection
        llmPresetId?: string
        llmModel?: string
      }) => Promise<GenerateArticleResult>
      onProgress: (callback: (event: GenerateProgressEvent) => void) => () => void
      getConfig: () => Promise<AppConfig>
      saveConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
      testLlmConnection: (options?: { presetId?: string; model?: string }) => Promise<ActionResult>
      listLlmModels: (presetId: string) => Promise<ListLlmModelsResult>
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
      windowRequestClose: () => void
      windowMinimizeToTray: () => void
      windowQuit: () => void
      windowIsMaximized: () => Promise<boolean>
      popupAppMenu: (label: string, x: number, y: number) => Promise<void>
      onWindowMaximized: (callback: (maximized: boolean) => void) => () => void
      onCloseRequested: (callback: () => void) => () => void
    }
  }
}

export {}
