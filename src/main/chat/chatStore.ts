import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import type { PipelineCheckpoint } from '../../shared/pipelineCheckpoint'

export type StoredWriteMode = 'create' | 'optimize' | 'batch-optimize'

function normalizeStoredWriteMode(value: unknown): StoredWriteMode {
  if (value === 'optimize') return 'optimize'
  if (value === 'batch-optimize') return 'batch-optimize'
  return 'create'
}

export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
  content: string
  status?: 'streaming' | 'revising' | 'pendingApply' | 'done' | 'error' | 'interrupted'
}

export type StoredListStatus = 'active' | 'completed'

function normalizeStoredListStatus(value: unknown): StoredListStatus | undefined {
  return value === 'completed' ? 'completed' : value === 'active' ? 'active' : undefined
}

export interface StoredChatSession {
  id: string
  title: string
  customTitle?: string
  pinned?: boolean
  pinnedAt?: number
  sortOrder?: number
  listStatus?: StoredListStatus
  messages: StoredChatMessage[]
  writeMode?: StoredWriteMode
  llmPresetId?: string
  llmModel?: string
  updatedAt: number
  pipelineCheckpoint?: PipelineCheckpoint
}

export interface ChatStoreData {
  activeSessionId: string
  sessions: StoredChatSession[]
}

const EMPTY_STORE: ChatStoreData = {
  activeSessionId: '',
  sessions: []
}

function getChatStorePath(): string {
  return join(app.getPath('userData'), 'chat-sessions.json')
}

function normalizeForSave(data: ChatStoreData): ChatStoreData {
  const sessions = data.sessions.map((session) => ({
    ...session,
    messages: session.messages
      .filter((message) => message.role !== 'status')
      .map((message) => {
        if (message.role !== 'assistant' || message.status !== 'streaming') {
          return message
        }
        if (session.pipelineCheckpoint) {
          return { ...message, status: 'interrupted' as const }
        }
        return { ...message, status: 'done' as const }
      })
  }))

  const activeSessionId =
    sessions.some((session) => session.id === data.activeSessionId) && data.activeSessionId
      ? data.activeSessionId
      : (sessions[0]?.id ?? '')

  return { activeSessionId, sessions }
}

export async function loadChatStore(): Promise<ChatStoreData> {
  try {
    const raw = await readFile(getChatStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as ChatStoreData
    if (!Array.isArray(parsed.sessions)) return { ...EMPTY_STORE }

    const sessions = parsed.sessions
      .filter((session) => session && typeof session.id === 'string')
      .map((session) => ({
        id: session.id,
        title: session.title || '新对话',
        customTitle: typeof session.customTitle === 'string' ? session.customTitle : undefined,
        pinned: session.pinned === true,
        pinnedAt: typeof session.pinnedAt === 'number' ? session.pinnedAt : undefined,
        sortOrder: typeof session.sortOrder === 'number' ? session.sortOrder : undefined,
        listStatus: normalizeStoredListStatus(session.listStatus),
        writeMode: normalizeStoredWriteMode(session.writeMode),
        updatedAt: session.updatedAt || Date.now(),
        pipelineCheckpoint: session.pipelineCheckpoint,
        messages: Array.isArray(session.messages) ? session.messages : []
      }))

    const activeSessionId =
      sessions.some((session) => session.id === parsed.activeSessionId) && parsed.activeSessionId
        ? parsed.activeSessionId
        : (sessions[0]?.id ?? '')

    return { activeSessionId, sessions }
  } catch {
    return { ...EMPTY_STORE }
  }
}

export async function saveChatStore(data: ChatStoreData): Promise<void> {
  const next = normalizeForSave(data)
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getChatStorePath(), JSON.stringify(next, null, 2), 'utf-8')
}
