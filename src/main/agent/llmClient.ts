export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: options?.temperature ?? config.temperature,
      max_tokens: options?.maxTokens
    })
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM 请求失败 (${response.status})：${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function streamChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: { temperature?: number }
): Promise<void> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: options?.temperature ?? config.temperature
    })
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM 请求失败 (${response.status})：${detail.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('LLM 响应不支持流式输出')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return

      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const text = json.choices?.[0]?.delta?.content
        if (text) onChunk(text)
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}

export function parseJsonArray(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0]) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export function parseOutlineSections(outline: string): Array<{ title: string; body: string }> {
  const lines = outline.split('\n')
  const sections: Array<{ title: string; body: string }> = []
  let current: { title: string; body: string } | null = null

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current)
      current = { title: line.replace(/^##\s+/, '').trim(), body: '' }
      continue
    }
    if (current) {
      current.body += `${line}\n`
    }
  }
  if (current) sections.push(current)

  if (sections.length === 0) {
    return [{ title: '正文', body: outline }]
  }
  return sections
}
