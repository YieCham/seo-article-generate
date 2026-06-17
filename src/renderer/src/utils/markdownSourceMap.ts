import { locateTextInMarkdown } from './markdownSelection'

function findMappedElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.dataset.mdStart != null) {
      return current
    }
    current = current.parentNode
  }
  return null
}

function charOffsetWithinElement(element: HTMLElement, targetNode: Node, offsetInNode: number): number {
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

  return charCount
}

export function getMarkdownOffsetFromDomPoint(
  root: HTMLElement,
  node: Node,
  offsetInNode: number
): number | null {
  const mapped = findMappedElement(node, root)
  if (!mapped) return null

  const mdStart = Number(mapped.dataset.mdStart)
  const mdEnd = Number(mapped.dataset.mdEnd)
  if (!Number.isFinite(mdStart) || !Number.isFinite(mdEnd) || mdEnd <= mdStart) {
    return null
  }

  const charIndex = charOffsetWithinElement(mapped, node, offsetInNode)
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
  range: Range
): { start: number; end: number; text: string } | null {
  const start = getMarkdownOffsetFromDomPoint(root, range.startContainer, range.startOffset)
  const end = getMarkdownOffsetFromDomPoint(root, range.endContainer, range.endOffset)
  if (start == null || end == null || start === end) return null

  const selectionStart = Math.min(start, end)
  const selectionEnd = Math.max(start, end)
  const text = markdown.slice(selectionStart, selectionEnd)
  if (!text.trim()) return null

  return { start: selectionStart, end: selectionEnd, text }
}

export function getMarkdownRangeFromDomSelection(
  root: HTMLElement,
  markdown: string
): { start: number; end: number; text: string } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  if (!anchorNode || !focusNode) return null

  const range = selection.getRangeAt(0)
  if (!rangeIntersectsRoot(range, root)) return null

  const selectedText = selection.toString()
  if (!selectedText.trim()) return null

  if (root.contains(anchorNode) && root.contains(focusNode)) {
    const mapped = rangeToMarkdownSelection(root, markdown, range)
    if (mapped) return mapped
  }

  const clipped = clipRangeToRoot(range, root)
  if (clipped) {
    const mapped = rangeToMarkdownSelection(root, markdown, clipped)
    if (mapped) return mapped
  }

  const located = locateTextInMarkdown(markdown, selectedText)
  if (!located) return null

  return {
    start: located.start,
    end: located.end,
    text: markdown.slice(located.start, located.end)
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
