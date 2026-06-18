import { AsyncLocalStorage } from 'async_hooks'

const storage = new AsyncLocalStorage<AbortSignal>()

export function runWithAbortSignal<T>(signal: AbortSignal, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(storage.run(signal, fn))
}

export function getAbortSignal(): AbortSignal | undefined {
  return storage.getStore()
}

export function throwIfAborted(): void {
  const signal = getAbortSignal()
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}
