/** Remove a single outer ```markdown / ``` fence when the model wraps the whole article. */
export function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n```\s*$/i)
  return match ? match[1].trim() : trimmed
}

/**
 * Normalize assistant article markdown for display/storage.
 * Handles SEO Meta prefix + fenced body (common in optimize polish output).
 */
export function normalizeArticleMarkdown(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return content

  const withSeoMeta = trimmed.match(
    /^(## SEO Meta[\s\S]*?\n---\n+)```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i
  )
  if (withSeoMeta) {
    return `${withSeoMeta[1]}${withSeoMeta[2].trim()}`
  }

  return stripOuterCodeFence(trimmed)
}
