import { buildProductMentionLock } from './productMention'

export interface UserWritingContext {
  raw: string
  productName?: string
  mentionLock: string
  briefForPrompt: string
}

const PRODUCT_PATTERNS = [
  /product\s*name\s*[:：]\s*([^\n,;，；]+)/i,
  /产品名(?:称)?\s*[:：]\s*([^\n,;，；]+)/i,
  /(?:我的|我们的)?产品\s*[:：]\s*([^\n,;，；]+)/i,
  /(?:推广|介绍|使用|提及)\s*[:：]?\s*([A-Z][A-Za-z0-9][A-Za-z0-9\s\-]{2,})/,
  /(?:推广|介绍|使用|提及)\s*[:：]?\s*([\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9\s\-]{1,30})/
]

const WRITER_META_LINE =
  /^(target\s*audience|目标读者|article\s*type|文章类型|product\s*name|产品名(?:称)?)\s*[:：]/i

function extractProductName(raw: string): string | undefined {
  for (const pattern of PRODUCT_PATTERNS) {
    const match = raw.match(pattern)
    const candidate = match?.[1]?.trim()
    if (candidate && candidate.length >= 2) return candidate
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 1 && lines[0].length <= 80 && !/[。！？.!?]/.test(lines[0])) {
    return lines[0]
  }

  return undefined
}

function stripWriterMetaLines(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !WRITER_META_LINE.test(line))
    .join('\n')
    .trim()
}

function buildMentionLock(raw: string, productName?: string): string {
  if (productName) {
    return buildProductMentionLock(productName)
  }

  const contentBrief = stripWriterMetaLines(raw)
  if (!contentBrief) return ''

  return [
    '【硬性要求 — 用户补充说明】',
    '以下补充要求必须体现在终稿中（含产品、结构等）：',
    contentBrief,
    '若其中提到具体产品/工具名称，正文必须使用原名，不得泛化。'
  ].join('\n')
}

function buildBriefForPrompt(raw: string, productName?: string): string {
  const contentBrief = stripWriterMetaLines(raw)
  const parts = [
    contentBrief ? `用户补充要求：\n${contentBrief}` : '',
    productName ? `指定产品名称：${productName}` : ''
  ].filter(Boolean)

  return parts.join('\n')
}

export function getUserContextPromptBlocks(context: UserWritingContext): string {
  return context.mentionLock
}

export function parseUserWritingContext(extraInstructions?: string): UserWritingContext {
  const raw = extraInstructions?.trim() ?? ''
  const productName = raw ? extractProductName(raw) : undefined

  return {
    raw,
    productName,
    mentionLock: buildMentionLock(raw, productName),
    briefForPrompt: buildBriefForPrompt(raw, productName)
  }
}

export function hasUserContext(context: UserWritingContext): boolean {
  return Boolean(context.raw || context.productName)
}
