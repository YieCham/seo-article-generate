export function locateTextInMarkdown(
  markdown: string,
  selectedText: string
): { start: number; end: number } | null {
  if (!selectedText) return null

  const direct = markdown.indexOf(selectedText)
  if (direct >= 0) {
    return { start: direct, end: direct + selectedText.length }
  }

  const trimmed = selectedText.trim()
  if (trimmed && trimmed !== selectedText) {
    const idx = markdown.indexOf(trimmed)
    if (idx >= 0) {
      return { start: idx, end: idx + trimmed.length }
    }
  }

  const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()
  const normalizedNeedle = collapseWhitespace(selectedText)
  if (!normalizedNeedle || normalizedNeedle.length < 8) return null

  const chunkSize = Math.min(normalizedNeedle.length + 80, 600)
  for (let start = 0; start < markdown.length; start += 1) {
    const slice = markdown.slice(start, start + chunkSize)
    if (collapseWhitespace(slice).includes(normalizedNeedle)) {
      const relative = slice.indexOf(normalizedNeedle.slice(0, Math.min(24, normalizedNeedle.length)))
      if (relative >= 0) {
        const anchor = start + relative
        const end = Math.min(markdown.length, anchor + selectedText.length)
        return { start: anchor, end }
      }
    }
  }

  return null
}
