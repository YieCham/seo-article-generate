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

export function formatReviseUserMessageContent(instruction: string): string {
  return `**修改说明**\n${instruction.trim()}`
}
