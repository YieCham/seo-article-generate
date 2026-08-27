import { basename } from 'path'
import { readFile } from 'fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  deleteKnowledgeDoc,
  importKnowledgeFromFiles,
  listKnowledgeDocs,
  saveKnowledgeDoc,
  setKnowledgeDocEnabled,
  type KnowledgeDoc,
  type SaveKnowledgeDocInput
} from '../knowledge/knowledgeStore'

function titleFromFileName(filePath: string): string {
  return basename(filePath).replace(/\.(md|markdown|txt)$/i, '').trim() || '未命名条目'
}

export function registerKnowledgeIpc(): void {
  ipcMain.handle('knowledge:list', async () => listKnowledgeDocs())

  ipcMain.handle('knowledge:save', async (_event, input: SaveKnowledgeDocInput) =>
    saveKnowledgeDoc(input)
  )

  ipcMain.handle('knowledge:delete', async (_event, id: string) => {
    await deleteKnowledgeDoc(typeof id === 'string' ? id : '')
    return { ok: true as const }
  })

  ipcMain.handle('knowledge:setEnabled', async (_event, id: string, enabled: boolean) =>
    setKnowledgeDocEnabled(typeof id === 'string' ? id : '', Boolean(enabled))
  )

  ipcMain.handle('knowledge:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const options = {
      title: '导入知识库条目',
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        { name: 'Markdown / 文本', extensions: ['md', 'markdown', 'txt'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true as const, imported: [] as KnowledgeDoc[], canceled: true }
    }

    const files: Array<{ title: string; content: string }> = []
    for (const filePath of result.filePaths) {
      try {
        const content = await readFile(filePath, 'utf-8')
        files.push({ title: titleFromFileName(filePath), content })
      } catch {
        // skip unreadable files
      }
    }

    const imported = await importKnowledgeFromFiles(files)
    return { ok: true as const, imported, canceled: false }
  })
}
