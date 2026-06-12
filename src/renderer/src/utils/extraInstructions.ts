export function buildExtraInstructions(options: {
  product?: string
  audience?: string
  manual?: string
}): string {
  const lines: string[] = []

  if (options.product?.trim()) {
    lines.push(`Product name: ${options.product.trim()}`)
  }
  if (options.audience?.trim()) {
    lines.push(`Target audience: ${options.audience.trim()}`)
  }
  if (options.manual?.trim()) {
    lines.push(options.manual.trim())
  }

  return lines.join('\n')
}

export function formatUserMessageContent(topic: string, extraInstructions: string): string {
  return extraInstructions.trim()
    ? `${topic}\n\n**补充要求**\n${extraInstructions.trim()}`
    : topic
}
