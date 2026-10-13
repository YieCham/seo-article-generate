import { ipcMain } from 'electron'
import {
  deleteDomainPack,
  listDomainPacks,
  restoreBuiltinDomainPack,
  saveDomainPack,
  type SaveDomainPackInput
} from '../domainPack/domainPackStore'

export function registerDomainPackIpc(): void {
  ipcMain.handle('domainPack:list', async () => listDomainPacks())

  ipcMain.handle('domainPack:save', async (_event, input: SaveDomainPackInput) => saveDomainPack(input))

  ipcMain.handle('domainPack:delete', async (_event, id: string) => {
    await deleteDomainPack(typeof id === 'string' ? id : '')
    return { ok: true as const }
  })

  ipcMain.handle('domainPack:restore', async (_event, id: string) =>
    restoreBuiltinDomainPack(typeof id === 'string' ? id : '')
  )
}
