import { ipcMain } from 'electron'
import { loadConfig, saveConfig } from '../config/configStore'
import type { AppConfig, PipelineMode, SkillItem } from '../config/types'
import { deleteSkillItem, listSkills, saveSkillItem, setSkillEnabled, syncCreateSkillsForArticleType } from '../agent/skillManager'
import { testLlmConnection } from '../agent/articleAgent'
import { testFirecrawlConnection } from '../research/firecrawl'
import { testTavilyConnection } from '../research/tavily'
import {
  clearTokenUsageLog,
  loadTokenUsageLog,
  summarizeTokenUsage
} from '../token/tokenUsageStore'

export function registerConfigIpc(): void {
  ipcMain.handle('config:get', async () => loadConfig())

  ipcMain.handle('config:save', async (_event, partial: Partial<AppConfig>) => {
    return saveConfig(partial)
  })

  ipcMain.handle('config:testLlm', async () => testLlmConnection())
  ipcMain.handle('config:testTavily', async (_event, apiKey: string) => testTavilyConnection(apiKey))
  ipcMain.handle('config:testFirecrawl', async (_event, apiKey: string) => testFirecrawlConnection(apiKey))

  ipcMain.handle('tokenUsage:get', async () => {
    const data = await loadTokenUsageLog()
    return {
      records: data.records,
      summary: summarizeTokenUsage(data.records)
    }
  })

  ipcMain.handle('tokenUsage:clear', async () => {
    await clearTokenUsageLog()
    return { ok: true as const }
  })

  ipcMain.handle('skills:list', async (_event, mode?: PipelineMode) => listSkills(mode ?? 'create'))

  ipcMain.handle('skills:save', async (_event, skill: SkillItem, mode?: PipelineMode) =>
    saveSkillItem(skill, mode ?? 'create')
  )

  ipcMain.handle('skills:delete', async (_event, id: string) => {
    await deleteSkillItem(id)
  })

  ipcMain.handle(
    'skills:setEnabled',
    async (_event, id: string, enabled: boolean, mode?: PipelineMode) => {
      await setSkillEnabled(id, enabled, mode ?? 'create')
    }
  )

  ipcMain.handle(
    'skills:syncArticleType',
    async (_event, articleType: 'how-to' | 'review' | 'top-rank') => {
      await syncCreateSkillsForArticleType(articleType)
    }
  )
}
