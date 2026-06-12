import { ipcMain } from 'electron'
import { loadConfig, saveConfig } from '../config/configStore'
import type { AppConfig, SkillItem } from '../config/types'
import { deleteSkillItem, listSkills, saveSkillItem, setSkillEnabled } from '../agent/skillManager'
import { testLlmConnection } from '../agent/articleAgent'
import { testFirecrawlConnection } from '../research/firecrawl'
import { testTavilyConnection } from '../research/tavily'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', async () => loadConfig())

  ipcMain.handle('config:save', async (_event, partial: Partial<AppConfig>) => {
    return saveConfig(partial)
  })

  ipcMain.handle('config:testLlm', async () => testLlmConnection())
  ipcMain.handle('config:testTavily', async (_event, apiKey: string) => testTavilyConnection(apiKey))
  ipcMain.handle('config:testFirecrawl', async (_event, apiKey: string) => testFirecrawlConnection(apiKey))

  ipcMain.handle('skills:list', async () => listSkills())

  ipcMain.handle('skills:save', async (_event, skill: SkillItem) => saveSkillItem(skill))

  ipcMain.handle('skills:delete', async (_event, id: string) => {
    await deleteSkillItem(id)
  })

  ipcMain.handle('skills:setEnabled', async (_event, id: string, enabled: boolean) => {
    await setSkillEnabled(id, enabled)
  })
}
