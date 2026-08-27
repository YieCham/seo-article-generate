export function pickClosestOccurrence(
  markdown: string,
  needle: string,
  anchor: number
): { start: number; end: number } | null {
  if (!needle) return null

  let bestStart = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let pos = 0

  while (pos <= markdown.length) {
    const idx = markdown.indexOf(needle, pos)
    if (idx < 0) break

    const distance = Math.abs(idx - anchor)
    if (distance < bestDistance) {
      bestDistance = distance
      bestStart = idx
    }
    pos = idx + 1
  }

  if (bestStart < 0) return null
  return { start: bestStart, end: bestStart + needle.length }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

/** Strip heading hashes, list markers and emphasis so DOM text can match markdown. */
export function stripVisibleMarkdown(value: string): string {
  return collapseWhitespace(
    stripInlineMarkdown(
      value
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+[.)]\s+/gm, '')
        .replace(/^\s*>\s+/gm, '')
    )
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Allow markdown syntax (##, -, 1.) between visible words from a DOM selection. */
const MARKDOWN_TOKEN_GAP = '(?:\\s|[#>\\*+_`[\\]()!.,:：-]|\\d+[.)])+'

/** Match selected text in markdown allowing flexible whitespace / paragraph breaks. */
function locateFlexibleNear(
  markdown: string,
  selectedText: string,
  anchor: number
): { start: number; end: number } | null {
  const trimmed = selectedText.trim()
  if (trimmed.length < 2) return null

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null

  const searchRadius = Math.max(1200, trimmed.length * 8)
  const windowStart = Math.max(0, anchor - searchRadius)
  const windowEnd = Math.min(markdown.length, anchor + searchRadius + trimmed.length)
  const window = markdown.slice(windowStart, windowEnd)

  const head = tokens.slice(0, Math.min(6, tokens.length)).map(escapeRegExp).join(MARKDOWN_TOKEN_GAP)
  const tail = tokens.slice(-Math.min(4, tokens.length)).map(escapeRegExp).join(MARKDOWN_TOKEN_GAP)
  const pattern = new RegExp(`${head}[\\s\\S]{0,${Math.max(trimmed.length * 3, 280)}}?${tail}`, 'i')
  const match = pattern.exec(window)
  if (!match) return null

  return {
    start: windowStart + match.index,
    end: windowStart + match.index + match[0].length
  }
}

export function locateTextInMarkdown(
  markdown: string,
  selectedText: string,
  anchor = Math.floor(markdown.length / 2)
): { start: number; end: number } | null {
  if (!selectedText) return null

  const direct = pickClosestOccurrence(markdown, selectedText, anchor)
  if (direct) return direct

  const trimmed = selectedText.trim()
  if (trimmed && trimmed !== selectedText) {
    const trimmedHit = pickClosestOccurrence(markdown, trimmed, anchor)
    if (trimmedHit) return trimmedHit
  }

  const normalizedNeedle = collapseWhitespace(selectedText)
  if (!normalizedNeedle) return null

  const searchRadius = Math.max(400, normalizedNeedle.length * 8)
  const windowStart = Math.max(0, anchor - searchRadius)
  const windowEnd = Math.min(markdown.length, anchor + searchRadius + normalizedNeedle.length)
  const window = markdown.slice(windowStart, windowEnd)

  const directInWindow = pickClosestOccurrence(window, selectedText, anchor - windowStart)
  if (directInWindow) {
    return {
      start: windowStart + directInWindow.start,
      end: windowStart + directInWindow.end
    }
  }

  const trimmedInWindow = pickClosestOccurrence(window, trimmed, anchor - windowStart)
  if (trimmedInWindow) {
    return {
      start: windowStart + trimmedInWindow.start,
      end: windowStart + trimmedInWindow.end
    }
  }

  const flexible = locateFlexibleNear(markdown, selectedText, anchor)
  if (flexible) return flexible

  if (normalizedNeedle.length >= 2) {
    const normalizedWindow = collapseWhitespace(window)
    const relative = normalizedWindow.indexOf(normalizedNeedle)
    if (relative >= 0) {
      const head = normalizedNeedle.slice(0, Math.min(24, normalizedNeedle.length))
      const roughStart = window.indexOf(head)
      if (roughStart >= 0) {
        const start = windowStart + roughStart
        const end = Math.min(markdown.length, start + selectedText.length + 32)
        return { start, end }
      }
    }
  }

  if (normalizedNeedle.length < 8) return null

  const chunkSize = Math.min(normalizedNeedle.length + 120, 800)
  for (let start = Math.max(0, anchor - 2000); start < markdown.length; start += 1) {
    const slice = markdown.slice(start, start + chunkSize)
    if (!collapseWhitespace(slice).includes(normalizedNeedle.slice(0, Math.min(32, normalizedNeedle.length)))) {
      continue
    }
    const relativeNeedle = slice.indexOf(normalizedNeedle.slice(0, Math.min(24, normalizedNeedle.length)))
    if (relativeNeedle >= 0) {
      const hitStart = start + relativeNeedle
      return {
        start: hitStart,
        end: Math.min(markdown.length, hitStart + selectedText.length + 48)
      }
    }
  }

  return null
}

export function markdownSliceMatchesSelection(markdownSlice: string, selectedText: string): boolean {
  if (markdownSlice === selectedText) return true

  const normalizedSlice = stripVisibleMarkdown(markdownSlice)
  const normalizedSelection = collapseWhitespace(selectedText)
  if (!normalizedSelection) return false
  if (normalizedSlice === normalizedSelection) return true

  const sliceLen = normalizedSlice.length
  const selectionLen = normalizedSelection.length
  if (sliceLen === 0 || selectionLen === 0) return false

  // Reject partial slices (e.g. "B" matching inside a long selection).
  const ratio = sliceLen / selectionLen
  if (ratio < 0.7 || ratio > 1.6) return false

  if (normalizedSlice.includes(normalizedSelection) || normalizedSelection.includes(normalizedSlice)) {
    return true
  }

  return false
}

/** Include heading hashes / list markers when the DOM selection started on visible text. */
export function expandSelectionToMarkdownMarkers(
  markdown: string,
  start: number,
  end: number
): { start: number; end: number; text: string } {
  let nextStart = Math.max(0, Math.min(start, markdown.length))
  let nextEnd = Math.max(nextStart, Math.min(end, markdown.length))

  const lineStart = markdown.lastIndexOf('\n', Math.max(0, nextStart - 1)) + 1
  const prefix = markdown.slice(lineStart, nextStart)
  if (/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+)$/.test(prefix)) {
    nextStart = lineStart
  }

  return {
    start: nextStart,
    end: nextEnd,
    text: markdown.slice(nextStart, nextEnd)
  }
}

/** Map a range found in rendered markdown back onto the stored article source. */
export function projectRenderedRangeToSource(
  source: string,
  rendered: string,
  range: { start: number; end: number; text: string }
): { start: number; end: number; text: string } | null {
  if (source === rendered) {
    return expandSelectionToMarkdownMarkers(source, range.start, range.end)
  }

  const located = locateTextInMarkdown(source, range.text, range.start)
  if (located) {
    return expandSelectionToMarkdownMarkers(source, located.start, located.end)
  }

  const exact = pickClosestOccurrence(source, range.text, range.start)
  if (exact) {
    return expandSelectionToMarkdownMarkers(source, exact.start, exact.end)
  }

  if (range.end <= source.length) {
    return expandSelectionToMarkdownMarkers(source, range.start, range.end)
  }

  return null
}
