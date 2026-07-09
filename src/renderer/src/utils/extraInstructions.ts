import type { ArticleType } from '../constants/articleTypes'

export function buildExtraInstructions(options: {
  product?: string
  manual?: string
  articleType?: ArticleType
}): string {
  const lines: string[] = []

  if (options.articleType === 'review') {
    lines.push('Article type: Product Review')
  } else if (options.articleType === 'top-rank') {
    lines.push('Article type: Top Rank / Best-of List')
  } else if (options.articleType === 'how-to') {
    lines.push('Article type: How-to Guide')
  }

  if (options.product?.trim()) {
    lines.push(`Product name: ${options.product.trim()}`)
  }
  if (options.manual?.trim()) {
    lines.push(options.manual.trim())
  }

  return lines.join('\n')
}

export function formatUserMessageContent(
  topic: string,
  extraInstructions: string,
  articleType?: ArticleType
): string {
  const typeLabel =
    articleType === 'review' ? 'Review' : articleType === 'top-rank' ? 'Top rank' : 'How to'
  const header = `**文章类型：** ${typeLabel}`

  if (!extraInstructions.trim()) {
    return `${header}\n\n${topic}`
  }

  return `${header}\n\n${topic}\n\n**补充要求**\n${extraInstructions.trim()}`
}

export function formatOptimizeUserMessageContent(sourceUrl: string, extraInstructions: string): string {
  const header = `**模式：** 文章优化\n**来源 URL：** ${sourceUrl.trim()}`

  if (!extraInstructions.trim()) {
    return header
  }

  return `${header}\n\n**补充要求**\n${extraInstructions.trim()}`
}

export function parseCreateUserMessage(content: string): {
  topic: string
  extraInstructions: string
  articleType: ArticleType
} | null {
  if (content.startsWith('**模式：**')) return null

  const typeMatch = content.match(/^\*\*文章类型：\*\*\s*(Review|Top rank|How to)/)
  let articleType: ArticleType = 'how-to'
  if (typeMatch?.[1] === 'Review') articleType = 'review'
  else if (typeMatch?.[1] === 'Top rank') articleType = 'top-rank'

  const extraMatch = content.match(/\n\n\*\*补充要求\*\*\n([\s\S]*)$/)
  const extraInstructions = extraMatch?.[1]?.trim() ?? ''

  let body = content.replace(/^\*\*文章类型：\*\*[^\n]*\n\n?/, '')
  if (extraMatch) {
    body = body.replace(/\n\n\*\*补充要求\*\*\n[\s\S]*$/, '')
  }

  const topic = body.trim()
  if (!topic) return null

  return { topic, extraInstructions, articleType }
}

export function parseOptimizeUserMessage(content: string): {
  sourceUrl: string
  extraInstructions: string
} | null {
  if (!content.startsWith('**模式：** 文章优化')) return null

  const urlMatch = content.match(/\*\*来源 URL：\*\*\s*(\S+)/)
  if (!urlMatch?.[1]) return null

  const extraMatch = content.match(/\n\n\*\*补充要求\*\*\n([\s\S]*)$/)
  const extraInstructions = extraMatch?.[1]?.trim() ?? ''

  return { sourceUrl: urlMatch[1].trim(), extraInstructions }
}

export function formatReviseUserMessageContent(
  instruction: string,
  selectionPreview?: string
): string {
  const trimmed = instruction.trim()
  if (selectionPreview?.trim()) {
    const preview =
      selectionPreview.length > 120 ? `${selectionPreview.slice(0, 120).trim()}…` : selectionPreview.trim()
    return `**修改说明**（选中片段：「${preview}」）\n${trimmed}`
  }
  return `**修改说明**\n${trimmed}`
}
