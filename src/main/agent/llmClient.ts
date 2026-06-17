import { recordLlmTokenUsage, type ApiTokenUsage } from '../token/tokenUsageRecorder'

export interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmCallOptions {
  temperature?: number
  maxTokens?: number
  step?: string
  label?: string
}

type CompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: ApiTokenUsage
}

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>
  usage?: ApiTokenUsage
}

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: LlmCallOptions
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

  const data = (await response.json()) as CompletionResponse
  const content = data.choices?.[0]?.message?.content?.trim() ?? ''

  await recordLlmTokenUsage({
    model: config.model,
    messages,
    completionText: content,
    usage: data.usage,
    maxTokensRequested: options?.maxTokens,
    step: options?.step,
    label: options?.label
  })

  return content
}

export async function streamChatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: LlmCallOptions
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
      stream_options: { include_usage: true },
      temperature: options?.temperature ?? config.temperature,
      max_tokens: options?.maxTokens
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
  let completionText = ''
  let streamUsage: ApiTokenUsage | undefined

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
      if (payload === '[DONE]') continue

      try {
        const json = JSON.parse(payload) as StreamChunk
        if (json.usage) {
          streamUsage = json.usage
        }
        const text = json.choices?.[0]?.delta?.content
        if (text) {
          completionText += text
          onChunk(text)
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  await recordLlmTokenUsage({
    model: config.model,
    messages,
    completionText,
    usage: streamUsage,
    maxTokensRequested: options?.maxTokens,
    step: options?.step,
    label: options?.label
  })
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
