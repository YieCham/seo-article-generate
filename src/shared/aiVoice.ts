export interface AiVoiceFinding {
  id: string
  quote: string
  pattern: string
  reason: string
  replacement?: string
}

export interface AiVoiceScanResult {
  findings: AiVoiceFinding[]
}

export function applyAiVoiceEdits(
  markdown: string,
  edits: Array<{ quote: string; replacement: string }>
): string {
  const ordered = [...edits]
    .filter((item) => item.quote.trim() && item.replacement.trim() && item.quote !== item.replacement)
    .sort((a, b) => b.quote.length - a.quote.length)

  let text = markdown
  for (const edit of ordered) {
    const index = text.indexOf(edit.quote)
    if (index < 0) continue
    text = `${text.slice(0, index)}${edit.replacement}${text.slice(index + edit.quote.length)}`
  }
  return text
}
