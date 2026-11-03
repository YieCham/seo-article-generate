import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getArticleUserDataDir } from '../paths'
import type { AiTraceReport } from '../../shared/aiTrace'

function getReportPath(): string {
  return join(getArticleUserDataDir(), 'ai-trace-report.json')
}

export async function loadAiTraceReport(): Promise<AiTraceReport | null> {
  try {
    const raw = await readFile(getReportPath(), 'utf-8')
    const parsed = JSON.parse(raw) as AiTraceReport
    if (!parsed || typeof parsed.scannedAt !== 'number' || !Array.isArray(parsed.hits)) return null
    if (!Array.isArray(parsed.knownHits) || typeof parsed.pageCount !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export async function saveAiTraceReport(report: AiTraceReport): Promise<void> {
  await mkdir(getArticleUserDataDir(), { recursive: true })
  await writeFile(getReportPath(), JSON.stringify(report, null, 2), 'utf-8')
}
