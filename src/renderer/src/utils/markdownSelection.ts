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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

  const searchRadius = Math.max(800, trimmed.length * 6)
  const windowStart = Math.max(0, anchor - searchRadius)
  const windowEnd = Math.min(markdown.length, anchor + searchRadius + trimmed.length)
  const window = markdown.slice(windowStart, windowEnd)

  const head = tokens.slice(0, Math.min(6, tokens.length)).map(escapeRegExp).join('\\s+')
  const tail = tokens.slice(-Math.min(4, tokens.length)).map(escapeRegExp).join('\\s+')
  const pattern = new RegExp(`${head}[\\s\\S]{0,${Math.max(trimmed.length * 2, 200)}}?${tail}`, 'i')
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

  const normalizedSlice = collapseWhitespace(stripInlineMarkdown(markdownSlice))
  const normalizedSelection = collapseWhitespace(selectedText)
  if (!normalizedSelection) return false
  if (normalizedSlice === normalizedSelection) return true

  const sliceLen = normalizedSlice.length
  const selectionLen = normalizedSelection.length
  if (sliceLen === 0 || selectionLen === 0) return false

  // Reject partial slices (e.g. "B" matching inside a long selection).
  const ratio = sliceLen / selectionLen
  if (ratio < 0.85 || ratio > 1.4) return false

  if (normalizedSlice.includes(normalizedSelection) || normalizedSelection.includes(normalizedSlice)) {
    return true
  }

  return false
}
