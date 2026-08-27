import { ipcMain } from 'electron'
import { loadConfig } from '../config/configStore'
import {
  listWordPressTerms,
  publishWordPressDraft,
  testWordPressConnection
} from '../wordpress/wordpressClient'
import {
  appendWordPressPublishLog,
  clearWordPressPublishLog,
  loadWordPressPublishLog
} from '../wordpress/publishLogStore'
import {
  normalizeSiteUrl,
  normalizeWordPressPreset,
  normalizeWordPressSettings,
  resolveWordPressPreset,
  type WordPressPreset,
  type WordPressPublishRequest,
  type WordPressTermsResult
} from '../../shared/wordpress'

function presetFromOverride(override?: Partial<WordPressPreset> | null): Promise<WordPressPreset> {
  return loadConfig().then((appConfig) => {
    const settings = normalizeWordPressSettings(appConfig.wordpress)
    const active = resolveWordPressPreset(settings, override?.id)
    if (!override) return active
    return normalizeWordPressPreset({ ...active, ...override }, active.id)
  })
}

export function registerWordPressIpc(): void {
  ipcMain.handle('wordpress:test', async (_event, override?: Partial<WordPressPreset>) => {
    const config = await presetFromOverride(override)
    return testWordPressConnection(config)
  })

  ipcMain.handle(
    'wordpress:listTerms',
    async (_event, override?: Partial<WordPressPreset>): Promise<WordPressTermsResult> => {
      const config = await presetFromOverride(override)
      try {
        const terms = await listWordPressTerms(config)
        return { ok: true, ...terms }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : '读取分类与标签失败。',
          categories: [],
          tags: []
        }
      }
    }
  )

  ipcMain.handle('wordpress:publish', async (_event, request: WordPressPublishRequest) => {
    const appConfig = await loadConfig()
    const settings = normalizeWordPressSettings(appConfig.wordpress)
    const config = resolveWordPressPreset(settings, request.presetId)
    const result = await publishWordPressDraft(config, request)
    if (result.ok && result.binding) {
      result.binding = { ...result.binding, presetId: config.id }
    }
    await appendWordPressPublishLog({
      ok: result.ok,
      created: result.created,
      sessionId: request.sessionId,
      sessionTitle: request.sessionTitle,
      title: request.title,
      slug: result.slug ?? request.slug,
      postId: result.postId,
      siteUrl: normalizeSiteUrl(config.siteUrl),
      editLink: result.editLink,
      featuredMediaId: result.featuredMediaId,
      presetId: config.id,
      presetName: config.name,
      message: result.warning ? `${result.message} ${result.warning}` : (result.message ?? '')
    })
    return result
  })

  ipcMain.handle('wordpress:log:list', async () => {
    const data = await loadWordPressPublishLog()
    return { records: data.records }
  })

  ipcMain.handle('wordpress:log:clear', async () => {
    await clearWordPressPublishLog()
    return { ok: true as const }
  })
}
