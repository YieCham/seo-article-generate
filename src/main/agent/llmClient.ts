import { getAbortSignal, throwIfAborted } from './abortContext'
import { recordLlmTokenUsage, type ApiTokenUsage } from '../token/tokenUsageRecorder'

/** Consecutive failures before aborting this call (and the parent conversation). */
const LLM_MAX_ATTEMPTS = 5
const LLM_RETRY_INITIAL_BACKOFF_MS = 2000

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

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
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
  onRetry?: (info: LlmRetryInfo) => void
  /** @deprecated Prefer onRetry — still invoked for retries (incl. non-429). */
  onRateLimitRetry?: (info: LlmRetryInfo) => void
}

export interface LlmRetryInfo {
  /** 0-based failed attempt index (0 = first failure). */
  attempt: number
  /** Total allowed attempts before abort (always LLM_MAX_ATTEMPTS). */
  maxAttempts: number
  delayMs: number
  /** HTTP status when failure came from a response; omit for network errors. */
  status?: number
  reason: string
}

/** @deprecated Use LlmRetryInfo */
export type RateLimitRetryInfo = LlmRetryInfo

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

  let backoffMs = LLM_RETRY_INITIAL_BACKOFF_MS
  let lastErrorMessage = '未知错误'

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted()

    try {
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
      lastErrorMessage = `LLM 请求失败 (${response.status})：${detail.slice(0, 200)}`

      if (attempt >= LLM_MAX_ATTEMPTS - 1) {
        break
      }

      const retryInfo: LlmRetryInfo = {
        attempt,
        maxAttempts: LLM_MAX_ATTEMPTS,
        delayMs: backoffMs,
        status: response.status,
        reason: lastErrorMessage
      }
      options?.onRetry?.(retryInfo)
      options?.onRateLimitRetry?.(retryInfo)
      await sleepWithAbort(backoffMs, signal)
      backoffMs *= 2
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      lastErrorMessage =
        error instanceof Error ? error.message : 'LLM 请求失败：网络或未知错误'

      if (attempt >= LLM_MAX_ATTEMPTS - 1) {
        break
      }

      const retryInfo: LlmRetryInfo = {
        attempt,
        maxAttempts: LLM_MAX_ATTEMPTS,
        delayMs: backoffMs,
        reason: lastErrorMessage
      }
      options?.onRetry?.(retryInfo)
      options?.onRateLimitRetry?.(retryInfo)
      await sleepWithAbort(backoffMs, signal)
      backoffMs *= 2
    }
  }

  throw new Error(
    `LLM 连续 ${LLM_MAX_ATTEMPTS} 次调用失败，已中止该次对话。最后错误：${lastErrorMessage}`
  )
}

export function createLlmRetryStatus(
  baseMessage: string,
  onStatus: (message: string) => void
): (info: LlmRetryInfo) => void {
  return ({ attempt, maxAttempts, delayMs, status }) => {
    const seconds = Math.max(1, Math.round(delayMs / 1000))
    const kind = status === 429 ? 'API 限流' : '调用失败'
    // attempt 0 = first failure → about to try attempt 2 of maxAttempts
    onStatus(
      `${baseMessage}（${kind}，${seconds} 秒后进行第 ${attempt + 2}/${maxAttempts} 次尝试）`
    )
  }
}

/** @deprecated Prefer createLlmRetryStatus */
export function createRateLimitRetryStatus(
  baseMessage: string,
  onStatus: (message: string) => void
): (info: LlmRetryInfo) => void {
  return createLlmRetryStatus(baseMessage, onStatus)
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
