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
  updatedAt: number
}

export function createSession(): ChatSession {
  const id = crypto.randomUUID()
  return {
    id,
    title: '新对话',
    messages: [],
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
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed
}
