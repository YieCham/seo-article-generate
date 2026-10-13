/**
 * Page-tail comment / CMS chrome. A hit is a whole line that is itself the
 * comment heading, not a sentence that merely mentions replies.
 */
const COMMENT_REGION_HEADINGS: RegExp[] = [
  /^\d+\s+repl(?:y|ies)\s+(?:on|to)\b/i,
  /^leave\s+a\s+reply\b/i,
  /^post\s+a\s+comment\b/i,
  /^comments?\s*$/i,
  /^pingbacks?\s*$/i,
  /^trackbacks?\s*$/i,
  /^related\s+posts?\b/i,
  /^you\s+may\s+also\s+like\b/i
]

function bareHeadingText(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^__(.+)__$/, '$1')
    .trim()
}

export function isCommentRegionHeading(line: string): boolean {
  const bare = bareHeadingText(line)
  if (!bare) return false
  return COMMENT_REGION_HEADINGS.some((pattern) => pattern.test(bare))
}

/**
 * Drop a comment/CMS tail. The heading must sit after `minRelativeStart` of the
 * document so an early mention cannot wipe the article.
 */
export function stripCommentRegionTail(markdown: string, minRelativeStart = 0.25): string {
  const text = markdown.trim()
  if (!text) return text

  const lines = text.split('\n')
  let offset = 0
  const threshold = text.length * minRelativeStart

  for (const line of lines) {
    if (offset > threshold && isCommentRegionHeading(line)) {
      return text.slice(0, offset).trimEnd()
    }
    offset += line.length + 1
  }

  return text
}

/** Cut a section body at the first comment heading line. Earlier sentences stay. */
export function trimCommentTailFromBody(body: string): string {
  const text = body.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  let offset = 0

  for (const line of lines) {
    if (line.trim() && isCommentRegionHeading(line)) {
      return text.slice(0, offset).trimEnd()
    }
    offset += line.length + 1
  }

  return body
}
