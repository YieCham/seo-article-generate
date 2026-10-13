import type { OptimizeSectionEditAction } from './optimizeStructure'

export const SECTION_AUDIT_EXCERPT_MAX = 1200
export const SECTION_COMPETITOR_EXCERPT_MAX = 900

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'your',
  'with',
  'from',
  'that',
  'this',
  'how',
  'what',
  'when',
  'why',
  'into',
  'onto',
  'about',
  'after',
  'before',
  'part',
  'section',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'or'
])

export interface SectionBriefingExcerpt {
  auditExcerpt: string
  competitorExcerpt: string
}

export function normalizeH2Key(title: string): string {
  return title
    .toLowerCase()
    .replace(/^part\s*\d+\.\s*/i, '')
    .replace(/\[(?:new h2|新增\s*h2)[^\]]*\]/gi, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function distinctiveTokens(title: string): string[] {
  return normalizeH2Key(title)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
}

function headingMatchesTitle(heading: string, title: string): boolean {
  const headingKey = normalizeH2Key(heading.replace(/^h2[:：]\s*/i, ''))
  const titleKey = normalizeH2Key(title)
  if (!headingKey || !titleKey) return false
  if (headingKey === titleKey) return true
  if (headingKey.includes(titleKey) || titleKey.includes(headingKey)) return true
  return scoreAgainstTitle(heading, title) >= 70
}

function scoreAgainstTitle(text: string, title: string): number {
  const hay = text.toLowerCase()
  const titleKey = normalizeH2Key(title)
  if (titleKey && hay.includes(titleKey)) return 100

  const tokens = distinctiveTokens(title)
  if (tokens.length === 0) {
    const raw = normalizeH2Key(title)
    return raw && hay.includes(raw) ? 80 : 0
  }

  const hits = tokens.filter((token) => hay.includes(token)).length
  const ratio = hits / tokens.length
  if (ratio >= 0.75 && hits >= 2) return 80
  if (ratio >= 0.5 && hits >= 2) return 55
  if (hits >= 1 && tokens.length === 1) return 50
  return Math.round(ratio * 40)
}

function bestTitleForLine(line: string, titles: string[]): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null
  let second = 0
  for (const title of titles) {
    const score = scoreAgainstTitle(line, title)
    if (!best || score > best.score) {
      second = best?.score ?? 0
      best = { title, score }
    } else if (score > second) {
      second = score
    }
  }
  if (!best || best.score < 50) return null
  if (second >= best.score - 10 && best.score < 100) return null
  return best
}

function parseNamedH2Blocks(markdown: string): Array<{ heading: string; body: string }> {
  const blocks: Array<{ heading: string; body: string }> = []
  const header = /^(?:#{2,4}\s*|\*\*)(?:H2[:：]\s*|章节[:：]\s*)([^*\n]+?)(?:\*\*)?\s*$/i
  let current: { heading: string; lines: string[] } | null = null

  const flush = (): void => {
    if (!current) return
    const body = current.lines.join('\n').trim()
    if (current.heading) blocks.push({ heading: current.heading, body })
    current = null
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    const headerMatch = line.match(header)
    if (headerMatch) {
      flush()
      current = { heading: headerMatch[1].trim(), lines: [] }
      continue
    }
    if (/^#{1,3}\s/.test(line) && !header.test(line)) {
      flush()
      continue
    }
    if (current) current.lines.push(raw)
  }
  flush()
  return blocks
}

function isPlacementOrNewH2Line(line: string): boolean {
  return /\[(?:new h2|新增\s*h2)/i.test(line) || /placement\s*:/i.test(line) || /insert\s+(before|after)/i.test(line)
}

function isBareTitleEcho(line: string, title: string): boolean {
  const cleaned = line
    .replace(/^[-*+\d.\s#]+/, '')
    .replace(/^h2[:：]\s*/i, '')
    .replace(/\*\*/g, '')
    .trim()
  if (!headingMatchesTitle(cleaned, title) && scoreAgainstTitle(cleaned, title) < 90) return false
  return !/\b(KEEP|ADD|REMOVE|REPLACE|placement)\b/i.test(line)
}

function belongsToOtherNewSection(line: string, title: string, allTitles: string[]): boolean {
  if (!isPlacementOrNewH2Line(line)) return false
  const owner = bestTitleForLine(
    line
      .replace(/insert\s+(before|after)\s*[「"']?[^」"'\n|]+[」"']?/gi, ' ')
      .replace(/after\s*[「"'][^」"']+[」"']/gi, ' ')
      .replace(/before\s*[「"'][^」"']+[」"']/gi, ' '),
    allTitles
  )
  if (owner && owner.title !== title) return true

  const anchor = line.match(/(?:after|before|之前|之后)\s*[「"']?([^」"'\n|]+)[」"']?/i)?.[1]?.trim()
  if (anchor && headingMatchesTitle(anchor, title)) {
    const stripped = line.replace(anchor, ' ')
    return scoreAgainstTitle(stripped, title) < 50
  }
  return false
}

function collectBlockForTitle(markdown: string, title: string, allTitles: string[]): string {
  const matched = parseNamedH2Blocks(markdown)
    .filter((block) => headingMatchesTitle(block.heading, title))
    .map((block) =>
      block.body
        .split('\n')
        .filter((line) => !belongsToOtherNewSection(line, title, allTitles) && !isBareTitleEcho(line, title))
        .join('\n')
        .trim()
    )
    .filter(Boolean)
  return matched.join('\n')
}

function collectMatchingLines(
  markdown: string,
  title: string,
  allTitles: string[],
  options?: { preferNewH2?: boolean }
): string[] {
  const lines = markdown.split('\n')
  const collected: string[] = []
  const titleKey = normalizeH2Key(title)

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.length < 8) continue
    if (/^#{1,6}\s/.test(line) && !/h2[:：]|新增\s*h2|new h2/i.test(line)) continue
    if (isBareTitleEcho(line, title)) continue
    if (belongsToOtherNewSection(line, title, allTitles)) continue

    const isNewH2Line = isPlacementOrNewH2Line(line)
    if (isNewH2Line) {
      const owner = bestTitleForLine(line, allTitles)
      if (owner && owner.title !== title) continue
      if (scoreAgainstTitle(line, title) >= 50 || (options?.preferNewH2 && !owner)) {
        collected.push(line)
        continue
      }
    }

    const named = bestTitleForLine(line, allTitles)
    if (named?.title === title) {
      collected.push(line)
      continue
    }

    if (!named && titleKey && line.toLowerCase().includes(titleKey)) {
      collected.push(line)
    }
  }

  return collected
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const key = line.replace(/^[-*+\d.\s]+/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line.startsWith('-') || line.startsWith('*') ? line : `- ${line}`)
  }
  return out
}

function capExcerpt(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  const sliced = trimmed.slice(0, maxChars)
  const lastBreak = sliced.lastIndexOf('\n')
  return (lastBreak > maxChars * 0.5 ? sliced.slice(0, lastBreak) : sliced).trim()
}

export function excerptOptimizeSectionBriefing(input: {
  sectionTitle: string
  sourceTitle?: string
  allSectionTitles: string[]
  audit: string
  competitorInsights: string
  action: OptimizeSectionEditAction
}): SectionBriefingExcerpt {
  if (input.action === 'text_polish') {
    return { auditExcerpt: '', competitorExcerpt: '' }
  }

  const titles = [...new Set([input.sectionTitle, input.sourceTitle, ...input.allSectionTitles])]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))

  const pull = (source: string, maxChars: number): string => {
    const fromBlocks = collectBlockForTitle(source, input.sectionTitle, titles)
    const fromSourceTitle = input.sourceTitle
      ? collectBlockForTitle(source, input.sourceTitle, titles)
      : ''
    const fromLines = collectMatchingLines(source, input.sectionTitle, titles, {
      preferNewH2: input.action === 'write_new'
    })
    const extraSourceLines = input.sourceTitle
      ? collectMatchingLines(source, input.sourceTitle, titles)
      : []

    const merged = uniqueLines(
      [...fromBlocks.split('\n'), ...fromSourceTitle.split('\n'), ...fromLines, ...extraSourceLines]
        .map((line) => line.trim())
        .filter((line) => line.length > 2)
    )

    return capExcerpt(merged.join('\n'), maxChars)
  }

  return {
    auditExcerpt: pull(input.audit, SECTION_AUDIT_EXCERPT_MAX),
    competitorExcerpt: pull(input.competitorInsights, SECTION_COMPETITOR_EXCERPT_MAX)
  }
}

export function buildOptimizeDraftSystemPrompt(input: {
  articleTitle: string
  langLock: string
  languageLabel: string
  mentionLock: string
  briefForPrompt: string
  skillsText: string
  editorBlocks: string
  wordRangeLabel: string
}): string {
  return [
    '你是 SEO/GEO 内容编辑。按用户消息中的【本节动作】执行：文本优化 / 内容增删 / 新写。',
    '只输出本节 Markdown 正文（不要 ## / ### 本节标题行），不要解释修改过程。',
    '本节标题与在全文中的位置已由优化大纲锁定：不得改名、不得并入其他章节、无需判断插在哪两节之间。',
    input.langLock,
    `页面标题：${input.articleTitle}`,
    `输出语言：${input.languageLabel}（与原文一致）`,
    `词数参考（全文）：${input.wordRangeLabel}`,
    input.mentionLock,
    input.briefForPrompt,
    input.skillsText ? `Skills：\n${input.skillsText}` : '',
    input.editorBlocks
  ]
    .filter(Boolean)
    .join('\n\n')
}
