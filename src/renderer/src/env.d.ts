import type {
  WordPressConfig,
  WordPressDraftBinding,
  WordPressPreset,
  WordPressPublishLogRecord,
  WordPressPublishRequest,
  WordPressPublishResult,
  WordPressSettings,
  WordPressTerm,
  WordPressTermsResult,
  WordPressTestResult
} from '../../shared/wordpress'

export type {
  WordPressConfig,
  WordPressDraftBinding,
  WordPressPreset,
  WordPressPublishLogRecord,
  WordPressPublishRequest,
  WordPressPublishResult,
  WordPressSettings,
  WordPressTerm,
  WordPressTermsResult,
  WordPressTestResult
}

export type {
  IllustrationImage,
  IllustrationLibrary,
  IllustrationProduct
} from '../../shared/illustrationLibrary'

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
    | 'researchPack'
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
  researchPack?: import('../../shared/researchPack').ResearchPack
}

export interface GenerateArticleResult {
  ok: boolean
  message?: string
}

export type LlmReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'max'

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  reasoningEffort?: LlmReasoningEffort
}

export interface LlmPreset {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  models: string[]
  temperature: number
  modelReasoningEffort?: Record<string, LlmReasoningEffort>
}

export interface PromptConfig {
  systemPrompt: string
  userPrompt: string
}

export type PipelineMode = 'create' | 'optimize' | 'batch-optimize'
export type SkillListMode = PipelineMode | 'writing-style'

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
  wordpressPresetId?: string
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

export interface LlmModelRef {
  presetId: string
  model: string
}

export interface LlmRoleRoutingConfig {
  enabled: boolean
  preBodyAndMeta: LlmModelRef
  bodyWork: LlmModelRef
}

export interface ImageGenConfig {
  apiUrl: string
  apiKey: string
  model: string
  size: string
  defaultPrompt: string
}

export interface NetworkProxyConfig {
  enabled: boolean
  host: string
  port: number
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
  skillEnablementInitialized?: boolean
  windowClose?: WindowCloseBehavior
  imageGen: ImageGenConfig
  networkProxy: NetworkProxyConfig
  wordpress: WordPressSettings
}

export interface GenerateImageRequest {
  prompt?: string
  size?: string
  model?: string
}

export interface EditImageRequest {
  prompt: string
  size?: string
  model?: string
  fileName?: string
  imageDataUrl?: string
  imageUrl?: string
}

export interface GenerateImageResult {
  ok: boolean
  message?: string
  imageSrc?: string
  fileName?: string
  mimeType?: string
  prompt?: string
  size?: string
  model?: string
}

export interface ImageHistoryItem {
  id: string
  prompt: string
  size: string
  model: string
  createdAt: number
  fileName: string
  mimeType: string
  imageSrc: string
}

export interface ImportImageResult {
  ok: boolean
  canceled?: boolean
  message?: string
  item?: ImageHistoryItem
}

export interface SkillItem {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  bundled?: boolean
  forced?: boolean
}

export interface KnowledgeDoc {
  id: string
  title: string
  tags: string[]
  content: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface SaveKnowledgeDocInput {
  id?: string
  title: string
  tags?: string[] | string
  content: string
  enabled?: boolean
}

export interface SaveIllustrationProductInput {
  id?: string
  name: string
}

export interface SaveIllustrationImageInput {
  productId: string
  id?: string
  url: string
  alt?: string
  caption?: string
  stepKey?: string
  matchKeywords?: string[] | string
}

export interface ImportIllustrationFileResult {
  ok: true
  canceled?: boolean
  library: import('../../shared/illustrationLibrary').IllustrationLibrary
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
    researchPack?: import('../../shared/researchPack').ResearchPack
    wordpressDraft?: WordPressDraftBinding
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
        writingStyleSkillId?: string
        reuseResearch?: import('../../shared/researchPack').CreateResearchPack
      }) => Promise<GenerateArticleResult>
      optimizeArticle: (request: {
        sourceUrl: string
        extraInstructions?: string
        outputLanguage?: string
        llmPresetId?: string
        llmModel?: string
        reuseResearch?: import('../../shared/researchPack').OptimizeResearchPack
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
      insertIllustrations: (request: {
        article: string
        productId?: string
        productName?: string
        outputLanguage?: string
        pipeline?: 'create' | 'optimize'
        topic?: string
        llmPresetId?: string
        llmModel?: string
      }) => Promise<GenerateArticleResult>
      onProgress: (callback: (event: GenerateProgressEvent) => void) => () => void
      getConfig: () => Promise<AppConfig>
      saveConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>
      generateImage: (request?: GenerateImageRequest) => Promise<GenerateImageResult>
      editImage: (request: EditImageRequest) => Promise<GenerateImageResult>
      importImage: () => Promise<ImportImageResult>
      listImageHistory: () => Promise<ImageHistoryItem[]>
      deleteImageHistoryItem: (id: string) => Promise<{ ok: true }>
      clearImageHistory: () => Promise<{ ok: true }>
      testLlmConnection: (options?: { presetId?: string; model?: string }) => Promise<ActionResult>
      listLlmModels: (presetId: string) => Promise<ListLlmModelsResult>
      testTavilyConnection: (apiKey: string) => Promise<ActionResult>
      testFirecrawlConnection: (apiKey: string) => Promise<ActionResult>
      listSkills: (mode?: SkillListMode) => Promise<SkillItem[]>
      saveSkill: (skill: SkillItem, mode?: SkillListMode) => Promise<SkillItem>
      deleteSkill: (id: string) => Promise<void>
      setSkillEnabled: (id: string, enabled: boolean, mode?: SkillListMode) => Promise<void>
      syncArticleTypeSkills: (articleType: 'how-to' | 'review' | 'top-rank') => Promise<void>
      listKnowledgeDocs: () => Promise<KnowledgeDoc[]>
      saveKnowledgeDoc: (input: SaveKnowledgeDocInput) => Promise<KnowledgeDoc>
      deleteKnowledgeDoc: (id: string) => Promise<{ ok: true }>
      setKnowledgeDocEnabled: (id: string, enabled: boolean) => Promise<KnowledgeDoc>
      importKnowledgeDocs: () => Promise<{ ok: true; imported: KnowledgeDoc[]; canceled?: boolean }>
      getIllustrationLibrary: () => Promise<
        import('../../shared/illustrationLibrary').IllustrationLibrary
      >
      saveIllustrationProduct: (
        input: SaveIllustrationProductInput
      ) => Promise<import('../../shared/illustrationLibrary').IllustrationLibrary>
      deleteIllustrationProduct: (
        id: string
      ) => Promise<import('../../shared/illustrationLibrary').IllustrationLibrary>
      saveIllustrationImage: (
        input: SaveIllustrationImageInput
      ) => Promise<import('../../shared/illustrationLibrary').IllustrationLibrary>
      deleteIllustrationImage: (
        productId: string,
        imageId: string
      ) => Promise<import('../../shared/illustrationLibrary').IllustrationLibrary>
      importIllustrationFile: (productId: string) => Promise<ImportIllustrationFileResult>
      getTokenUsageLog: () => Promise<TokenUsageLogResponse>
      clearTokenUsageLog: () => Promise<{ ok: true }>
      testWordPressConnection: (override?: Partial<WordPressPreset>) => Promise<WordPressTestResult>
      listWordPressTerms: (override?: Partial<WordPressPreset>) => Promise<WordPressTermsResult>
      publishWordPressDraft: (request: WordPressPublishRequest) => Promise<WordPressPublishResult>
      getWordPressPublishLog: () => Promise<{ records: WordPressPublishLogRecord[] }>
      clearWordPressPublishLog: () => Promise<{ ok: true }>
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
