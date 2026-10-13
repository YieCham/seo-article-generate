import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { getArticleUserDataDir } from '../paths'
import {
  BUILTIN_DOMAIN_PACKS,
  isBuiltinDomainPackId,
  lookupDomainPack,
  sanitizeDomainPackFields,
  slugifyDomainPackId,
  type DomainPack,
  type DomainPackFields,
  type SaveDomainPackInput
} from '../../shared/domainPacks'

export type { DomainPack, SaveDomainPackInput }

interface DomainPackStoreData {
  overrides: Record<string, DomainPackFields>
  custom: DomainPack[]
}

const EMPTY_STORE: DomainPackStoreData = { overrides: {}, custom: [] }

function getStorePath(): string {
  return join(getArticleUserDataDir(), 'domain-packs.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toPackFields(raw: unknown): DomainPackFields | null {
  if (!isRecord(raw)) return null
  if (typeof raw.name !== 'string') return null
  return sanitizeDomainPackFields(raw as Partial<DomainPackFields> & { name: string })
}

function toCustomPack(raw: unknown): DomainPack | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (isBuiltinDomainPackId(raw.id)) return null
  const fields = toPackFields(raw)
  if (!fields) return null
  return { id: raw.id.trim(), ...fields }
}

function mergeCatalog(store: DomainPackStoreData): DomainPack[] {
  const builtins = BUILTIN_DOMAIN_PACKS.map((pack) => {
    const override = store.overrides[pack.id]
    return override ? { ...pack, ...override, id: pack.id } : pack
  })
  return [...builtins, ...store.custom]
}

async function loadStore(): Promise<DomainPackStoreData> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return { ...EMPTY_STORE }

    const overrides: Record<string, DomainPackFields> = {}
    if (isRecord(parsed.overrides)) {
      for (const [id, value] of Object.entries(parsed.overrides)) {
        if (!isBuiltinDomainPackId(id)) continue
        const fields = toPackFields(value)
        if (fields) overrides[id] = fields
      }
    }

    const custom = Array.isArray(parsed.custom)
      ? parsed.custom.map(toCustomPack).filter((item): item is DomainPack => Boolean(item))
      : []

    const seen = new Set<string>(BUILTIN_DOMAIN_PACKS.map((pack) => pack.id))
    const uniqueCustom: DomainPack[] = []
    for (const pack of custom) {
      if (seen.has(pack.id)) continue
      seen.add(pack.id)
      uniqueCustom.push(pack)
    }

    return { overrides, custom: uniqueCustom }
  } catch {
    return { ...EMPTY_STORE }
  }
}

async function persistStore(data: DomainPackStoreData): Promise<void> {
  await mkdir(getArticleUserDataDir(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function allocateCustomId(name: string, taken: Set<string>): string {
  const stem = slugifyDomainPackId(name)
  let candidate = stem
  if (taken.has(candidate) || isBuiltinDomainPackId(candidate)) {
    candidate = `${stem}-${randomUUID().slice(0, 6)}`
  }
  let n = 2
  while (taken.has(candidate) || isBuiltinDomainPackId(candidate)) {
    candidate = `${stem}-${n}`
    n += 1
  }
  return candidate
}

export async function listDomainPacks(): Promise<DomainPack[]> {
  const store = await loadStore()
  return mergeCatalog(store)
}

export async function resolveStoredDomainPack(id?: string | null): Promise<DomainPack> {
  const packs = await listDomainPacks()
  return lookupDomainPack(id, packs)
}

export async function saveDomainPack(input: SaveDomainPackInput): Promise<DomainPack> {
  const name = input.name?.trim() ?? ''
  if (!name) {
    throw new Error('请填写领域包名称')
  }
  if (!Array.isArray(input.formats) || input.formats.length === 0) {
    throw new Error('请至少选择一种文章类型')
  }

  const fields = sanitizeDomainPackFields(input)
  const store = await loadStore()
  const id = input.id?.trim() ?? ''

  if (id && isBuiltinDomainPackId(id)) {
    store.overrides[id] = fields
    await persistStore(store)
    return { id, ...fields }
  }

  if (id) {
    const index = store.custom.findIndex((pack) => pack.id === id)
    if (index < 0) {
      throw new Error('找不到要更新的领域包')
    }
    const next = { id, ...fields }
    store.custom[index] = next
    await persistStore(store)
    return next
  }

  const taken = new Set([
    ...BUILTIN_DOMAIN_PACKS.map((pack) => pack.id),
    ...store.custom.map((pack) => pack.id)
  ])
  const created = { id: allocateCustomId(name, taken), ...fields }
  store.custom.push(created)
  await persistStore(store)
  return created
}

export async function deleteDomainPack(id: string): Promise<void> {
  const packId = id.trim()
  if (!packId) throw new Error('缺少领域包 ID')
  if (isBuiltinDomainPackId(packId)) {
    throw new Error('内置领域包不能删除，请使用「恢复默认」')
  }
  const store = await loadStore()
  const next = store.custom.filter((pack) => pack.id !== packId)
  if (next.length === store.custom.length) {
    throw new Error('找不到要删除的领域包')
  }
  store.custom = next
  await persistStore(store)
}

export async function restoreBuiltinDomainPack(id: string): Promise<DomainPack> {
  const packId = id.trim()
  if (!isBuiltinDomainPackId(packId)) {
    throw new Error('只有内置领域包可以恢复默认')
  }
  const store = await loadStore()
  delete store.overrides[packId]
  await persistStore(store)
  return lookupDomainPack(packId, BUILTIN_DOMAIN_PACKS)
}
