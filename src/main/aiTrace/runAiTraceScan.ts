import { loadChatStore } from '../chat/chatStore'
import { loadConfig } from '../config/configStore'
import { scanAiTracePages, type AiTraceReport } from '../../shared/aiTrace'
import { loadAiTraceReport, saveAiTraceReport } from './aiTraceStore'

export async function runAiTraceScan(): Promise<AiTraceReport> {
  const config = await loadConfig()
  const store = await loadChatStore()
  const previous = await loadAiTraceReport()
  const report: AiTraceReport = scanAiTracePages(store.sessions, {
    config: config.aiTrace,
    productNames: config.quickPicks.products.map((item) => item.label)
  })
  if (previous?.reading) report.reading = previous.reading
  await saveAiTraceReport(report)
  return report
}
