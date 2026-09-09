import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getArticleUserDataDir } from '../paths'
import { randomUUID } from 'crypto'
import type { WordPressPublishLogRecord } from '../../shared/wordpress'

const MAX_RECORDS = 500

interface PublishLogStoreData {
  records: WordPressPublishLogRecord[]
}

function getStorePath(): string {
  return join(getArticleUserDataDir(), 'wordpress-publish-log.json')
}

function emptyStore(): PublishLogStoreData {
  return { records: [] }
}

function isRecord(item: unknown): item is WordPressPublishLogRecord {
  if (!item || typeof item !== 'object') return false
  const row = item as WordPressPublishLogRecord
  return (
    typeof row.id === 'string' &&
    typeof row.timestamp === 'number' &&
    typeof row.ok === 'boolean' &&
    typeof row.message === 'string'
  )
}

export async function loadWordPressPublishLog(): Promise<PublishLogStoreData> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as PublishLogStoreData
    if (!Array.isArray(parsed.records)) return emptyStore()
    return { records: parsed.records.filter(isRecord) }
  } catch {
    return emptyStore()
  }
}

async function saveStore(data: PublishLogStoreData): Promise<void> {
  await mkdir(getArticleUserDataDir(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export async function appendWordPressPublishLog(
  partial: Omit<WordPressPublishLogRecord, 'id' | 'timestamp'>
): Promise<WordPressPublishLogRecord> {
  const record: WordPressPublishLogRecord = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...partial
  }
  const store = await loadWordPressPublishLog()
  store.records = [record, ...store.records].slice(0, MAX_RECORDS)
  await saveStore(store)
  return record
}

export async function clearWordPressPublishLog(): Promise<void> {
  await saveStore(emptyStore())
}
