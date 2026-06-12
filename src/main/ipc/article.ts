import { ipcMain } from 'electron'
import { generateArticle } from '../agent/articleAgent'

export function registerArticleIpc(): void {
  ipcMain.handle('article:generate', async (event, options) => {
    return generateArticle(options, event.sender)
  })
}
