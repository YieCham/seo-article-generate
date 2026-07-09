import {
  locateTextInMarkdown,
  markdownSliceMatchesSelection
} from './markdownSelection'

function findMappedElements(node: Node | null, root: HTMLElement): HTMLElement[] {
  const results: HTMLElement[] = []
  let current: Node | null = node
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.dataset.mdStart != null) {
      results.push(current)
    }
    current = current.parentNode
  }
  return results
}

function pickBestMappedElement(candidates: HTMLElement[]): HTMLElement | null {
  if (candidates.length === 0) return null

  const textSpan = candidates.find((element) => element.classList.contains('md-source-span'))
  if (textSpan) return textSpan

  const inlineCode = candidates.find((element) => element.tagName === 'CODE')
  if (inlineCode) return inlineCode

  return candidates.reduce((best, element) => {
    const bestLen = Number(best.dataset.mdEnd) - Number(best.dataset.mdStart)
    const len = Number(element.dataset.mdEnd) - Number(element.dataset.mdStart)
    if (!Number.isFinite(len) || len <= 0) return best
    if (!Number.isFinite(bestLen) || bestLen <= 0) return element
    return len < bestLen ? element : best
  })
}

function findMappedElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  return pickBestMappedElement(findMappedElements(node, root))
}

function getEndTextNode(element: Element): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  let current = walker.nextNode()
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }
  return last
}

/** Normalize Range boundary to a concrete text node + offset (handles Element containers). */
function resolveTextBoundary(node: Node, offset: number): { node: Text; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text
    return { node: text, offset: Math.max(0, Math.min(offset, text.length)) }
  }

  if (!(node instanceof Element)) return null

  if (node.childNodes.length === 0) return null

  if (offset >= node.childNodes.length) {
    const last = getEndTextNode(node)
    return last ? { node: last, offset: last.length } : null
  }

  const child = node.childNodes[offset]
  if (!child) return null

  if (child.nodeType === Node.TEXT_NODE) {
    return { node: child as Text, offset: 0 }
  }

  if (child instanceof Element) {
    const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT)
    const first = walker.nextNode() as Text | null
    if (first) return { node: first, offset: 0 }
  }

  return null
}

function charOffsetWithinElement(element: HTMLElement, targetNode: Node, offsetInNode: number): number | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let textNode = walker.nextNode()

  while (textNode) {
    if (textNode === targetNode) {
      return charCount + offsetInNode
    }
    charCount += textNode.textContent?.length ?? 0
    textNode = walker.nextNode()
  }

  return null
}

export function getMarkdownOffsetFromDomPoint(
  root: HTMLElement,
  node: Node,
  offsetInNode: number
): number | null {
  const resolved = resolveTextBoundary(node, offsetInNode)
  if (!resolved) return null

  const mapped = findMappedElement(resolved.node, root)
  if (!mapped) return null

  const mdStart = Number(mapped.dataset.mdStart)
  const mdEnd = Number(mapped.dataset.mdEnd)
  if (!Number.isFinite(mdStart) || !Number.isFinite(mdEnd) || mdEnd <= mdStart) {
    return null
  }

  const charIndex = charOffsetWithinElement(mapped, resolved.node, resolved.offset)
  if (charIndex == null) return null

  const renderedLength = mapped.textContent?.length ?? 0
  const sourceLength = mdEnd - mdStart

  if (renderedLength <= 0) return mdStart

  if (renderedLength === sourceLength) {
    return Math.min(mdEnd, mdStart + charIndex)
  }

  const ratio = charIndex / renderedLength
  return Math.min(mdEnd, mdStart + Math.round(ratio * sourceLength))
}

function getBoundaryPoint(root: HTMLElement, edge: 'start' | 'end'): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  if (edge === 'start') {
    const first = walker.nextNode()
    return first ? { node: first, offset: 0 } : null
  }

  let last: Text | null = null
  let current = walker.nextNode()
  while (current) {
    last = current as Text
    current = walker.nextNode()
  }

  return last ? { node: last, offset: last.length } : null
}

function rangeIntersectsRoot(range: Range, root: HTMLElement): boolean {
  if (typeof range.intersectsNode === 'function') {
    return range.intersectsNode(root)
  }

  const rootRange = root.ownerDocument.createRange()
  rootRange.selectNodeContents(root)
  return (
    range.compareBoundaryPoints(Range.END_TO_START, rootRange) >= 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, rootRange) <= 0
  )
}

function clipRangeToRoot(range: Range, root: HTMLElement): Range | null {
  const clipped = range.cloneRange()

  if (!root.contains(clipped.startContainer)) {
    const start = getBoundaryPoint(root, 'start')
    if (!start) return null
    clipped.setStart(start.node, start.offset)
  }

  if (!root.contains(clipped.endContainer)) {
    const end = getBoundaryPoint(root, 'end')
    if (!end) return null
    clipped.setEnd(end.node, end.offset)
  }

  if (clipped.collapsed) return null
  return clipped
}

function rangeToMarkdownSelection(
  root: HTMLElement,
  markdown: string,
  range: Range,
  selectedText: string
): { start: number; end: number; text: string } | null {
  const startGuess = getMarkdownOffsetFromDomPoint(root, range.startContainer, range.startOffset)
  const endGuess = getMarkdownOffsetFromDomPoint(root, range.endContainer, range.endOffset)
  const anchor = startGuess ?? endGuess ?? Math.floor(markdown.length / 2)

  const located = locateTextInMarkdown(markdown, selectedText, anchor)
  if (located) {
    return {
      start: located.start,
      end: located.end,
      text: markdown.slice(located.start, located.end)
    }
  }

  if (startGuess == null || endGuess == null || startGuess === endGuess) return null

  const selectionStart = Math.min(startGuess, endGuess)
  const selectionEnd = Math.max(startGuess, endGuess)
  const slice = markdown.slice(selectionStart, selectionEnd)
  if (!slice.trim()) return null

  if (markdownSliceMatchesSelection(slice, selectedText)) {
    return { start: selectionStart, end: selectionEnd, text: slice }
  }

  return null
}

export function getMarkdownRangeFromDomSelection(
  root: HTMLElement,
  markdown: string
): { start: number; end: number; text: string; displayText: string } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const selectedText = selection.toString()
  if (!selectedText.trim()) return null

  const range = selection.getRangeAt(0)
  if (!rangeIntersectsRoot(range, root)) return null

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode

  let mapped: { start: number; end: number; text: string } | null = null

  if (anchorNode && focusNode && root.contains(anchorNode) && root.contains(focusNode)) {
    mapped = rangeToMarkdownSelection(root, markdown, range, selectedText)
  }

  if (!mapped) {
    const clipped = clipRangeToRoot(range, root)
    if (clipped) {
      mapped = rangeToMarkdownSelection(root, markdown, clipped, selectedText)
    }
  }

  if (!mapped) {
    const startGuess = getMarkdownOffsetFromDomPoint(root, range.startContainer, range.startOffset)
    const located = locateTextInMarkdown(markdown, selectedText, startGuess ?? Math.floor(markdown.length / 2))
    if (located) {
      mapped = {
        start: located.start,
        end: located.end,
        text: markdown.slice(located.start, located.end)
      }
    }
  }

  if (!mapped) return null

  return {
    ...mapped,
    displayText: selectedText.trim()
  }
}

export function getMarkdownOffsetFromClick(
  root: HTMLElement,
  clientX: number,
  clientY: number
): number | null {
  const doc = root.ownerDocument
  let range: Range | null = null

  if (typeof doc.caretRangeFromPoint === 'function') {
    range = doc.caretRangeFromPoint(clientX, clientY)
  } else {
    const caretPositionFromPoint = (
      doc as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      }
    ).caretPositionFromPoint

    const position = caretPositionFromPoint?.call(doc, clientX, clientY)
    if (position) {
      range = doc.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }

  if (!range) return null
  return getMarkdownOffsetFromDomPoint(root, range.startContainer, range.startOffset)
}
