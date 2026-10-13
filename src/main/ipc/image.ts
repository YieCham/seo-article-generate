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
  listImageHistory,
  type ImageHistoryItemView
} from '../image/imageHistoryStore'

function pickImageFiles(
  event: Electron.IpcMainInvokeEvent,
  title: string,
  multiple: boolean
): Promise<{ canceled: boolean; filePaths: string[] }> {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
  const options = {
    title,
    properties: multiple
      ? (['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>)
      : (['openFile'] as Array<'openFile'>),
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: '全部文件', extensions: ['*'] }
    ]
  }
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function registerImageIpc(): void {
  ipcMain.handle('image:generate', async (_event, request?: GenerateImageRequest) =>
    generateImage(request ?? {})
  )

  ipcMain.handle('image:edit', async (_event, request?: EditImageRequest) =>
    editImage(request ?? { prompt: '' })
  )

  ipcMain.handle('image:import', async (event) => {
    const picked = await pickImageFiles(event, '选择要编辑的图片', false)
    if (picked.canceled) return { ok: true as const, canceled: true }
    const filePath = picked.filePaths[0]
    if (!filePath) return { ok: true as const, canceled: true }

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

  ipcMain.handle('image:importReferences', async (event) => {
    const picked = await pickImageFiles(event, '选择参考图', true)
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: true as const, canceled: true, items: [] as ImageHistoryItemView[] }
    }

    const items: ImageHistoryItemView[] = []
    const errors: string[] = []
    for (const filePath of picked.filePaths) {
      try {
        items.push(await importLocalImage(filePath, { recordInHistory: false }))
      } catch (error) {
        errors.push(error instanceof Error ? error.message : '上传参考图失败')
      }
    }

    if (items.length === 0) {
      return {
        ok: false as const,
        canceled: false,
        message: errors[0] ?? '上传参考图失败',
        items
      }
    }

    return {
      ok: true as const,
      canceled: false,
      items,
      message: errors.length > 0 ? `有 ${errors.length} 张图片未能添加` : undefined
    }
  })

  ipcMain.handle('image:history:list', async () => listImageHistory())

  ipcMain.handle('image:history:delete', async (_event, id: string) =>
    deleteImageHistoryItem(typeof id === 'string' ? id : '')
  )

  ipcMain.handle('image:history:clear', async () => clearImageHistory())
}
