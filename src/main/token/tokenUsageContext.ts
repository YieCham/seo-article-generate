import { AsyncLocalStorage } from 'async_hooks'
import { randomUUID } from 'crypto'

export type TokenUsagePipeline = 'create' | 'optimize' | 'batch-optimize' | 'sectionEdit' | 'test' | 'other'

export interface TokenUsageRunContext {
  runId: string
  pipeline: TokenUsagePipeline
  topic?: string
  step?: string
  stepLabel?: string
}

const storage = new AsyncLocalStorage<TokenUsageRunContext>()

export function runWithTokenContext<T>(
  context: TokenUsageRunContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(storage.run(context, fn))
}

export function createTokenRunContext(
  pipeline: TokenUsagePipeline,
  topic?: string
): TokenUsageRunContext {
  return {
    runId: randomUUID(),
    pipeline,
    topic: topic?.trim().slice(0, 200) || undefined
  }
}

export function getTokenUsageContext(): TokenUsageRunContext | undefined {
  return storage.getStore()
}

export function updateTokenUsageContext(partial: Partial<TokenUsageRunContext>): void {
  const current = storage.getStore()
  if (!current) return
  Object.assign(current, partial)
}
