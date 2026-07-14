import { normalizeWriteMode, type WriteMode } from '../../constants/writeMode'
import type { PipelineCheckpoint } from '../../../../shared/pipelineCheckpoint'

export interface ReviseArticleSelection {
  start: number
  end: number
  text: string
  /** Visible text from the browser selection (for UI preview). */
  displayText: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status' | 'research' | 'planning'
  content: string
  status?: 'streaming' | 'revising' | 'pendingApply' | 'done' | 'error' | 'interrupted'
  /** Snapshot before a pending AI revision (assistant only). */
  revisionBaseline?: string
  revisionUserMessageId?: string
  /** Links a revision request user message to its assistant article (user only). */
  revisionTargetAssistantId?: string
}

export type SessionLifecycleGroup = 'active' | 'completed'

export interface ChatSession {
  id: string
  title: string
  customTitle?: string
  pinned?: boolean
  pinnedAt?: number
  /** Manual order within the same pin tier and write mode; lower appears higher. */
  sortOrder?: number
  /** Sidebar lifecycle bucket; default active (进行中). */
  listStatus?: SessionLifecycleGroup
  messages: ChatMessage[]
  writeMode: WriteMode
  llmPresetId?: string
  llmModel?: string
  updatedAt: number
  pipelineCheckpoint?: PipelineCheckpoint
}

export function getSessionLifecycleGroup(session: ChatSession): SessionLifecycleGroup {
  return session.listStatus === 'completed' ? 'completed' : 'active'
}

export type SessionListGroup = 'create' | 'optimize' | 'batch-optimize'

export function getSessionListGroup(session: ChatSession): SessionListGroup {
  return normalizeWriteMode(session.writeMode)
}

export function sortSessions(items: ChatSession[]): ChatSession[] {
  const indexMap = new Map(items.map((item, index) => [item.id, index]))
  return [...items].sort((a, b) => {
    const aPinned = a.pinned ? 1 : 0
    const bPinned = b.pinned ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned

    const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER
    const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder

    return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)
  })
}

/** Assign sortOrder only for sessions that do not have one yet (migration). */
export function normalizeAllSessionSortOrders(sessions: ChatSession[]): ChatSession[] {
  if (!sessions.some((session) => typeof session.sortOrder !== 'number')) {
    return sessions
  }

  const next = sessions.map((session) => ({ ...session }))

  for (const group of ['create', 'optimize', 'batch-optimize'] as SessionListGroup[]) {
    for (const pinned of [false, true]) {
      const bucket = next.filter(
        (session) =>
          sessionMatchesListGroup(session, group) && Boolean(session.pinned) === pinned
      )
      if (!bucket.some((session) => typeof session.sortOrder !== 'number')) continue

      const ordered = sortSessions(bucket)
      ordered.forEach((session, index) => {
        const itemIndex = next.findIndex((item) => item.id === session.id)
        if (itemIndex >= 0) next[itemIndex] = { ...next[itemIndex], sortOrder: index }
      })
    }
  }

  return next
}

export function insertSessionAtListTop(
  sessions: ChatSession[],
  session: ChatSession
): ChatSession[] {
  const group = getSessionListGroup(session)
  const pinned = Boolean(session.pinned)
  const bumped = sessions.map((item) => {
    if (!sessionMatchesListGroup(item, group) || Boolean(item.pinned) !== pinned) {
      return item
    }
    const baseOrder = typeof item.sortOrder === 'number' ? item.sortOrder : 0
    return { ...item, sortOrder: baseOrder + 1 }
  })

  return [{ ...session, sortOrder: 0 }, ...bumped]
}

function sessionMatchesListGroup(session: ChatSession, group: SessionListGroup): boolean {
  return getSessionListGroup(session) === group
}

export function canReorderSessionsTogether(a: ChatSession, b: ChatSession): boolean {
  if (a.id === b.id) return false
  if (getSessionLifecycleGroup(a) !== getSessionLifecycleGroup(b)) return false
  if (getSessionListGroup(a) !== getSessionListGroup(b)) return false
  return Boolean(a.pinned) === Boolean(b.pinned)
}

export function reorderSessions(
  sessions: ChatSession[],
  group: SessionListGroup,
  draggedId: string,
  targetId: string,
  position: 'before' | 'after'
): ChatSession[] {
  const dragged = sessions.find((session) => session.id === draggedId)
  const target = sessions.find((session) => session.id === targetId)
  if (!dragged || !target || !canReorderSessionsTogether(dragged, target)) {
    return sessions
  }

  const bucket = sessions.filter(
    (session) =>
      sessionMatchesListGroup(session, group) && Boolean(session.pinned) === Boolean(dragged.pinned)
  )
  const orderedIds = sortSessions(bucket).map((session) => session.id)
  const fromIndex = orderedIds.indexOf(draggedId)
  const targetIndex = orderedIds.indexOf(targetId)
  if (fromIndex < 0 || targetIndex < 0) return sessions

  const nextIds = orderedIds.filter((id) => id !== draggedId)
  let insertIndex = position === 'before' ? targetIndex : targetIndex + 1
  if (fromIndex < targetIndex) insertIndex -= 1
  insertIndex = Math.max(0, Math.min(insertIndex, nextIds.length))
  nextIds.splice(insertIndex, 0, draggedId)

  const orderMap = new Map(nextIds.map((id, index) => [id, index]))
  return sessions.map((session) => {
    const sortOrder = orderMap.get(session.id)
    if (sortOrder === undefined) return session
    return { ...session, sortOrder }
  })
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

/** Top bar title; hidden for brand-new empty sessions until the user sends a message. */
export function getSessionTopbarTitle(session: ChatSession): string | null {
  if (!session.customTitle?.trim() && session.messages.length === 0) {
    return null
  }
  return getSessionDisplayTitle(session)
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

/** Mark idle streaming assistants as done so follow-up revision UI becomes available. */
export function normalizeIdleStreamingAssistants(session: ChatSession): ChatSession {
  let changed = false
  const messages = session.messages.map((message) => {
    if (
      message.role === 'assistant' &&
      message.status === 'streaming' &&
      message.content.trim()
    ) {
      changed = true
      return { ...message, status: 'done' as const }
    }
    return message
  })
  return changed ? { ...session, messages } : session
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

export function getInterruptedAssistantMessage(session: ChatSession): ChatMessage | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (message.role === 'assistant' && message.status === 'interrupted') {
      return message
    }
  }
  return null
}

export function sessionCanResume(session: ChatSession): boolean {
  return Boolean(session.pipelineCheckpoint && getInterruptedAssistantMessage(session))
}

export function getResumeStatusLabel(session: ChatSession): string {
  const checkpoint = session.pipelineCheckpoint
  if (!checkpoint?.statusLabel) return '从上次进度继续'
  return checkpoint.statusLabel
}

export function getSessionInitialUserMessage(session: ChatSession): ChatMessage | null {
  return (
    session.messages.find(
      (message) => message.role === 'user' && !message.content.startsWith('**修改说明**')
    ) ?? null
  )
}

export function sessionCanRegenerate(session: ChatSession): boolean {
  return getSessionInitialUserMessage(session) != null
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
