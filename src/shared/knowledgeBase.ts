export interface KnowledgeDoc {
  id: string
  title: string
  /** Free-form labels for later step filtering, e.g. product / compliance. */
  tags: string[]
  content: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface KnowledgeQuery {
  /** Keyword / topic text; empty means return enabled docs by recency. */
  query?: string
  /** Keep docs that have at least one of these tags. */
  tags?: string[]
  ids?: string[]
  enabledOnly?: boolean
  maxChars?: number
  maxDocuments?: number
}

export interface KnowledgeRetrievalResult {
  documents: KnowledgeDoc[]
  promptBlock: string
}

export const DEFAULT_KNOWLEDGE_MAX_CHARS = 8000
export const DEFAULT_KNOWLEDGE_MAX_DOCS = 8
export const MAX_KNOWLEDGE_CONTENT_CHARS = 100_000
export const MAX_KNOWLEDGE_TITLE_CHARS = 120
export const MAX_KNOWLEDGE_TAGS = 12
export const MAX_KNOWLEDGE_TAG_CHARS = 32

export function normalizeTags(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，]/)
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const tag = String(item).trim().slice(0, MAX_KNOWLEDGE_TAG_CHARS)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_KNOWLEDGE_TAGS) break
  }
  return out
}

export function parseTagInput(value: string): string[] {
  return normalizeTags(value)
}

export function formatTagInput(tags: string[]): string {
  return tags.join('，')
}

function tokenizeQuery(query: string): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  const stop = new Set(['the', 'and', 'for', 'of', 'to', 'in', 'on', 'with', 'best', 'a', 'an'])
  const tokens = new Set<string>([trimmed])
  for (const part of trimmed.split(/[\s,，;；|/]+/)) {
    const token = part.trim()
    if (token.length < 2 || stop.has(token)) continue
    tokens.add(token)
  }
  return [...tokens]
}

export function scoreKnowledgeDoc(doc: KnowledgeDoc, query: string): number {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) return 1

  const q = query.trim().toLowerCase()
  const title = doc.title.toLowerCase()
  const tagText = doc.tags.join('\n').toLowerCase()
  const content = doc.content.toLowerCase()
  let score = 0

  for (const token of tokens) {
    if (title.includes(token)) score += token === q ? 12 : 6
    if (tagText.includes(token)) score += 8
    if (content.includes(token)) score += 2
  }

  for (const tag of doc.tags) {
    const t = tag.trim().toLowerCase()
    if (t.length < 2) continue
    if (q.includes(t) || t.includes(q)) score += 10
  }

  return score
}

function formatKnowledgeDoc(doc: KnowledgeDoc): string {
  const tagLine = doc.tags.length > 0 ? `标签：${doc.tags.join('、')}\n` : ''
  return `### ${doc.title}\n${tagLine}${doc.content.trim()}`
}

export function buildKnowledgePromptBlock(documents: KnowledgeDoc[]): string {
  if (documents.length === 0) return ''

  const body = documents.map(formatKnowledgeDoc).join('\n\n---\n\n')
  return [
    '【知识库】',
    '以下为产品知识库中的已启用条目。撰写时必须遵守其中的事实、卖点、限制与禁词，不得编造与之冲突的信息；未覆盖的细节可以补充，但不得与知识库矛盾。',
    '',
    body
  ].join('\n')
}

export function wrapProductIntroKnowledge(productName: string, promptBlock: string): string {
  const block = promptBlock.trim()
  if (!block) return ''
  return [
    `【知识库使用范围 — 仅「${productName}」介绍】`,
    `以下材料只用于撰写用户所选产品「${productName}」的介绍、卖点、限制与适用场景。`,
    '功能、平台、价格、禁词与事实以知识库为准，不得编造与之冲突的信息；未覆盖处可补充，但不得矛盾。',
    '本节若同时出现其他产品，禁止把本知识库套用到其他产品上。',
    '',
    block
  ].join('\n')
}

export function retrieveKnowledgeFromDocs(
  documents: KnowledgeDoc[],
  query: KnowledgeQuery = {}
): KnowledgeRetrievalResult {
  const enabledOnly = query.enabledOnly !== false
  const maxChars = query.maxChars ?? DEFAULT_KNOWLEDGE_MAX_CHARS
  const maxDocuments = query.maxDocuments ?? DEFAULT_KNOWLEDGE_MAX_DOCS
  const tagFilter = normalizeTags(query.tags)
  const idFilter = Array.isArray(query.ids) ? new Set(query.ids.filter(Boolean)) : null
  const search = query.query?.trim() ?? ''

  let pool = documents.filter((doc) => {
    if (enabledOnly && !doc.enabled) return false
    if (idFilter && !idFilter.has(doc.id)) return false
    if (tagFilter.length > 0) {
      const docTags = new Set(doc.tags.map((tag) => tag.toLowerCase()))
      if (!tagFilter.some((tag) => docTags.has(tag.toLowerCase()))) return false
    }
    return true
  })

  if (search) {
    pool = pool
      .map((doc) => ({ doc, score: scoreKnowledgeDoc(doc, search) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.doc.updatedAt - a.doc.updatedAt)
      .map((item) => item.doc)
  } else {
    pool = [...pool].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  const selected: KnowledgeDoc[] = []
  let usedChars = 0

  for (const doc of pool) {
    if (selected.length >= maxDocuments) break
    const formatted = formatKnowledgeDoc(doc)
    if (selected.length > 0 && usedChars + formatted.length > maxChars) break
    if (selected.length === 0 && formatted.length > maxChars) {
      const truncated: KnowledgeDoc = {
        ...doc,
        content: `${doc.content.slice(0, Math.max(0, maxChars - doc.title.length - 80)).trim()}\n\n…（条目过长，已截断）`
      }
      selected.push(truncated)
      break
    }
    selected.push(doc)
    usedChars += formatted.length
  }

  return {
    documents: selected,
    promptBlock: buildKnowledgePromptBlock(selected)
  }
}
