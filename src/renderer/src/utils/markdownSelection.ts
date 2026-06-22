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
  return value.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
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
  const windowEnd = Math.min(markdown.length, anchor + searchRadius)
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

  if (normalizedNeedle.length < 2) return null

  const normalizedWindow = collapseWhitespace(window)
  const relative = normalizedWindow.indexOf(normalizedNeedle)
  if (relative >= 0 && normalizedNeedle.length >= 2) {
    const roughStart = windowStart + Math.max(0, window.indexOf(normalizedNeedle.slice(0, Math.min(12, normalizedNeedle.length))))
    const roughEnd = Math.min(markdown.length, roughStart + selectedText.length)
    if (roughStart >= 0 && roughEnd > roughStart) {
      return { start: roughStart, end: roughEnd }
    }
  }

  if (normalizedNeedle.length < 8) return null

  const chunkSize = Math.min(normalizedNeedle.length + 80, 600)
  for (let start = 0; start < markdown.length; start += 1) {
    const slice = markdown.slice(start, start + chunkSize)
    if (collapseWhitespace(slice).includes(normalizedNeedle)) {
      const relativeNeedle = slice.indexOf(normalizedNeedle.slice(0, Math.min(24, normalizedNeedle.length)))
      if (relativeNeedle >= 0) {
        const hitStart = start + relativeNeedle
        return {
          start: hitStart,
          end: Math.min(markdown.length, hitStart + selectedText.length)
        }
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
  if (normalizedSlice.includes(normalizedSelection)) return true
  if (normalizedSelection.includes(normalizedSlice) && normalizedSlice.length >= normalizedSelection.length - 2) {
    return true
  }

  return false
}
