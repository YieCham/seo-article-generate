import { contextBridge, ipcRenderer } from 'electron'

export interface GenerateArticleRequest {
  topic: string
  extraInstructions?: string
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

export interface ActionResult {
  ok: boolean
  message?: string
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

const api = {
  generateArticle: (request: GenerateArticleRequest): Promise<GenerateArticleResult> =>
    ipcRenderer.invoke('article:generate', request),
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
  testLlmConnection: (): Promise<ActionResult> => ipcRenderer.invoke('config:testLlm'),
  testTavilyConnection: (apiKey: string): Promise<ActionResult> =>
    ipcRenderer.invoke('config:testTavily', apiKey),
  testFirecrawlConnection: (apiKey: string): Promise<ActionResult> =>
    ipcRenderer.invoke('config:testFirecrawl', apiKey),
  listSkills: (): Promise<SkillItem[]> => ipcRenderer.invoke('skills:list'),
  saveSkill: (skill: SkillItem): Promise<SkillItem> => ipcRenderer.invoke('skills:save', skill),
  deleteSkill: (id: string): Promise<void> => ipcRenderer.invoke('skills:delete', id),
  setSkillEnabled: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('skills:setEnabled', id, enabled),
  loadChatStore: (): Promise<ChatStoreData> => ipcRenderer.invoke('chat:load'),
  saveChatStore: (data: ChatStoreData): Promise<{ ok: true }> => ipcRenderer.invoke('chat:save', data)
}

contextBridge.exposeInMainWorld('app', api)

export type AppApi = typeof api
