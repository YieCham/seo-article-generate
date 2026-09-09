import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { getArticleUserDataDir } from '../paths'
import {
  MAX_KNOWLEDGE_CONTENT_CHARS,
  MAX_KNOWLEDGE_TITLE_CHARS,
  normalizeTags,
  retrieveKnowledgeFromDocs,
  wrapProductIntroKnowledge,
  type KnowledgeDoc,
  type KnowledgeQuery,
  type KnowledgeRetrievalResult
} from '../../shared/knowledgeBase'

export type {
  KnowledgeDoc,
  KnowledgeQuery,
  KnowledgeRetrievalResult
} from '../../shared/knowledgeBase'

interface KnowledgeStoreData {
  documents: KnowledgeDoc[]
}

const EMPTY_STORE: KnowledgeStoreData = { documents: [] }

function getStorePath(): string {
  return join(getArticleUserDataDir(), 'knowledge-base.json')
}

function isKnowledgeDoc(value: unknown): value is KnowledgeDoc {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.content === 'string' &&
    typeof item.enabled === 'boolean' &&
    typeof item.createdAt === 'number' &&
    typeof item.updatedAt === 'number'
  )
}

function normalizeDoc(raw: KnowledgeDoc): KnowledgeDoc {
  return {
    id: raw.id,
    title: raw.title.trim().slice(0, MAX_KNOWLEDGE_TITLE_CHARS) || '未命名条目',
    tags: normalizeTags(raw.tags),
    content: raw.content.slice(0, MAX_KNOWLEDGE_CONTENT_CHARS),
    enabled: raw.enabled !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  }
}

async function loadStore(): Promise<KnowledgeStoreData> {
  try {
    const raw = await readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as KnowledgeStoreData
    if (!Array.isArray(parsed.documents)) return { ...EMPTY_STORE }
    return {
      documents: parsed.documents.filter(isKnowledgeDoc).map(normalizeDoc)
    }
  } catch {
    return { ...EMPTY_STORE }
  }
}

async function persistStore(data: KnowledgeStoreData): Promise<void> {
  await mkdir(getArticleUserDataDir(), { recursive: true })
  await writeFile(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export async function listKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const store = await loadStore()
  return [...store.documents].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getKnowledgeDoc(id: string): Promise<KnowledgeDoc | null> {
  const store = await loadStore()
  return store.documents.find((item) => item.id === id) ?? null
}

export interface SaveKnowledgeDocInput {
  id?: string
  title: string
  tags?: string[] | string
  content: string
  enabled?: boolean
}

export async function saveKnowledgeDoc(input: SaveKnowledgeDocInput): Promise<KnowledgeDoc> {
  const title = input.title.trim().slice(0, MAX_KNOWLEDGE_TITLE_CHARS)
  if (!title) {
    throw new Error('请填写知识库条目标题')
  }

  const store = await loadStore()
  const now = Date.now()
  const existing = input.id ? store.documents.find((item) => item.id === input.id) : undefined
  const doc: KnowledgeDoc = {
    id: existing?.id ?? randomUUID(),
    title,
    tags: normalizeTags(input.tags),
    content: input.content.slice(0, MAX_KNOWLEDGE_CONTENT_CHARS),
    enabled: input.enabled ?? existing?.enabled ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  const documents = existing
    ? store.documents.map((item) => (item.id === existing.id ? doc : item))
    : [doc, ...store.documents]

  await persistStore({ documents })
  return doc
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  if (!id) return
  const store = await loadStore()
  await persistStore({
    documents: store.documents.filter((item) => item.id !== id)
  })
}

export async function setKnowledgeDocEnabled(id: string, enabled: boolean): Promise<KnowledgeDoc> {
  const store = await loadStore()
  const existing = store.documents.find((item) => item.id === id)
  if (!existing) {
    throw new Error('知识库条目不存在')
  }

  const doc: KnowledgeDoc = {
    ...existing,
    enabled,
    updatedAt: Date.now()
  }

  await persistStore({
    documents: store.documents.map((item) => (item.id === id ? doc : item))
  })
  return doc
}

export async function importKnowledgeFromFiles(
  files: Array<{ title: string; content: string }>
): Promise<KnowledgeDoc[]> {
  const imported: KnowledgeDoc[] = []
  for (const file of files) {
    const title = file.title.trim()
    const content = file.content.trim()
    if (!title || !content) continue
    imported.push(
      await saveKnowledgeDoc({
        title,
        content,
        enabled: true
      })
    )
  }
  return imported
}

export interface ProductIntroKnowledge {
  promptBlock: string
  documentCount: number
}

/**
 * Pipeline steps should call this when they need knowledge.
 * Returns an empty promptBlock when nothing matches.
 */
export async function retrieveKnowledge(
  query: KnowledgeQuery = {}
): Promise<KnowledgeRetrievalResult> {
  const documents = await listKnowledgeDocs()
  return retrieveKnowledgeFromDocs(documents, query)
}

export async function getKnowledgePromptBlock(query: KnowledgeQuery = {}): Promise<string> {
  const result = await retrieveKnowledge(query)
  return result.promptBlock
}

/** Body-draft helper: only inject docs that match the selected product name. */
export async function retrieveProductIntroKnowledge(
  productName: string
): Promise<ProductIntroKnowledge> {
  const name = productName.trim()
  if (!name) {
    return { promptBlock: '', documentCount: 0 }
  }

  const matched = await retrieveKnowledge({ query: name, enabledOnly: true })
  return {
    promptBlock: wrapProductIntroKnowledge(name, matched.promptBlock),
    documentCount: matched.documents.length
  }
}
