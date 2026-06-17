import { mkdir, readFile, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { TokenUsagePipeline } from './tokenUsageContext'

export interface TokenUsageRecord {
  id: string
  timestamp: number
  runId: string
  pipeline: TokenUsagePipeline
  step: string
  label: string
  model: string
  topic?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  maxTokensRequested?: number
  estimated: boolean
}

export interface TokenUsageSummary {
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  recordCount: number
  runCount: number
  todayTotalTokens: number
  todayRecordCount: number
  byPipeline: Record<string, number>
}

export interface TokenUsageLogData {
  records: TokenUsageRecord[]
}

const MAX_RECORDS = 2000

function getStorePath(): string {
  return join(app.getPath('userData'), 'token-usage.json')
}

function emptyStore(): TokenUsageLogData {
  return { records: [] }
}

function startOfTodayMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export async function loadTokenUsageLog(): Promise<TokenUsageLogData> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as TokenUsageLogData
    if (!Array.isArray(parsed.records)) return emptyStore()
    return {
      records: parsed.records.filter(
        (item): item is TokenUsageRecord =>
          Boolean(item && typeof item.id === 'string' && typeof item.timestamp === 'number')
      )
    }
  } catch {
    return emptyStore()
  }
}

export async function appendTokenUsageRecord(
  partial: Omit<TokenUsageRecord, 'id' | 'timestamp'>
): Promise<TokenUsageRecord> {
  const record: TokenUsageRecord = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...partial
  }

  const store = await loadTokenUsageLog()
  store.records.unshift(record)
  if (store.records.length > MAX_RECORDS) {
    store.records = store.records.slice(0, MAX_RECORDS)
  }

  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(store, null, 2), 'utf-8')
  return record
}

export async function clearTokenUsageLog(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(emptyStore(), null, 2), 'utf-8')
}

export function summarizeTokenUsage(records: TokenUsageRecord[]): TokenUsageSummary {
  const todayStart = startOfTodayMs()
  const runIds = new Set<string>()
  const byPipeline: Record<string, number> = {}
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalTokens = 0
  let todayTotalTokens = 0
  let todayRecordCount = 0

  for (const record of records) {
    runIds.add(record.runId)
    totalPromptTokens += record.promptTokens
    totalCompletionTokens += record.completionTokens
    totalTokens += record.totalTokens
    byPipeline[record.pipeline] = (byPipeline[record.pipeline] ?? 0) + record.totalTokens

    if (record.timestamp >= todayStart) {
      todayTotalTokens += record.totalTokens
      todayRecordCount += 1
    }
  }

  return {
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    recordCount: records.length,
    runCount: runIds.size,
    todayTotalTokens,
    todayRecordCount,
    byPipeline
  }
}
