import { reorderFaqBeforeConclusion } from './articleModules'
import { insertInPageNav, renumberPartHeadings } from './inPageNav'

/** Remove a single outer ```markdown / ``` fence when the model wraps the whole article. */
export function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)\n```\s*$/i)
  return match ? match[1].trim() : trimmed
}

/**
 * Strip a leading ## (or #) heading that duplicates the section title.
 * Section drafts are assembled as `## ${title}\n\n${body}`, so model-emitted H2s cause doubles.
 */
export function stripLeadingSectionHeading(body: string, sectionTitle: string): string {
  const trimmed = body.trim()
  if (!trimmed || !sectionTitle.trim()) return trimmed

  const normalize = (value: string): string =>
    sanitizeHeadingTitle(value)
      .toLowerCase()
      .replace(/[`*_]+/g, '')
      .replace(/[.。:：]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const expected = normalize(sectionTitle)
  const lines = trimmed.split('\n')
  let index = 0

  while (index < lines.length && !lines[index].trim()) index += 1
  if (index >= lines.length) return trimmed

  const first = lines[index].trim()
  if (!/^#{1,3}\s+/.test(first)) return trimmed
  if (normalize(first) !== expected) return trimmed

  index += 1
  while (index < lines.length && !lines[index].trim()) index += 1
  return lines.slice(index).join('\n').trim()
}

/** Drop a leaked in-page link tail: `Title](#slug)` or `[## Title](#slug)`. */
function stripAnchorLeak(title: string): string {
  return title
    .trim()
    .replace(/^\[([\s\S]+)\]\(#[^)]*\)\s*$/, '$1')
    .replace(/\]\(#[^)]*\)\s*$/, '')
    .trim()
}

interface DelimiterRun {
  index: number
  canOpen: boolean
  canClose: boolean
}

function markerRuns(text: string, marker: '*' | '_' | '`', length: number): DelimiterRun[] {
  const runs: DelimiterRun[] = []
  const token = marker.repeat(length)
  for (let index = 0; index <= text.length - length; ) {
    const ownRun =
      text.startsWith(token, index) &&
      text[index + length] !== marker &&
      (index === 0 || text[index - 1] !== marker)
    if (!ownRun) {
      index += 1
      continue
    }
    const before = index === 0 ? undefined : text[index - 1]
    const after = text[index + length]
    const beforeSpace = before === undefined || /\s/.test(before)
    const afterSpace = after === undefined || /\s/.test(after)
    let canOpen = !afterSpace
    let canClose = !beforeSpace
    if (marker === '_') {
      const insideWord =
        before !== undefined && /\w/.test(before) && after !== undefined && /\w/.test(after)
      if (insideWord) {
        canOpen = false
        canClose = false
      }
    }
    runs.push({ index, canOpen, canClose })
    index += length
  }
  return runs
}

function matchRuns(runs: DelimiterRun[]): { pairs: Array<{ open: number; close: number }>; unmatched: DelimiterRun[] } {
  const pairs: Array<{ open: number; close: number }> = []
  const stack: DelimiterRun[] = []
  const closed = new Set<number>()
  for (const run of runs) {
    if (run.canClose && stack.length > 0) {
      const open = stack.pop()
      if (!open) continue
      pairs.push({ open: open.index, close: run.index })
      closed.add(open.index)
      closed.add(run.index)
      continue
    }
    if (run.canOpen) stack.push(run)
  }
  const unmatched = [
    ...stack,
    ...runs.filter((run) => !closed.has(run.index) && !stack.includes(run))
  ]
  return { pairs, unmatched }
}

/**
 * Heading titles keep valid inline markdown.
 * A delimiter pair that wraps the entire title is removed, because the heading
 * style already provides emphasis. One unmatched closer gets its opener back.
 * One stray backtick is removed. Balanced spans such as `**Q** 4.` stay.
 */
function balanceHeadingDelimiters(title: string): string {
  let text = title
  for (let pass = 0; pass < 4; pass += 1) {
    const next = balanceMarker(balanceBackticks(text), '*', 2)
    const underscored = balanceMarker(next, '_', 2)
    if (underscored === text) return text
    text = underscored
  }
  return text
}

function balanceMarker(text: string, marker: '*' | '_', length: number): string {
  const token = marker.repeat(length)
  const { pairs, unmatched } = matchRuns(markerRuns(text, marker, length))
  const wrapped = pairs.find((pair) => pair.open === 0 && pair.close + length === text.length)
  if (wrapped) return text.slice(length, text.length - length).trim()

  if (pairs.length === 0 && unmatched.length === 1) {
    const run = unmatched[0]
    if (run.canClose && !run.canOpen && run.index > 0) return `${token}${text}`
    if (run.canOpen && !run.canClose && run.index === 0) return `${text}${token}`
  }
  return text
}

function balanceBackticks(text: string): string {
  const indexes: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '`') indexes.push(index)
  }
  if (indexes.length === 0) return text
  if (indexes.length % 2 === 0) {
    const open = indexes[0]
    const close = indexes[indexes.length - 1]
    if (indexes.length === 2 && open === 0 && close === text.length - 1) {
      return text.slice(1, -1).trim()
    }
    return text
  }
  const stray = indexes[indexes.length - 1]
  return `${text.slice(0, stray)}${text.slice(stray + 1)}`
}

/**
 * Drop diagnosis placement notes so they never become part of the heading text.
 * Covers `insert before [Part 1]`, `(insert before …)`, and `[insert after "Part 2"]`.
 * A real title such as "How to Insert After the Chorus" is left intact.
 */
export function stripHeadingPlacement(raw: string): string {
  const bracketed = raw
    .replace(/\s*[|｜]\s*insert\s+(?:before|after|between)\b[\s\S]*$/i, '')
    .replace(/\s*[\[【［]\s*insert\s+(?:before|after|between)\b[^\]】］]*[\]】］]/gi, '')
    .replace(/\s*[\[【［]\s*insert\s+(?:before|after|between)\b[\s\S]*$/i, '')
    .replace(/\s*[（(]\s*insert\s+(?:before|after|between)\b[^）)]*[）)]/gi, '')

  const trailing = bracketed.match(/\s+insert\s+(?:before|after|between)\b([\s\S]*)$/i)
  if (!trailing || trailing.index == null) return bracketed.replace(/\s+/g, ' ').trim()

  const before = bracketed.slice(0, trailing.index).trim()
  const after = trailing[1].trim()
  const beforeWords = before.split(/\s+/).filter(Boolean).length
  const targetLike = /^[\[【［「"'“]|^(?:part\b|第)/i.test(after)
  const stripped = targetLike || beforeWords >= 4 ? before : bracketed
  return stripped.replace(/\s+/g, ' ').trim()
}

/** Peel structural junk off a heading. Inline markdown is balanced, not stripped. */
export function sanitizeHeadingTitle(raw: string): string {
  let t = stripHeadingPlacement(raw)
  for (let i = 0; i < 6; i += 1) {
    let next = stripHeadingPlacement(stripAnchorLeak(t))
    next = next.replace(/^(?:[-*+]|\d{1,2}[.)])\s+/, '').trim()
    next = balanceHeadingDelimiters(next)
    next = next.replace(/^#{1,6}\s+/, '').trim()
    next = next.replace(/\s+/g, ' ').trim()
    if (!next || next === t) return next || t
    t = next
  }
  return t
}

function cleanHeadingTitle(title: string): string {
  return sanitizeHeadingTitle(title)
}

function looksLikeCodeToken(inner: string): boolean {
  const text = inner.trim()
  if (!text || text.length > 120) return true
  if (!/\s/.test(text)) return true
  if (/[=\\]/.test(text)) return true
  const words = text.split(/\s+/).filter(Boolean)
  const allLower = words.every((word) => word === word.toLowerCase())
  if (allLower && words.length <= 4 && !text.includes(':')) return true
  return false
}

/**
 * A line that is only a heading, optionally wrapped as a list item or inline code:
 * `- ## Title`, `` - `## Title` ``, `` `## Title` ``,
 * or a list item whose only content is a backtick-wrapped title.
 */
function promoteWrappedHeadingLine(line: string): string | null {
  const linked = line.match(
    /^[ \t]{0,3}(?:[-*+]|\d{1,2}[.)])?[ \t]*\[(#{1,6})\s+([\s\S]+?)\]\(#[^)]*\)\s*$/
  )
  if (linked) {
    const title = cleanHeadingTitle(linked[2])
    if (!title || /[`#]/.test(title)) return null
    return `${linked[1]} ${title}`
  }

  const match = line.match(
    /^[ \t]{0,3}(?:[-*+]|\d{1,2}[.)])?[ \t]*(?:[*_]{1,3}|`+)?(#{1,6})[ \t]+(.+?)[ \t]*(?:[*_]{1,3}|`+)?[ \t]*$/
  )
  if (match) {
    const title = cleanHeadingTitle(match[2])
    if (!title || /[`#]/.test(title)) return null
    return `${match[1]} ${title}`
  }

  const codeTitle = line.match(/^[ \t]{0,3}(?:[-*+]|\d{1,2}[.)])[ \t]+`([^`\n]+)`[ \t]*$/)
  if (!codeTitle) return null
  const inner = codeTitle[1].trim()
  if (looksLikeCodeToken(inner)) return null
  const hashed = inner.match(/^(#{1,6})\s+(.+)$/)
  if (hashed) {
    const title = cleanHeadingTitle(hashed[2])
    if (!title || looksLikeCodeToken(title)) return null
    return `${hashed[1]} ${title}`
  }
  const title = cleanHeadingTitle(inner)
  if (!title || looksLikeCodeToken(title)) return null
  return `## ${title}`
}

/** Leftover from a link that was split in front of a heading, e.g. `- [` or `- [- ``. */
function isBrokenLinkStub(line: string): boolean {
  return /^[ \t]*(?:[-*+][ \t]*)?\[-?[ \t]*`*[ \t]*$/.test(line)
}

/**
 * Repair common LLM ATX breakages so `##` renders as real headings:
 * - `**## Title**` / `__## Title__` / `` `## Title` ``
 * - `- ## Title` / `` - `## Title` `` / `` - `Title` `` (list item or inline code)
 * - `## **Title**`
 * - mid-paragraph `…text. ## Title` (force onto its own line)
 * - fullwidth `＃` hashes
 */
export function repairBrokenAtxHeadings(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let inFence = false

  for (const rawLine of lines) {
    const fenceOpen = rawLine.match(/^\s*(`{3,}|~{3,})/)
    if (fenceOpen) {
      inFence = !inFence
      out.push(rawLine)
      continue
    }
    if (inFence) {
      out.push(rawLine)
      continue
    }

    let line = rawLine.replace(/＃/g, '#')

    if (isBrokenLinkStub(line)) continue

    const promoted = promoteWrappedHeadingLine(line)
    if (promoted) {
      out.push(promoted)
      continue
    }

    // Whole-line emphasis wrapping the ATX marker: **## Title**
    const wrappedAtx = line.match(
      /^(\s{0,3})(?:\*{1,3}|_{1,3}|`+)(#{1,6}\s+)(.+?)(?:\*{1,3}|_{1,3}|`+)\s*$/
    )
    if (wrappedAtx) {
      const cleaned = cleanHeadingTitle(wrappedAtx[3])
      if (cleaned) out.push(`${wrappedAtx[1]}${wrappedAtx[2]}${cleaned}`)
      continue
    }

    // Valid ATX with emphasized title or a leaked anchor: ## **Title** / ## Title](#slug)
    const atxEmphTitle = line.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
    if (atxEmphTitle) {
      const cleaned = cleanHeadingTitle(atxEmphTitle[2])
      if (cleaned) out.push(`${atxEmphTitle[1]}${cleaned}`)
      continue
    }

    // Mid-line ATX (not already at line start): split before hashes.
    // Leave hashes inside a markdown link alone so an old nav row is not torn apart.
    const masked = line
      .replace(/\[[^\]]*\]\([^)]*\)/g, (token) => token.replace(/#/g, '\u0000'))
      .replace(/\]\(#[^)]*\)/g, (token) => token.replace(/#/g, '\u0000'))
    if (/#{1,6}\s+\S/.test(masked) && !/^\s{0,3}#{1,6}\s/.test(masked)) {
      const split = masked.replace(
        /([^\s#\[])[ \t]*(#{1,6}[ \t]+)(?=[\w\u4e00-\u9fff])/g,
        '$1\n\n$2'
      )
      if (split !== masked) {
        for (const part of split.replace(/\u0000/g, '#').split('\n')) {
          if (isBrokenLinkStub(part)) continue
          const partAtx = part.match(/^(\s{0,3}#{1,6}\s+)(.+)$/)
          if (partAtx) {
            const cleaned = cleanHeadingTitle(partAtx[2])
            if (cleaned) out.push(`${partAtx[1]}${cleaned}`)
          } else if (part.trim()) {
            out.push(part)
          }
        }
        continue
      }
    }

    out.push(line)
  }

  return out.join('\n')
}

/**
 * Normalize assistant article markdown for display/storage.
 * Handles SEO Meta prefix + fenced body (common in optimize polish output),
 * and repairs broken ATX headings from polish/length rewrites.
 */
export function normalizeArticleMarkdown(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return content

  const withSeoMeta = trimmed.match(
    /^(## SEO Meta[\s\S]*?\n---\n+)```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i
  )
  if (withSeoMeta) {
    return repairBrokenAtxHeadings(`${withSeoMeta[1]}${withSeoMeta[2].trim()}`)
  }

  return repairBrokenAtxHeadings(stripOuterCodeFence(trimmed))
}

const HEADING_STOPWORDS = new Set([
  'how', 'to', 'and', 'the', 'a', 'an', 'of', 'for', 'with', 'on', 'in', 'your',
  'without', 'best', 'way', 'via', 'by', 'or', 'from', 'into', 'you', 'can'
])

function headingFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = []
  let open = false
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      mask.push(true)
      open = !open
      continue
    }
    mask.push(open)
  }
  return mask
}

interface MarkdownHeading {
  line: number
  level: number
  title: string
  key: string
}

function headingKey(title: string): string {
  return sanitizeHeadingTitle(title).toLowerCase()
}

function collectHeadings(lines: string[], inFence: boolean[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  for (let line = 0; line < lines.length; line += 1) {
    if (inFence[line]) continue
    const match = lines[line].match(/^(#{2,6})\s+(.+)$/)
    if (!match) continue
    const title = sanitizeHeadingTitle(match[2])
    if (!title) continue
    headings.push({ line, level: match[1].length, title, key: headingKey(title) })
  }
  return headings
}

function headingBlockEnd(headings: MarkdownHeading[], index: number, lineCount: number): number {
  const level = headings[index].level
  for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
    if (headings[cursor].level <= level) return headings[cursor].line
  }
  return lineCount
}

function countBlockWords(lines: string[], start: number, end: number): number {
  return lines
    .slice(start, end)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
}

function contentPhrases(title: string): string[] {
  const words = sanitizeHeadingTitle(title)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const phrases: string[] = []
  for (let index = 0; index <= words.length - 4; index += 1) {
    const slice = words.slice(index, index + 4)
    const content = slice.filter((word) => !HEADING_STOPWORDS.has(word))
    if (content.length >= 3) phrases.push(slice.join(' '))
  }
  return phrases
}

function markLineRange(drop: Set<number>, start: number, end: number): void {
  for (let line = start; line < end; line += 1) drop.add(line)
}

/**
 * One heading per title. A second H2 with the same title is dropped (the longer
 * body stays). An H3 that repeats an H2 title is dropped. Two step-tutorials
 * whose titles share a distinctive phrase keep the copy that has the illustrations.
 */
export function collapseDuplicateHeadings(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const inFence = headingFenceMask(lines)
  const headings = collectHeadings(lines, inFence)
  if (headings.length < 2) return markdown
  for (const heading of headings) {
    lines[heading.line] = `${'#'.repeat(heading.level)} ${heading.title}`
  }

  const drop = new Set<number>()
  const h2s = headings.filter((heading) => heading.level === 2 && heading.key !== 'seo meta')
  const byKey = new Map<string, MarkdownHeading[]>()
  for (const heading of h2s) {
    const group = byKey.get(heading.key) ?? []
    group.push(heading)
    byKey.set(heading.key, group)
  }

  for (const group of byKey.values()) {
    if (group.length < 2) continue
    const ranked = group
      .map((heading) => {
        const index = headings.indexOf(heading)
        const end = headingBlockEnd(headings, index, lines.length)
        return {
          heading,
          end,
          words: countBlockWords(lines, heading.line + 1, end)
        }
      })
      .sort((a, b) => b.words - a.words || a.heading.line - b.heading.line)
    for (const extra of ranked.slice(1)) markLineRange(drop, extra.heading.line, extra.end)
  }

  const keptH2Keys = new Set(h2s.filter((heading) => !drop.has(heading.line)).map((heading) => heading.key))
  for (const heading of headings) {
    if (heading.level < 3 || drop.has(heading.line) || !keptH2Keys.has(heading.key)) continue
    const index = headings.indexOf(heading)
    markLineRange(drop, heading.line, headingBlockEnd(headings, index, lines.length))
  }

  const tutorials = headings.filter((heading) => {
    if (heading.level < 3 || drop.has(heading.line)) return false
    const index = headings.indexOf(heading)
    const body = lines.slice(heading.line, headingBlockEnd(headings, index, lines.length)).join('\n')
    return (body.match(/\bstep\s*\d+\b/gi) ?? []).length >= 2
  })
  const clustered = new Set<number>()
  for (let index = 0; index < tutorials.length; index += 1) {
    if (clustered.has(index)) continue
    const phrases = contentPhrases(tutorials[index].title)
    const cluster = [index]
    for (let other = index + 1; other < tutorials.length; other += 1) {
      if (clustered.has(other)) continue
      const otherPhrases = contentPhrases(tutorials[other].title)
      if (phrases.some((phrase) => otherPhrases.includes(phrase))) cluster.push(other)
    }
    if (cluster.length < 2) continue
    for (const item of cluster) clustered.add(item)
    const ranked = cluster
      .map((item) => {
        const heading = tutorials[item]
        const headingIndex = headings.indexOf(heading)
        const end = headingBlockEnd(headings, headingIndex, lines.length)
        const text = lines.slice(heading.line, end).join('\n')
        return {
          heading,
          end,
          images: (text.match(/!\[/g) ?? []).length,
          words: countBlockWords(lines, heading.line + 1, end)
        }
      })
      .sort((a, b) => b.images - a.images || b.words - a.words || a.heading.line - b.heading.line)
    for (const extra of ranked.slice(1)) markLineRange(drop, extra.heading.line, extra.end)
  }

  const next = lines
    .filter((_, index) => !drop.has(index))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  return next === markdown.replace(/\r\n/g, '\n') ? markdown : next
}

/**
 * Repair heading syntax and refresh the in-page nav.
 * New articles also renumber Part headings. Optimization keeps the original heading text.
 * Either way, a source-page jump list is removed so only one nav remains.
 */
export function finalizeArticleMarkdown(
  content: string,
  options?: { preserveStructure?: boolean }
): string {
  const normalized = collapseDuplicateHeadings(normalizeArticleMarkdown(content))
  if (!normalized.trim()) return normalized
  const prepared = options?.preserveStructure ? normalized : renumberPartHeadings(normalized)
  return insertInPageNav(reorderFaqBeforeConclusion(prepared), { stripForeignToc: true })
}
