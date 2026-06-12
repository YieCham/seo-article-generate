import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'

export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
  content: string
  status?: 'streaming' | 'done' | 'error'
}

export interface StoredChatSession {
  id: string
  title: string
  messages: StoredChatMessage[]
  updatedAt: number
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
      .map((message) =>
        message.role === 'assistant' && message.status === 'streaming'
          ? { ...message, status: 'done' as const }
          : message
      )
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
        updatedAt: session.updatedAt || Date.now(),
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
