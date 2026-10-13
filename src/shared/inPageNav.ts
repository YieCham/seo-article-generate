/**
 * In-page nav as a Markdown list, inserted immediately before the first Part 1 heading.
 * Quick Answer / Key Takeaways stay in the article but are omitted from the list.
 * Heading ids are assigned in document order so later HTML conversion can reuse them.
 */

const NAV_LABEL_EN = 'On this page'
const NAV_LABEL_ZH = '本页导航'

export function plainHeadingText(title: string): string {
  return title
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
    .replace(/\s+#+\s*$/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isSeoMetaHeading(title: string): boolean {
  return /^seo meta$/i.test(plainHeadingText(title))
}

export function isQuickAnswerHeading(title: string): boolean {
  return /quick answer|key takeaways/i.test(plainHeadingText(title))
}

export function isPartOneHeading(title: string): boolean {
  const plain = plainHeadingText(title)
  return /^part\s*1\b/i.test(plain) || /^第\s*1\s*部分/.test(plain) || /^第一部分/.test(plain)
}

export function headingSlug(title: string): string {
  const slug = plainHeadingText(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'section'
}

/** Assign a unique fragment id. Mutates `used` so callers share one document-order sequence. */
export function headingAnchorId(title: string, used: Set<string>): string {
  const base = headingSlug(title)
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}-${n}`
    n += 1
  }
  used.add(id)
  return id
}

interface HeadingLine {
  index: number
  title: string
  id: string
}

function fenceMask(lines: string[]): boolean[] {
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

function headingLines(lines: string[], inFence: boolean[]): HeadingLine[] {
  const used = new Set<string>()
  const headings: HeadingLine[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index]) continue
    const match = lines[index].match(/^(##)(?!#)\s+(.+)$/)
    if (!match || isSeoMetaHeading(match[2])) continue
    headings.push({
      index,
      title: plainHeadingText(match[2]),
      id: headingAnchorId(match[2], used)
    })
  }
  return headings
}

function isNavLabel(line: string): boolean {
  return /^\*\*(on this page|本页导航)\*\*$/i.test(line.trim())
}

function isNavItem(line: string): boolean {
  return /^- \[[^\]]+\]\(#[a-z0-9\u4e00-\u9fff-]+\)$/i.test(line.trim())
}

/** Source-page TOC rows such as `- [**Part 2. …**](url#part-2)` or `- [#1. …](#…)`. */
function isPartTocLink(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('- [')) return false

  let index = 3
  let label = ''
  while (index < trimmed.length) {
    if (trimmed[index] === '\\' && index + 1 < trimmed.length) {
      label += trimmed[index + 1]
      index += 2
      continue
    }
    if (trimmed[index] === ']') break
    label += trimmed[index]
    index += 1
  }
  if (trimmed[index] !== ']' || trimmed[index + 1] !== '(') return false
  const hrefEnd = trimmed.lastIndexOf(')')
  if (hrefEnd <= index + 1 || trimmed.slice(hrefEnd + 1).trim() !== '') return false
  const href = trimmed.slice(index + 2, hrefEnd)
  if (!href.includes('#')) return false
  return /^(?:part\s+\d+|#\s*\d+)\b/i.test(plainHeadingText(label))
}

function findPartOneIndex(lines: string[], inFence: boolean[]): number {
  return lines.findIndex(
    (line, index) =>
      !inFence[index] && /^(##)(?!#)\s+/.test(line) && isPartOneHeading(line.replace(/^##\s+/, ''))
  )
}

/** Drop leftover source TOCs: 3+ rows of `- [Part N…](…)` / `- [#N…](…)`. */
function stripPartTocBlocks(lines: string[], inFence: boolean[]): string[] {
  const drop = new Set<number>()
  let index = 0
  while (index < lines.length) {
    if (inFence[index] || !isPartTocLink(lines[index])) {
      index += 1
      continue
    }
    const start = index
    while (index < lines.length && !inFence[index] && isPartTocLink(lines[index])) index += 1
    if (index - start >= 3) {
      for (let cursor = start; cursor < index; cursor += 1) drop.add(cursor)
      let after = index
      while (after < lines.length && lines[after].trim() === '') after += 1
      if (after < lines.length && /^\s*(?:\*(?:\s*\*){2,}|-{3,}|_{3,})\s*$/.test(lines[after])) {
        drop.add(after)
      }
    }
  }
  if (drop.size === 0) return lines
  return lines.filter((_, lineIndex) => !drop.has(lineIndex))
}

function stripNavBeforePartOne(lines: string[], inFence: boolean[]): string[] {
  const partIndex = findPartOneIndex(lines, inFence)
  if (partIndex < 0) return lines

  let cursor = partIndex
  while (cursor > 0 && lines[cursor - 1].trim() === '') cursor -= 1
  const listEnd = cursor
  while (cursor > 0 && isNavItem(lines[cursor - 1])) cursor -= 1
  if (cursor === listEnd) return lines
  if (cursor > 0 && lines[cursor - 1].trim() === '') cursor -= 1
  if (cursor === 0 || !isNavLabel(lines[cursor - 1])) return lines
  cursor -= 1
  if (cursor > 0 && lines[cursor - 1].trim() === '') cursor -= 1
  return [...lines.slice(0, cursor), ...lines.slice(partIndex)]
}

function navLabel(titles: string[]): string {
  const cjk = titles.filter((title) => /[\u4e00-\u9fff]/.test(title)).length
  return cjk > 0 && cjk * 2 >= titles.length ? NAV_LABEL_ZH : NAV_LABEL_EN
}

function linkLabel(title: string): string {
  return title.replace(/[\[\]]/g, '').trim()
}

function isNonPartLabel(title: string): boolean {
  const plain = plainHeadingText(title)
  return /^(?:introduction|intro|conclusion|in conclusion|final thoughts|wrapping up|faq|faqs|frequently asked|quick answer|key takeaways)\b/i.test(
    plain
  )
}

/**
 * Rewrite `## Part N` headings in document order.
 * FAQ / Introduction / Conclusion lose a mistaken Part prefix.
 * A single Part heading is left unchanged so section fragments stay intact.
 */
export function renumberPartHeadings(markdown: string): string {
  const lines = markdown.split('\n')
  const inFence = fenceMask(lines)
  const targets: number[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (inFence[index]) continue
    const match = lines[index].match(/^##\s+(.+)$/)
    if (!match) continue
    if (/^part\s+\d+\b/i.test(plainHeadingText(match[1]))) targets.push(index)
  }

  if (targets.length < 2) return markdown

  let next = 0
  for (const index of targets) {
    const match = lines[index].match(/^(##\s+)(.+)$/)
    if (!match) continue
    const parsed = match[2].match(/^Part\s+\d+\s*([.:：])\s+([\s\S]+)$/i)
    if (!parsed) continue
    const rest = parsed[2].trim()
    if (isNonPartLabel(rest)) {
      lines[index] = `${match[1]}${rest}`
      continue
    }
    next += 1
    lines[index] = `${match[1]}Part ${next}${parsed[1]} ${rest}`
  }

  return lines.join('\n')
}

/**
 * Insert or refresh the Markdown nav immediately before the first Part 1 heading.
 * Articles without a Part 1 heading are returned unchanged.
 */
export function insertInPageNav(
  markdown: string,
  options?: { stripForeignToc?: boolean }
): string {
  const source = markdown.replace(/\r\n/g, '\n')
  if (!source.trim()) return markdown

  const originalLines = source.split('\n')
  const withoutNav = stripNavBeforePartOne(originalLines, fenceMask(originalLines))
  const stripped = options?.stripForeignToc
    ? stripPartTocBlocks(withoutNav, fenceMask(withoutNav))
    : withoutNav
  const inFence = fenceMask(stripped)
  const headings = headingLines(stripped, inFence)
  const part = headings.find((heading) => isPartOneHeading(heading.title))
  if (!part) return stripped.join('\n')

  const items = headings.filter((heading) => !isQuickAnswerHeading(heading.title) && linkLabel(heading.title))
  if (items.length === 0) return stripped.join('\n')

  const block = [
    `**${navLabel(items.map((item) => item.title))}**`,
    '',
    ...items.map((item) => `- [${linkLabel(item.title)}](#${item.id})`),
    ''
  ].join('\n')

  const before = stripped.slice(0, part.index).join('\n').replace(/^\s+|\s+$/g, '')
  const after = stripped.slice(part.index).join('\n').replace(/^\s*/, '')
  return `${before ? `${before}\n\n` : ''}${block}\n${after}`
}
