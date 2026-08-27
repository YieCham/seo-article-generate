import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  deleteIllustrationImage,
  deleteIllustrationProduct,
  getIllustrationLibrary,
  importLocalIllustration,
  saveIllustrationImage,
  saveIllustrationProduct,
  type SaveIllustrationImageInput,
  type SaveIllustrationProductInput
} from '../illustration/illustrationStore'

export function registerIllustrationIpc(): void {
  ipcMain.handle('illustration:get', async () => getIllustrationLibrary())

  ipcMain.handle('illustration:saveProduct', async (_event, input: SaveIllustrationProductInput) =>
    saveIllustrationProduct(input)
  )

  ipcMain.handle('illustration:deleteProduct', async (_event, id: string) =>
    deleteIllustrationProduct(typeof id === 'string' ? id : '')
  )

  ipcMain.handle('illustration:saveImage', async (_event, input: SaveIllustrationImageInput) =>
    saveIllustrationImage(input)
  )

  ipcMain.handle(
    'illustration:deleteImage',
    async (_event, productId: string, imageId: string) =>
      deleteIllustrationImage(typeof productId === 'string' ? productId : '', typeof imageId === 'string' ? imageId : '')
  )

  ipcMain.handle('illustration:importFile', async (event, productId: string) => {
    const pid = typeof productId === 'string' ? productId : ''
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const options = {
      title: '选择插图',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return { ok: true as const, canceled: true, library: await getIllustrationLibrary() }
    }

    const library = await importLocalIllustration(pid, filePath)
    return { ok: true as const, canceled: false, library }
  })
}
