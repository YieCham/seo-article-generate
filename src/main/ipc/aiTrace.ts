import { ipcMain } from 'electron'
import { loadAiTraceReport } from '../aiTrace/aiTraceStore'
import { runAiTraceReading } from '../aiTrace/runAiTraceReading'
import { runAiTraceScan } from '../aiTrace/runAiTraceScan'

export function registerAiTraceIpc(): void {
  ipcMain.handle('aiTrace:getReport', async () => loadAiTraceReport())
  ipcMain.handle('aiTrace:scan', async () => runAiTraceScan())
  ipcMain.handle('aiTrace:read', async () => runAiTraceReading())
}
