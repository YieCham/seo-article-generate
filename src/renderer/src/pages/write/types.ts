import type { WriteMode } from '../../constants/writeMode'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
  content: string
  status?: 'streaming' | 'revising' | 'pendingApply' | 'done' | 'error'
  /** Snapshot before a pending AI revision (assistant only). */
  revisionBaseline?: string
  revisionUserMessageId?: string
  /** Links a revision request user message to its assistant article (user only). */
  revisionTargetAssistantId?: string
}

export interface ChatSession {
  id: string
  title: string
  customTitle?: string
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
  if (session.customTitle?.trim()) return session.customTitle.trim()

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

export function getLatestDoneAssistantMessage(session: ChatSession): ChatMessage | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role === 'assistant' && message.status === 'done' && message.content.trim()) {
      return message
    }
  }
  return null
}

export function sessionHasCompletedArticle(session: ChatSession): boolean {
  return getLatestDoneAssistantMessage(session) != null
}

export function sessionHasPendingRevision(session: ChatSession): boolean {
  return session.messages.some(
    (message) => message.role === 'assistant' && message.status === 'pendingApply'
  )
}

export function getPendingRevisionAssistant(session: ChatSession): ChatMessage | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role === 'assistant' && message.status === 'pendingApply') {
      return message
    }
  }
  return null
}

export function canDeleteChatMessage(message: ChatMessage, isRunning: boolean): boolean {
  if (message.role === 'status') return false
  if (isRunning) return false
  if (message.role === 'assistant') {
    if (
      message.status === 'streaming' ||
      message.status === 'revising' ||
      message.status === 'pendingApply'
    ) {
      return false
    }
  }
  return true
}

/** True after the first article is generated, including while a revision is in progress. */
export function sessionIsInFollowUpMode(session: ChatSession): boolean {
  if (sessionHasCompletedArticle(session)) return true
  if (sessionHasPendingRevision(session)) return true

  if (session.messages.some((message) => message.role === 'assistant' && message.status === 'revising')) {
    return true
  }

  const userMessages = session.messages.filter((message) => message.role === 'user')
  const assistantMessages = session.messages.filter((message) => message.role === 'assistant')

  if (assistantMessages.length === 0) return false
  if (userMessages.length > 1) return true

  return userMessages.some((message) => message.content.startsWith('**修改说明**'))
}
