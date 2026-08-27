import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { extname, join } from 'path'
import { pathToFileURL } from 'url'
import { app, net, protocol } from 'electron'
import {
  EMPTY_ILLUSTRATION_LIBRARY,
  ILLUSTRATION_SCHEME,
  MAX_ILLUSTRATION_ALT,
  MAX_ILLUSTRATION_CAPTION,
  MAX_ILLUSTRATION_PRODUCT_NAME,
  MAX_ILLUSTRATION_STEP_KEY,
  MAX_ILLUSTRATION_URL,
  illustrationFileNameFromUrl,
  isAllowedIllustrationUrl,
  isSafeIllustrationFileName,
  normalizeIllustrationKeywords,
  toIllustrationSrc,
  type IllustrationImage,
  type IllustrationLibrary,
  type IllustrationProduct
} from '../../shared/illustrationLibrary'

export type {
  IllustrationImage,
  IllustrationLibrary,
  IllustrationProduct
} from '../../shared/illustrationLibrary'

export { ILLUSTRATION_SCHEME } from '../../shared/illustrationLibrary'

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const ALLOWED_IMPORT_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

function getStorePath(): string {
  return join(app.getPath('userData'), 'illustration-library.json')
}

export function getIllustrationDir(): string {
  return join(app.getPath('userData'), 'illustrations')
}

function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeImage(raw: unknown): IllustrationImage | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const url = clampText(item.url, MAX_ILLUSTRATION_URL)
  if (!isAllowedIllustrationUrl(url)) return null
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID()
  const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
  return {
    id,
    url,
    alt: clampText(item.alt, MAX_ILLUSTRATION_ALT),
    caption: clampText(item.caption, MAX_ILLUSTRATION_CAPTION),
    stepKey: clampText(item.stepKey, MAX_ILLUSTRATION_STEP_KEY),
    matchKeywords: normalizeIllustrationKeywords(item.matchKeywords),
    createdAt
  }
}

function normalizeProduct(raw: unknown): IllustrationProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = clampText(item.name, MAX_ILLUSTRATION_PRODUCT_NAME)
  if (!name) return null
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID()
  const images = Array.isArray(item.images)
    ? item.images.map(normalizeImage).filter((image): image is IllustrationImage => Boolean(image))
    : []
  return { id, name, images }
}

function normalizeLibrary(raw: unknown): IllustrationLibrary {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ILLUSTRATION_LIBRARY, products: [] }
  const productsRaw = (raw as Record<string, unknown>).products
  if (!Array.isArray(productsRaw)) return { products: [] }
  const seen = new Set<string>()
  const products: IllustrationProduct[] = []
  for (const item of productsRaw) {
    const product = normalizeProduct(item)
    if (!product || seen.has(product.id)) continue
    seen.add(product.id)
    products.push(product)
  }
  return { products }
}

async function loadLibrary(): Promise<IllustrationLibrary> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    return normalizeLibrary(JSON.parse(raw) as unknown)
  } catch {
    return { products: [] }
  }
}

async function persistLibrary(data: IllustrationLibrary): Promise<IllustrationLibrary> {
  const library = normalizeLibrary(data)
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(library, null, 2), 'utf-8')
  return library
}

async function removeLocalFile(url: string): Promise<void> {
  const fileName = illustrationFileNameFromUrl(url)
  if (!fileName) return
  try {
    await rm(join(getIllustrationDir(), fileName), { force: true })
  } catch {
    // ignore missing files
  }
}

export function registerIllustrationProtocol(): void {
  protocol.handle(ILLUSTRATION_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      const fileName = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!isSafeIllustrationFileName(fileName)) {
        return new Response('Bad request', { status: 400 })
      }
      const filePath = join(getIllustrationDir(), fileName)
      return net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export async function getIllustrationLibrary(): Promise<IllustrationLibrary> {
  return loadLibrary()
}

export interface SaveIllustrationProductInput {
  id?: string
  name: string
}

export async function saveIllustrationProduct(
  input: SaveIllustrationProductInput
): Promise<IllustrationLibrary> {
  const name = clampText(input.name, MAX_ILLUSTRATION_PRODUCT_NAME)
  if (!name) throw new Error('请填写产品名称')

  const library = await loadLibrary()
  const existing = input.id ? library.products.find((item) => item.id === input.id) : undefined
  const product: IllustrationProduct = {
    id: existing?.id ?? (typeof input.id === 'string' && input.id.trim() ? input.id.trim() : randomUUID()),
    name,
    images: existing?.images ?? []
  }

  const products = existing
    ? library.products.map((item) => (item.id === existing.id ? product : item))
    : [...library.products, product]

  return persistLibrary({ products })
}

export async function deleteIllustrationProduct(id: string): Promise<IllustrationLibrary> {
  const productId = id.trim()
  if (!productId) throw new Error('缺少产品 ID')
  const library = await loadLibrary()
  const product = library.products.find((item) => item.id === productId)
  if (product) {
    await Promise.all(product.images.map((image) => removeLocalFile(image.url)))
  }
  return persistLibrary({
    products: library.products.filter((item) => item.id !== productId)
  })
}

export interface SaveIllustrationImageInput {
  productId: string
  id?: string
  url: string
  alt?: string
  caption?: string
  stepKey?: string
  matchKeywords?: string[] | string
}

export async function saveIllustrationImage(
  input: SaveIllustrationImageInput
): Promise<IllustrationLibrary> {
  const productId = input.productId.trim()
  const url = clampText(input.url, MAX_ILLUSTRATION_URL)
  if (!productId) throw new Error('请先选择产品')
  if (!isAllowedIllustrationUrl(url)) throw new Error('请填写有效的图片 URL（http/https）')

  const library = await loadLibrary()
  const product = library.products.find((item) => item.id === productId)
  if (!product) throw new Error('未找到该产品')

  const existing = input.id ? product.images.find((item) => item.id === input.id) : undefined
  if (existing && existing.url !== url) {
    await removeLocalFile(existing.url)
  }

  const image: IllustrationImage = {
    id: existing?.id ?? randomUUID(),
    url,
    alt: clampText(input.alt, MAX_ILLUSTRATION_ALT),
    caption: clampText(input.caption, MAX_ILLUSTRATION_CAPTION),
    stepKey: clampText(input.stepKey, MAX_ILLUSTRATION_STEP_KEY),
    matchKeywords: normalizeIllustrationKeywords(input.matchKeywords),
    createdAt: existing?.createdAt ?? Date.now()
  }

  const images = existing
    ? product.images.map((item) => (item.id === existing.id ? image : item))
    : [...product.images, image]

  return persistLibrary({
    products: library.products.map((item) => (item.id === product.id ? { ...item, images } : item))
  })
}

export async function deleteIllustrationImage(
  productId: string,
  imageId: string
): Promise<IllustrationLibrary> {
  const pid = productId.trim()
  const iid = imageId.trim()
  if (!pid || !iid) throw new Error('缺少插图 ID')

  const library = await loadLibrary()
  const product = library.products.find((item) => item.id === pid)
  if (!product) throw new Error('未找到该产品')

  const target = product.images.find((item) => item.id === iid)
  if (target) await removeLocalFile(target.url)

  return persistLibrary({
    products: library.products.map((item) =>
      item.id === pid
        ? { ...item, images: item.images.filter((image) => image.id !== iid) }
        : item
    )
  })
}

export async function importLocalIllustration(
  productId: string,
  filePath: string
): Promise<IllustrationLibrary> {
  const pid = productId.trim()
  if (!pid) throw new Error('请先选择产品')

  const ext = extname(filePath).toLowerCase()
  if (!ALLOWED_IMPORT_EXT.has(ext)) {
    throw new Error('仅支持 png / jpg / webp / gif / svg')
  }

  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('所选路径不是文件')
  if (info.size > MAX_IMPORT_BYTES) throw new Error('图片超过 20MB')

  const fileName = `${randomUUID()}${ext === '.jpeg' ? '.jpg' : ext}`
  const dir = getIllustrationDir()
  await mkdir(dir, { recursive: true })
  await copyFile(filePath, join(dir, fileName))

  return saveIllustrationImage({
    productId: pid,
    url: toIllustrationSrc(fileName),
    alt: ''
  })
}
