import { ipcMain } from 'electron'
import { runAiTraceScan } from '../aiTrace/runAiTraceScan'
import { loadChatStore, saveChatStore, type ChatStoreData } from '../chat/chatStore'
import { loadConfig } from '../config/configStore'

function completedIds(data: ChatStoreData): Set<string> {
  const ids = new Set<string>()
  for (const session of data.sessions) {
    if (session.listStatus === 'completed') ids.add(session.id)
  }
  return ids
}

export function registerChatIpc(): void {
  ipcMain.handle('chat:load', async () => loadChatStore())

  ipcMain.handle('chat:save', async (_event, data: ChatStoreData) => {
    const previous = await loadChatStore()
    await saveChatStore(data)
    const before = completedIds(previous)
    const becameCompleted = data.sessions.some(
      (session) => session.listStatus === 'completed' && !before.has(session.id)
    )
    if (becameCompleted) {
      void (async () => {
        try {
          const config = await loadConfig()
          if (!config.aiTrace.autoOnComplete) return
          await runAiTraceScan()
        } catch (error) {
          console.error('[ai-trace] auto scan failed', error)
        }
      })()
    }
    return { ok: true }
  })
}
