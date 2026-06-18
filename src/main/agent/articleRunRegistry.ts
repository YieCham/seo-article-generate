const activeRuns = new Map<number, AbortController>()

export function beginArticleRun(webContentsId: number): AbortSignal {
  cancelArticleRun(webContentsId)
  const controller = new AbortController()
  activeRuns.set(webContentsId, controller)
  return controller.signal
}

export function cancelArticleRun(webContentsId: number): boolean {
  const controller = activeRuns.get(webContentsId)
  if (!controller) return false
  controller.abort()
  activeRuns.delete(webContentsId)
  return true
}

export function endArticleRun(webContentsId: number): void {
  activeRuns.delete(webContentsId)
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return false
}
