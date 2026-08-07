/** Remove a single outer ```markdown / ``` fence when the model wraps the whole article. */
export function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n```\s*$/i)
  return match ? match[1].trim() : trimmed
}

/**
 * Strip a leading ## (or #) heading that duplicates the section title.
 * Section drafts are assembled as `## ${title}\n\n${body}`, so model-emitted H2s cause doubles.
 */
export function stripLeadingSectionHeading(body: string, sectionTitle: string): string {
  const trimmed = body.trim()
  if (!trimmed || !sectionTitle.trim()) return trimmed

  const normalize = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/^#+\s*/, '')
      .replace(/[.。:：]+$/g, '')
      .replace(/\s+/g, ' ')

  const expected = normalize(sectionTitle)
  const lines = trimmed.split('\n')
  let index = 0

  while (index < lines.length && !lines[index].trim()) index += 1
  if (index >= lines.length) return trimmed

  const first = lines[index].trim()
  if (!/^#{1,3}\s+/.test(first)) return trimmed
  if (normalize(first) !== expected) return trimmed

  index += 1
  while (index < lines.length && !lines[index].trim()) index += 1
  return lines.slice(index).join('\n').trim()
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
