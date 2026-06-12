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

function buildMentionLock(raw: string, productName?: string): string {
  if (productName) {
    return [
      `【硬性要求 — 必须提及产品：${productName}】`,
      `终稿必须多次自然出现产品全名「${productName}」。`,
      `必须包含以「${productName}」为例的分步 How-to 教程（至少 4 步）。`,
      `禁止用 "the converter tool"、"this software"、"某工具" 等泛称替代产品名。`,
      `润色/改写时不得删除或淡化对「${productName}」的提及。`
    ].join('\n')
  }

  if (!raw) return ''

  return [
    '【硬性要求 — 用户补充说明】',
    '以下补充要求必须体现在终稿中（含产品、受众、结构等）：',
    raw,
    '若其中提到具体产品/工具名称，正文必须使用原名，不得泛化。'
  ].join('\n')
}

export function parseUserWritingContext(extraInstructions?: string): UserWritingContext {
  const raw = extraInstructions?.trim() ?? ''
  const productName = raw ? extractProductName(raw) : undefined
  const mentionLock = buildMentionLock(raw, productName)

  const briefParts = [
    raw ? `用户补充要求：\n${raw}` : '',
    productName ? `指定产品名称：${productName}` : ''
  ].filter(Boolean)

  return {
    raw,
    productName,
    mentionLock,
    briefForPrompt: briefParts.join('\n')
  }
}

export function hasUserContext(context: UserWritingContext): boolean {
  return Boolean(context.raw || context.productName)
}
