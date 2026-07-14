import { getAbortSignal, throwIfAborted } from './abortContext'
import { recordLlmTokenUsage, type ApiTokenUsage } from '../token/tokenUsageRecorder'

/** Retries after the first attempt (429 only): 3 retries → up to 4 total attempts. */
const LLM_429_MAX_RETRIES = 3
const LLM_429_INITIAL_BACKOFF_MS = 2000

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

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
  /** OpenAI-compatible JSON mode — use for tiny structured outputs (e.g. SEO meta). */
  jsonObject?: boolean
  onRateLimitRetry?: (info: RateLimitRetryInfo) => void
}

export interface RateLimitRetryInfo {
  /** 0-based retry index (0 = first retry after initial 429). */
  attempt: number
  maxAttempts: number
  delayMs: number
}

type CompletionResponse = {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  usage?: ApiTokenUsage
}

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: LlmCallOptions
): Promise<string> {
  const signal = getAbortSignal()
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: options?.temperature ?? config.temperature,
    max_tokens: options?.maxTokens,
    ...(options?.jsonObject ? { response_format: { type: 'json_object' } } : {})
  })
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  }

  let backoffMs = LLM_429_INITIAL_BACKOFF_MS

  for (let attempt = 0; attempt <= LLM_429_MAX_RETRIES; attempt += 1) {
    throwIfAborted()

    const response = await fetch(url, { method: 'POST', headers, body, signal })

    if (response.ok) {
      const data = (await response.json()) as CompletionResponse
      const content = data.choices?.[0]?.message?.content?.trim() ?? ''
      const finishReason = data.choices?.[0]?.finish_reason

      await recordLlmTokenUsage({
        model: config.model,
        messages,
        completionText: content,
        usage: data.usage,
        maxTokensRequested: options?.maxTokens,
        finishReason,
        step: options?.step,
        label: options?.label
      })

      return content
    }

    const detail = await response.text()
    const canRetry = response.status === 429 && attempt < LLM_429_MAX_RETRIES

    if (canRetry) {
      options?.onRateLimitRetry?.({
        attempt,
        maxAttempts: LLM_429_MAX_RETRIES,
        delayMs: backoffMs
      })
      await sleepWithAbort(backoffMs, signal)
      backoffMs *= 2
      continue
    }

    throw new Error(`LLM 请求失败 (${response.status})：${detail.slice(0, 200)}`)
  }

  throw new Error('LLM 请求失败 (429)：rate limit 重试次数已用尽')
}

export function createRateLimitRetryStatus(
  baseMessage: string,
  onStatus: (message: string) => void
): (info: RateLimitRetryInfo) => void {
  return ({ attempt, maxAttempts, delayMs }) => {
    const seconds = Math.max(1, Math.round(delayMs / 1000))
    onStatus(`${baseMessage}（API 限流，${seconds} 秒后重试 ${attempt + 1}/${maxAttempts}）`)
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
