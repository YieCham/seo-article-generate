import { ipcMain } from 'electron'
import { loadChatStore, saveChatStore, type ChatStoreData } from '../chat/chatStore'

export function registerChatIpc(): void {
  ipcMain.handle('chat:load', async () => loadChatStore())

  ipcMain.handle('chat:save', async (_event, data: ChatStoreData) => {
    await saveChatStore(data)
    return { ok: true }
  })
}
