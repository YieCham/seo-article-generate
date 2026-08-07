import { contextBridge, ipcRenderer } from 'electron'
import type { PipelineCheckpoint } from '../shared/pipelineCheckpoint'
import type { CreateResearchPack, OptimizeResearchPack, ResearchPack } from '../shared/researchPack'

export interface GenerateArticleRequest {
  topic: string
  extraInstructions?: string
  outputLanguage?: string
  llmPresetId?: string
  llmModel?: string
  reuseResearch?: CreateResearchPack
}

export interface OptimizeArticleRequest {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: string
  llmPresetId?: string
  llmModel?: string
  reuseResearch?: OptimizeResearchPack
}

export interface BatchOptimizePageRequest {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: string
  llmPresetId?: string
  llmModel?: string
}

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
  checkpoint?: PipelineCheckpoint
  researchPack?: ResearchPack
}

export interface ReviseArticleSelection {
  start: number
  end: number
  text: string
  displayText: string
}

export interface ReviseArticleRequest {
  article: string
  instruction: string
  outputLanguage?: string
  pipeline?: 'create' | 'optimize'
  topic?: string
  selection?: ReviseArticleSelection
  llmPresetId?: string
  llmModel?: string
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
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'max'
}

export interface LlmPreset {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  models: string[]
  temperature: number
  modelReasoningEffort?: Record<string, 'none' | 'low' | 'medium' | 'high' | 'max'>
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
  llmRoleRouting?: {
    enabled: boolean
    preBodyAndMeta: { presetId: string; model: string }
    bodyWork: { presetId: string; model: string }
  }
  prompts: ModePromptsConfig
  research: ResearchConfig
  quickPicks: QuickPicksConfig
  enabledSkills: ModeEnabledSkillsConfig
  skillEnablementInitialized?: boolean
  imageGen?: ImageGenConfig
}

export interface ImageGenConfig {
  apiUrl: string
  apiKey: string
  model: string
  size: string
  defaultPrompt: string
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
  imageDataUrl?: string
  imageUrl?: string
}

export interface GenerateImageResult {
  ok: boolean
  message?: string
  imageDataUrl?: string
  imageUrl?: string
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
  imageDataUrl: string
}

export interface SkillItem {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  bundled?: boolean
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
    pipelineCheckpoint?: import('../shared/pipelineCheckpoint').PipelineCheckpoint
    researchPack?: import('../shared/researchPack').ResearchPack
  }>
}

const api = {
  generateArticle: (request: GenerateArticleRequest): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:generate', request),
  optimizeArticle: (request: OptimizeArticleRequest): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:optimize', request),
  batchOptimizePage: (request: BatchOptimizePageRequest): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:batchOptimize', request),
  resumeArticle: (checkpoint: PipelineCheckpoint): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:resume', checkpoint),
  cancelArticle: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('article:cancel'),
  reviseArticle: (request: ReviseArticleRequest): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:revise', request),
  onProgress: (callback: (event: GenerateProgressEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: GenerateProgressEvent): void => {
      callback(event)
    }
    ipcRenderer.on('article:progress', listener)
    return () => ipcRenderer.removeListener('article:progress', listener)
  },
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (partial: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('config:save', partial),
  generateImage: (request?: GenerateImageRequest): Promise<GenerateImageResult> =>
    ipcRenderer.invoke('image:generate', request),
  editImage: (request: EditImageRequest): Promise<GenerateImageResult> =>
    ipcRenderer.invoke('image:edit', request),
  listImageHistory: (): Promise<ImageHistoryItem[]> => ipcRenderer.invoke('image:history:list'),
  deleteImageHistoryItem: (id: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke('image:history:delete', id),
  clearImageHistory: (): Promise<{ ok: true }> => ipcRenderer.invoke('image:history:clear'),
  testLlmConnection: (options?: { presetId?: string; model?: string }): Promise<ActionResult> =>
    ipcRenderer.invoke('config:testLlm', options),
  listLlmModels: (presetId: string): Promise<ListLlmModelsResult> =>
    ipcRenderer.invoke('config:listLlmModels', presetId),
  testTavilyConnection: (apiKey: string): Promise<ActionResult> =>
    ipcRenderer.invoke('config:testTavily', apiKey),
  testFirecrawlConnection: (apiKey: string): Promise<ActionResult> =>
    ipcRenderer.invoke('config:testFirecrawl', apiKey),
  listSkills: (mode?: PipelineMode): Promise<SkillItem[]> => ipcRenderer.invoke('skills:list', mode),
  saveSkill: (skill: SkillItem, mode?: PipelineMode): Promise<SkillItem> =>
    ipcRenderer.invoke('skills:save', skill, mode),
  deleteSkill: (id: string): Promise<void> => ipcRenderer.invoke('skills:delete', id),
  setSkillEnabled: (id: string, enabled: boolean, mode?: PipelineMode): Promise<void> =>
    ipcRenderer.invoke('skills:setEnabled', id, enabled, mode),
  syncArticleTypeSkills: (articleType: 'how-to' | 'review' | 'top-rank'): Promise<void> =>
    ipcRenderer.invoke('skills:syncArticleType', articleType),
  getTokenUsageLog: (): Promise<TokenUsageLogResponse> => ipcRenderer.invoke('tokenUsage:get'),
  clearTokenUsageLog: (): Promise<{ ok: true }> => ipcRenderer.invoke('tokenUsage:clear'),
  loadChatStore: (): Promise<ChatStoreData> => ipcRenderer.invoke('chat:load'),
  saveChatStore: (data: ChatStoreData): Promise<{ ok: true }> => ipcRenderer.invoke('chat:save', data),
  platform: process.platform,
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowMaximize: (): void => ipcRenderer.send('window:maximize'),
  windowClose: (): void => ipcRenderer.send('window:close'),
  windowRequestClose: (): void => ipcRenderer.send('window:requestClose'),
  windowMinimizeToTray: (): void => ipcRenderer.send('window:minimizeToTray'),
  windowQuit: (): void => ipcRenderer.send('window:quit'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  popupAppMenu: (label: string, x: number, y: number): Promise<void> =>
    ipcRenderer.invoke('window:popupMenu', label, x, y),
  onWindowMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, maximized: boolean): void => {
      callback(maximized)
    }
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
  onCloseRequested: (callback: () => void): (() => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('window:closeRequested', listener)
    return () => ipcRenderer.removeListener('window:closeRequested', listener)
  }
}

contextBridge.exposeInMainWorld('app', api)

export type AppApi = typeof api
