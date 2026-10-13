import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getArticleUserDataDir } from '../paths'
import { loadConfig } from '../config/configStore'
import type { QuickPickOption } from '../config/types'
import { normalizeSiteUrl, resolveWordPressPreset } from '../../shared/wordpress'
import {
  hostKey,
  isHostLikeCatalogKey,
  namesMatchIgnoreCase,
  parseUrlFilterPatterns,
  productCatalogKey,
  summarizeCatalog,
  type InternalLinkCatalog,
  type InternalLinkCatalogSummary,
  type InternalLinkDoc
} from '../../shared/internalLinks'

interface InternalLinkStoreData {
  catalogs: Record<string, InternalLinkCatalog>
}

export interface ResolveInternalLinkDocsInput {
  productId?: string
  productName?: string
}

const EMPTY_STORE: InternalLinkStoreData = { catalogs: {} }

function getStorePath(): string {
  return join(getArticleUserDataDir(), 'internal-links.json')
}

function isDoc(value: unknown): value is InternalLinkDoc {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.siteUrl === 'string' &&
    typeof item.url === 'string' &&
    typeof item.title === 'string' &&
    typeof item.slug === 'string'
  )
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseCatalog(value: unknown, key: string): InternalLinkCatalog | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (typeof item.siteUrl !== 'string' || typeof item.importedAt !== 'number' || !Array.isArray(item.documents)) {
    return null
  }
  const productId = readOptionalString(item.productId) || (!isHostLikeCatalogKey(key) ? key : '')
  return {
    productId,
    productName: readOptionalString(item.productName),
    siteUrl: item.siteUrl,
    sitemapUrl: readOptionalString(item.sitemapUrl),
    importedAt: item.importedAt,
    truncated: Boolean(item.truncated),
    includePatterns: parseUrlFilterPatterns(item.includePatterns),
    excludePatterns: parseUrlFilterPatterns(item.excludePatterns),
    documents: item.documents.filter(isDoc)
  }
}

function productSiteHost(product: QuickPickOption, wordpress: Parameters<typeof resolveWordPressPreset>[0]): string {
  if (!product.wordpressPresetId) return ''
  const preset = resolveWordPressPreset(wordpress, product.wordpressPresetId)
  const siteUrl = normalizeSiteUrl(preset.siteUrl)
  return siteUrl ? hostKey(siteUrl) : ''
}

async function migrateHostKeyedCatalogs(
  catalogs: Record<string, InternalLinkCatalog>
): Promise<{ catalogs: Record<string, InternalLinkCatalog>; changed: boolean }> {
  let changed = false
  const next: Record<string, InternalLinkCatalog> = { ...catalogs }

  try {
    const config = await loadConfig()
    const products = config.quickPicks.products
    const hostToProducts = new Map<string, QuickPickOption[]>()
    for (const product of products) {
      const host = productSiteHost(product, config.wordpress)
      if (!host) continue
      const list = hostToProducts.get(host) ?? []
      list.push(product)
      hostToProducts.set(host, list)
    }

    for (const [key, catalog] of Object.entries(catalogs)) {
      if (catalog.productId) {
        const pid = productCatalogKey(catalog.productId)
        if (!pid) continue
        if (key !== pid && !next[pid]) {
          next[pid] = { ...catalog, productId: pid }
          delete next[key]
          changed = true
        } else if (key === pid && (catalog.productId !== pid || !catalog.productName)) {
          const label = products.find((item) => item.id === pid)?.label
          next[pid] = {
            ...catalog,
            productId: pid,
            productName: catalog.productName || label
          }
          if (catalog.productId !== pid || next[pid].productName !== catalog.productName) {
            changed = true
          }
        }
        continue
      }

      const productById = products.find((item) => item.id === key)
      if (productById) {
        next[key] = {
          ...catalog,
          productId: productById.id,
          productName: catalog.productName || productById.label
        }
        changed = true
        continue
      }

      if (!isHostLikeCatalogKey(key)) continue
      const host = hostKey(catalog.siteUrl) || key
      const matches = hostToProducts.get(host) ?? []
      const target = matches.find((item) => !next[item.id] || next[item.id] === catalog)
      if (!target) continue
      if (next[target.id] && next[target.id] !== catalog) continue
      next[target.id] = {
        ...catalog,
        productId: target.id,
        productName: catalog.productName || target.label
      }
      if (key !== target.id) delete next[key]
      changed = true
    }
  } catch {
    return { catalogs, changed: false }
  }

  return { catalogs: next, changed }
}

async function loadStore(): Promise<InternalLinkStoreData> {
  let catalogs: Record<string, InternalLinkCatalog> = {}
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as InternalLinkStoreData
    if (parsed && typeof parsed === 'object' && parsed.catalogs) {
      for (const [key, value] of Object.entries(parsed.catalogs)) {
        const catalog = parseCatalog(value, key)
        if (catalog) catalogs[key] = catalog
      }
    }
  } catch {
    catalogs = {}
  }

  const migrated = await migrateHostKeyedCatalogs(catalogs)
  if (migrated.changed) {
    await persistStore({ catalogs: migrated.catalogs })
  }
  return { catalogs: migrated.catalogs }
}

async function persistStore(data: InternalLinkStoreData): Promise<void> {
  await mkdir(getArticleUserDataDir(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export async function getInternalLinkCatalog(productId: string): Promise<InternalLinkCatalog | null> {
  const key = productCatalogKey(productId)
  if (!key) return null
  const store = await loadStore()
  return store.catalogs[key] ?? null
}

export async function listInternalLinkSummaries(): Promise<InternalLinkCatalogSummary[]> {
  const store = await loadStore()
  return Object.values(store.catalogs)
    .filter((catalog) => catalog.productId)
    .map((catalog) => summarizeCatalog(catalog))
    .filter((item): item is InternalLinkCatalogSummary => Boolean(item))
}

export async function getInternalLinkSummary(productId?: string): Promise<InternalLinkCatalogSummary | null> {
  if (!productId?.trim()) return null
  return summarizeCatalog(await getInternalLinkCatalog(productId))
}

function findCatalogByProductName(
  catalogs: Record<string, InternalLinkCatalog>,
  productName: string,
  products: QuickPickOption[]
): InternalLinkCatalog | null {
  const pick = products.find((item) => namesMatchIgnoreCase(item.label, productName))
  if (pick) {
    const byId = catalogs[pick.id]
    if (byId?.productId && byId.documents.length) return byId
  }
  return (
    Object.values(catalogs).find(
      (catalog) =>
        Boolean(catalog.productId) &&
        catalog.documents.length > 0 &&
        namesMatchIgnoreCase(catalog.productName, productName)
    ) ?? null
  )
}

export async function resolveInternalLinkDocs(
  input?: ResolveInternalLinkDocsInput
): Promise<{
  productId: string
  productName?: string
  siteUrl: string
  documents: InternalLinkDoc[]
}> {
  const store = await loadStore()
  const productId = productCatalogKey(input?.productId ?? '')
  if (productId) {
    const catalog = store.catalogs[productId]
    if (catalog?.documents.length && (!catalog.productId || catalog.productId === productId)) {
      return {
        productId: catalog.productId || productId,
        productName: catalog.productName,
        siteUrl: catalog.siteUrl,
        documents: catalog.documents
      }
    }
  }

  const productName = input?.productName?.trim()
  if (productName) {
    let products: QuickPickOption[] = []
    try {
      products = (await loadConfig()).quickPicks.products
    } catch {
      products = []
    }
    const catalog = findCatalogByProductName(store.catalogs, productName, products)
    if (catalog?.documents.length) {
      if (!productId || catalog.productId === productId) {
        return {
          productId: catalog.productId,
          productName: catalog.productName,
          siteUrl: catalog.siteUrl,
          documents: catalog.documents
        }
      }
    }
  }

  return { productId: productId || '', productName: input?.productName, siteUrl: '', documents: [] }
}

export async function saveInternalLinkCatalog(catalog: InternalLinkCatalog): Promise<InternalLinkCatalog> {
  const productId = productCatalogKey(catalog.productId)
  if (!productId) throw new Error('请先选择产品')
  const siteUrl = normalizeSiteUrl(catalog.siteUrl) || catalog.siteUrl
  const store = await loadStore()
  const next: InternalLinkCatalog = {
    ...catalog,
    productId,
    productName: catalog.productName?.trim() || undefined,
    siteUrl
  }
  store.catalogs[productId] = next
  await persistStore(store)
  return next
}

export async function listInternalLinkDocs(productId: string): Promise<InternalLinkDoc[]> {
  const catalog = await getInternalLinkCatalog(productId)
  return catalog?.documents ?? []
}
