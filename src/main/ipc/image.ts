import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  editImage,
  generateImage,
  type EditImageRequest,
  type GenerateImageRequest
} from '../agent/imageGenerator'
import {
  clearImageHistory,
  deleteImageHistoryItem,
  importLocalImage,
  listImageHistory
} from '../image/imageHistoryStore'

export function registerImageIpc(): void {
  ipcMain.handle('image:generate', async (_event, request?: GenerateImageRequest) =>
    generateImage(request ?? {})
  )

  ipcMain.handle('image:edit', async (_event, request?: EditImageRequest) =>
    editImage(request ?? { prompt: '' })
  )

  ipcMain.handle('image:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const options = {
      title: '选择要编辑的图片',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return { ok: true as const, canceled: true }
    }

    try {
      const item = await importLocalImage(filePath)
      return { ok: true as const, canceled: false, item }
    } catch (error) {
      return {
        ok: false as const,
        canceled: false,
        message: error instanceof Error ? error.message : '上传图片失败'
      }
    }
  })

  ipcMain.handle('image:history:list', async () => listImageHistory())

  ipcMain.handle('image:history:delete', async (_event, id: string) =>
    deleteImageHistoryItem(typeof id === 'string' ? id : '')
  )

  ipcMain.handle('image:history:clear', async () => clearImageHistory())
}
