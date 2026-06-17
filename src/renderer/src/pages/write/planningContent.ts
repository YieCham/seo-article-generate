/** Strip internal `<thinking>` wrappers so planning markdown renders cleanly. */
export function formatPlanningMarkdown(raw: string): string {
  const trimmed = raw.trim()
  const closed = trimmed.match(/<thinking>\s*([\s\S]*?)\s*<\/thinking>/i)
  if (closed) return closed[1].trim()

  const open = trimmed.match(/<thinking>\s*([\s\S]*)$/i)
  if (open) return open[1].trim()

  return trimmed.replace(/<\/?thinking>/gi, '').trim()
}
