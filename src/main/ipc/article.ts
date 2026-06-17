import { ipcMain } from 'electron'
import { generateArticle } from '../agent/articleAgent'
import { optimizeArticle } from '../agent/articleOptimizer'
import { rewriteArticleSection } from '../agent/articleSectionEditor'

export function registerArticleIpc(): void {
  ipcMain.handle('article:generate', async (event, options) => {
    return generateArticle(options, event.sender)
  })

  ipcMain.handle('article:optimize', async (event, options) => {
    return optimizeArticle(options, event.sender)
  })

  ipcMain.handle('article:rewriteSection', async (_event, options) => {
    return rewriteArticleSection(options)
  })
}
