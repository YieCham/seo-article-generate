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
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'max'
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

/** OpenRouter 402: credits only cover up to N max_tokens. */
function parseAffordableMaxTokens(detail: string): number | null {
  const match = detail.match(/can only afford\s+(\d+)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function buildChatCompletionBody(
  config: LlmConfig,
  messages: ChatMessage[],
  options: LlmCallOptions | undefined,
  maxTokens: number | undefined
): string {
  return JSON.stringify({
    model: config.model,
    messages,
    temperature: options?.temperature ?? config.temperature,
    ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
    ...(options?.jsonObject ? { response_format: { type: 'json_object' } } : {}),
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {})
  })
}

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: LlmCallOptions
): Promise<string> {
  const signal = getAbortSignal()
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  }

  let maxTokens = options?.maxTokens
  let backoffMs = LLM_RETRY_INITIAL_BACKOFF_MS
  let lastErrorMessage = '未知错误'

  for (let attempt = 0; attempt < LLM_MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted()
    const body = buildChatCompletionBody(config, messages, options, maxTokens)

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
          maxTokensRequested: maxTokens,
          finishReason,
          step: options?.step,
          label: options?.label
        })

        return content
      }

      const detail = await response.text()
      lastErrorMessage = `LLM 请求失败 (${response.status})：${detail.slice(0, 200)}`

      // OpenRouter bills against requested max_tokens — lower and retry when possible.
      if (response.status === 402) {
        const affordable = parseAffordableMaxTokens(detail)
        if (affordable != null && affordable >= 1024 && (maxTokens == null || affordable < maxTokens)) {
          maxTokens = affordable
          lastErrorMessage = `OpenRouter 额度不足：已将 max_tokens 下调至 ${affordable} 后重试`
          const retryInfo: LlmRetryInfo = {
            attempt,
            maxAttempts: LLM_MAX_ATTEMPTS,
            delayMs: 500,
            status: 402,
            reason: lastErrorMessage
          }
          options?.onRetry?.(retryInfo)
          options?.onRateLimitRetry?.(retryInfo)
          await sleepWithAbort(500, signal)
          continue
        }

        throw new Error(
          [
            'OpenRouter 额度不足（402），无法完成本次请求。',
            affordable != null
              ? `当前余额大约只够 max_tokens=${affordable}，但本步仍需要更高输出上限。`
              : '请到 https://openrouter.ai/settings/credits 充值，或降低全局 llmMaxTokens。',
            `详情：${detail.slice(0, 180)}`
          ].join(' ')
        )
      }

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

      // Already a final 402 credit error — do not wrap/retry.
      if (error instanceof Error && /OpenRouter 额度不足/.test(error.message)) {
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
  return ({ attempt, maxAttempts, delayMs, status, reason }) => {
    const seconds = Math.max(1, Math.round(delayMs / 1000))
    if (status === 402 && /max_tokens 下调/.test(reason)) {
      onStatus(`${baseMessage}（额度不足，已自动降低输出上限后重试 ${attempt + 2}/${maxAttempts}）`)
      return
    }
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
