import { ipcMain } from 'electron'
import { getInternalLinkSummary } from '../internalLink/internalLinkStore'
import { importInternalLinksFromSitemap } from '../internalLink/sitemapImport'

export function registerInternalLinkIpc(): void {
  ipcMain.handle('internalLinks:list', async (_event, productId?: string) =>
    getInternalLinkSummary(typeof productId === 'string' ? productId : '')
  )

  ipcMain.handle(
    'internalLinks:import',
    async (
      _event,
      input: {
        productId?: string
        productName?: string
        siteUrl?: string
        sitemapUrl?: string
        includePatterns?: string[] | string
        excludePatterns?: string[] | string
      }
    ) =>
      importInternalLinksFromSitemap({
        productId: typeof input?.productId === 'string' ? input.productId : '',
        productName: typeof input?.productName === 'string' ? input.productName : undefined,
        siteUrl: typeof input?.siteUrl === 'string' ? input.siteUrl : '',
        sitemapUrl: typeof input?.sitemapUrl === 'string' ? input.sitemapUrl : undefined,
        includePatterns: input?.includePatterns,
        excludePatterns: input?.excludePatterns
      })
  )
}
