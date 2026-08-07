import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'

const MAX_HISTORY_ITEMS = 100

export interface ImageHistoryItem {
  id: string
  prompt: string
  size: string
  model: string
  createdAt: number
  fileName: string
  mimeType: string
}

export interface ImageHistoryItemView extends ImageHistoryItem {
  imageDataUrl: string
}

interface ImageHistoryStoreData {
  items: ImageHistoryItem[]
}

export interface SaveImageHistoryInput {
  prompt: string
  size: string
  model: string
  imageDataUrl?: string
  imageUrl?: string
}

const EMPTY_STORE: ImageHistoryStoreData = { items: [] }

function getHistoryDir(): string {
  return join(app.getPath('userData'), 'image-history')
}

function getIndexPath(): string {
  return join(app.getPath('userData'), 'image-history.json')
}

function guessExt(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'png'
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim())
  if (!match) return null
  const mimeType = match[1] || 'image/png'
  try {
    return { mimeType, buffer: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

async function loadIndex(): Promise<ImageHistoryStoreData> {
  try {
    const raw = await readFile(getIndexPath(), 'utf-8')
    const parsed = JSON.parse(raw) as ImageHistoryStoreData
    if (!Array.isArray(parsed.items)) return { ...EMPTY_STORE }
    const items = parsed.items.filter(
      (item): item is ImageHistoryItem =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.fileName === 'string' &&
        typeof item.createdAt === 'number'
    )
    return { items }
  } catch {
    return { ...EMPTY_STORE }
  }
}

async function saveIndex(data: ImageHistoryStoreData): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getIndexPath(), JSON.stringify(data, null, 2), 'utf-8')
}

async function resolveImageBuffer(
  input: SaveImageHistoryInput
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (input.imageDataUrl?.trim()) {
    const parsed = parseDataUrl(input.imageDataUrl)
    if (parsed) return parsed
  }

  if (input.imageUrl?.trim()) {
    try {
      const response = await fetch(input.imageUrl.trim())
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || 'image/png'
      const mimeType = contentType.split(';')[0]?.trim() || 'image/png'
      return { mimeType, buffer: Buffer.from(arrayBuffer) }
    } catch {
      return null
    }
  }

  return null
}

export async function saveImageHistoryItem(
  input: SaveImageHistoryInput
): Promise<ImageHistoryItem | null> {
  const resolved = await resolveImageBuffer(input)
  if (!resolved) return null

  const id = randomUUID()
  const fileName = `${id}.${guessExt(resolved.mimeType)}`
  const dir = getHistoryDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, fileName), resolved.buffer)

  const item: ImageHistoryItem = {
    id,
    prompt: input.prompt.trim(),
    size: input.size.trim() || '1024x1024',
    model: input.model.trim(),
    createdAt: Date.now(),
    fileName,
    mimeType: resolved.mimeType
  }

  const store = await loadIndex()
  const nextItems = [item, ...store.items]
  const overflow = nextItems.slice(MAX_HISTORY_ITEMS)
  const kept = nextItems.slice(0, MAX_HISTORY_ITEMS)

  await saveIndex({ items: kept })

  for (const old of overflow) {
    void rm(join(dir, old.fileName), { force: true }).catch(() => undefined)
  }

  return item
}

export async function listImageHistory(): Promise<ImageHistoryItemView[]> {
  const store = await loadIndex()
  const dir = getHistoryDir()
  const views: ImageHistoryItemView[] = []

  for (const item of store.items) {
    try {
      const buffer = await readFile(join(dir, item.fileName))
      views.push({
        ...item,
        imageDataUrl: `data:${item.mimeType || 'image/png'};base64,${buffer.toString('base64')}`
      })
    } catch {
      // Skip missing files
    }
  }

  return views
}

export async function deleteImageHistoryItem(id: string): Promise<{ ok: true }> {
  const store = await loadIndex()
  const target = store.items.find((item) => item.id === id)
  const nextItems = store.items.filter((item) => item.id !== id)
  await saveIndex({ items: nextItems })

  if (target) {
    await rm(join(getHistoryDir(), target.fileName), { force: true }).catch(() => undefined)
  }

  return { ok: true }
}

export async function clearImageHistory(): Promise<{ ok: true }> {
  const store = await loadIndex()
  const dir = getHistoryDir()
  await saveIndex({ items: [] })
  await Promise.all(
    store.items.map((item) => rm(join(dir, item.fileName), { force: true }).catch(() => undefined))
  )
  return { ok: true }
}
