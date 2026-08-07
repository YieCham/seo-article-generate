import { ipcMain } from 'electron'
import {
  editImage,
  generateImage,
  type EditImageRequest,
  type GenerateImageRequest
} from '../agent/imageGenerator'
import {
  clearImageHistory,
  deleteImageHistoryItem,
  listImageHistory,
  saveImageHistoryItem
} from '../image/imageHistoryStore'

async function persistHistoryResult(
  result: Awaited<ReturnType<typeof generateImage>>,
  fallback: { prompt?: string; size?: string; model?: string }
): Promise<void> {
  if (!result.ok || (!result.imageDataUrl && !result.imageUrl)) return
  try {
    await saveImageHistoryItem({
      prompt: result.prompt ?? fallback.prompt ?? '',
      size: result.size ?? fallback.size ?? '',
      model: result.model ?? fallback.model ?? '',
      imageDataUrl: result.imageDataUrl,
      imageUrl: result.imageUrl
    })
  } catch {
    // History persistence failure should not fail generation.
  }
}

export function registerImageIpc(): void {
  ipcMain.handle('image:generate', async (_event, request?: GenerateImageRequest) => {
    const result = await generateImage(request ?? {})
    await persistHistoryResult(result, request ?? {})
    return result
  })

  ipcMain.handle('image:edit', async (_event, request?: EditImageRequest) => {
    const result = await editImage(request ?? { prompt: '' })
    await persistHistoryResult(result, request ?? {})
    return result
  })

  ipcMain.handle('image:history:list', async () => listImageHistory())

  ipcMain.handle('image:history:delete', async (_event, id: string) =>
    deleteImageHistoryItem(typeof id === 'string' ? id : '')
  )

  ipcMain.handle('image:history:clear', async () => clearImageHistory())
}
