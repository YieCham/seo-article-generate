import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { app, protocol } from 'electron'
import { extname, join } from 'path'
import { ILLUSTRATION_SCHEME } from '../../shared/illustrationLibrary'

const MAX_HISTORY_ITEMS = 100
const MAX_IMPORT_BYTES = 20 * 1024 * 1024
/** Prefer no hyphen — Chromium custom schemes with "-" are less reliable for <img>. */
export const DRAW_IMG_SCHEME = 'drawimg'

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
  /** Renderer <img src> via custom protocol — no large IPC payload */
  imageSrc: string
}

interface ImageHistoryStoreData {
  items: ImageHistoryItem[]
}

export interface SaveImageHistoryBufferInput {
  prompt: string
  size: string
  model: string
  mimeType: string
  buffer: Buffer
}

const EMPTY_STORE: ImageHistoryStoreData = { items: [] }

export function getHistoryDir(): string {
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

export function toDrawImgSrc(fileName: string): string {
  return `${DRAW_IMG_SCHEME}://local/${encodeURIComponent(fileName)}`
}

export function isSafeHistoryFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(fileName) && !fileName.includes('..')
}

function mimeFromFileName(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

function fileNameFromDrawImgUrl(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    const fromPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (fromPath && isSafeHistoryFileName(fromPath)) return fromPath
    const fromHost = decodeURIComponent(url.hostname || '')
    if (fromHost && fromHost !== 'local' && fromHost !== 'history' && isSafeHistoryFileName(fromHost)) {
      return fromHost
    }
    return null
  } catch {
    return null
  }
}

/** Must be called before app.whenReady() */
export function registerDrawImgSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DRAW_IMG_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true
      }
    },
    {
      scheme: ILLUSTRATION_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/** Call inside app.whenReady() */
export function registerDrawImgProtocol(): void {
  protocol.handle(DRAW_IMG_SCHEME, async (request) => {
    try {
      const fileName = fileNameFromDrawImgUrl(request.url)
      if (!fileName) {
        return new Response('Bad request', { status: 400 })
      }
      const filePath = join(getHistoryDir(), fileName)
      const buffer = await readFile(filePath)
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': mimeFromFileName(fileName),
          'Cache-Control': 'no-cache'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
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

export async function saveImageHistoryFromBuffer(
  input: SaveImageHistoryBufferInput
): Promise<ImageHistoryItem> {
  const id = randomUUID()
  const fileName = `${id}.${guessExt(input.mimeType)}`
  const dir = getHistoryDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, fileName), input.buffer)

  const item: ImageHistoryItem = {
    id,
    prompt: input.prompt.trim(),
    size: input.size.trim() || '1024x1024',
    model: input.model.trim(),
    createdAt: Date.now(),
    fileName,
    mimeType: input.mimeType
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

function mimeFromPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return null
}

export async function importLocalImage(filePath: string): Promise<ImageHistoryItemView> {
  const mimeType = mimeFromPath(filePath)
  if (!mimeType) {
    throw new Error('仅支持 PNG、JPG、WebP、GIF 图片')
  }

  const buffer = await readFile(filePath)
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error('图片过大，请选择不超过 20MB 的文件')
  }

  const item = await saveImageHistoryFromBuffer({
    prompt: '上传图片',
    size: '1024x1024',
    model: '',
    mimeType,
    buffer
  })

  return {
    ...item,
    imageSrc: toDrawImgSrc(item.fileName)
  }
}

export async function readHistoryImageBuffer(
  fileName: string
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (!isSafeHistoryFileName(fileName)) return null
  const store = await loadIndex()
  const item = store.items.find((entry) => entry.fileName === fileName)
  try {
    const buffer = await readFile(join(getHistoryDir(), fileName))
    return {
      mimeType: item?.mimeType || 'image/png',
      buffer
    }
  } catch {
    return null
  }
}

export async function listImageHistory(): Promise<ImageHistoryItemView[]> {
  const store = await loadIndex()
  const dir = getHistoryDir()
  const views: ImageHistoryItemView[] = []

  for (const item of store.items) {
    try {
      await readFile(join(dir, item.fileName))
      views.push({
        ...item,
        imageSrc: toDrawImgSrc(item.fileName)
      })
    } catch {
      // Skip missing files so history UI stays usable
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
