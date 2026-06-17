import type { WriteMode } from '../../constants/writeMode'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
  content: string
  status?: 'streaming' | 'done' | 'error'
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  writeMode: WriteMode
  updatedAt: number
}

export function createSession(writeMode: WriteMode = 'create'): ChatSession {
  const id = crypto.randomUUID()
  return {
    id,
    title: '新对话',
    messages: [],
    writeMode,
    updatedAt: Date.now()
  }
}

export function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    status: role === 'assistant' ? 'streaming' : undefined
  }
}

export function sessionTitleFromPrompt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return '新对话'
  return trimmed
}

export function sessionTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url.trim()).hostname.replace(/^www\./i, '')
    return hostname || '页面优化'
  } catch {
    return sessionTitleFromPrompt(url)
  }
}

export function extractArticleTitle(content: string): string | null {
  const match = content.match(/^#\s+(.+?)(?:\n|$)/m)
  const title = match?.[1]?.trim()
  return title || null
}

export function getSessionDisplayTitle(session: ChatSession): string {
  const assistant = [...session.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content.trim())

  if (assistant) {
    const articleTitle = extractArticleTitle(assistant.content)
    if (articleTitle) return articleTitle
  }

  const firstUser = session.messages.find((message) => message.role === 'user')
  if (firstUser?.content.trim()) {
    return sessionTitleFromPrompt(firstUser.content)
  }

  return session.title
}
