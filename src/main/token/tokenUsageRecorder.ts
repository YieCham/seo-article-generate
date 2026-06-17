import type { ChatMessage } from '../agent/llmClient'
import { getTokenUsageContext } from './tokenUsageContext'
import { appendTokenUsageRecord } from './tokenUsageStore'

export interface ApiTokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

function estimateTokensFromText(text: string): number {
  if (!text) return 0
  const cjk = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const rest = Math.max(0, text.length - cjk)
  return Math.ceil(cjk / 1.5 + rest / 4)
}

function estimatePromptTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokensFromText(message.content) + 4, 0)
}

export function normalizeApiUsage(
  usage: ApiTokenUsage | undefined,
  messages: ChatMessage[],
  completionText: string
): { promptTokens: number; completionTokens: number; totalTokens: number; estimated: boolean } {
  const prompt = usage?.prompt_tokens
  const completion = usage?.completion_tokens
  const total = usage?.total_tokens

  if (
    typeof prompt === 'number' &&
    typeof completion === 'number' &&
    Number.isFinite(prompt) &&
    Number.isFinite(completion)
  ) {
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: typeof total === 'number' && Number.isFinite(total) ? total : prompt + completion,
      estimated: false
    }
  }

  const promptTokens = estimatePromptTokens(messages)
  const completionTokens = estimateTokensFromText(completionText)
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true
  }
}

export async function recordLlmTokenUsage(input: {
  model: string
  messages: ChatMessage[]
  completionText: string
  usage?: ApiTokenUsage
  maxTokensRequested?: number
  step?: string
  label?: string
}): Promise<void> {
  const context = getTokenUsageContext()
  if (!context) return

  const normalized = normalizeApiUsage(input.usage, input.messages, input.completionText)

  try {
    await appendTokenUsageRecord({
      runId: context.runId,
      pipeline: context.pipeline,
      step: input.step ?? context.step ?? 'unknown',
      label: input.label ?? context.stepLabel ?? input.step ?? context.step ?? 'LLM 请求',
      model: input.model,
      topic: context.topic,
      promptTokens: normalized.promptTokens,
      completionTokens: normalized.completionTokens,
      totalTokens: normalized.totalTokens,
      maxTokensRequested: input.maxTokensRequested,
      estimated: normalized.estimated
    })
  } catch {
    // logging must not break generation
  }
}
