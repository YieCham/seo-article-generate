/** Strip internal `<thinking>` wrappers so planning markdown renders cleanly. */
export function formatPlanningMarkdown(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '（规划内容为空）'

  const closed = trimmed.match(/<thinking>\s*([\s\S]*?)\s*<\/thinking>/i)
  if (closed?.[1]?.trim()) return closed[1].trim()

  const open = trimmed.match(/<thinking>\s*([\s\S]*)$/i)
  if (open?.[1]?.trim()) return open[1].trim()

  const stripped = trimmed.replace(/<\/?thinking>/gi, '').trim()
  return stripped || trimmed
}
