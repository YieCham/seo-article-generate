import { countArticleWords as countWords } from './articleLength'
import type { OutlineSection } from './optimizeStructure'
import { classifyArticleModule } from './optimizeStructure'

export interface SectionSanitizeLog {
  dropped: Array<{ title: string; reason: string }>
  merged: Array<{ from: string; into: string; reason: string }>
}

export interface SanitizeOptimizeSectionsResult {
  sections: OutlineSection[]
  log: SectionSanitizeLog
}

const JUNK_TITLE_PATTERNS: RegExp[] = [
  /^leave a reply/i,
  /cancel reply/i,
  /^post a comment/i,
  /^related posts?/i,
  /^share this/i,
  /^subscribe(?:\s|$)/i,
  /^you may also like/i,
  /^comments?\s*$/i
]

function moduleBucket(title: string): ReturnType<typeof classifyArticleModule> {
  return classifyArticleModule(title)
}

export function isJunkOptimizeSection(title: string, body: string): boolean {
  const trimmedTitle = title.trim()
  if (!trimmedTitle) return true

  if (JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(trimmedTitle))) {
    return true
  }

  const combined = `${trimmedTitle}\n${body}`
  if (
    /\[cancel reply\]|#respond/i.test(combined) &&
    (JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(trimmedTitle)) || countWords(body) < 80)
  ) {
    return true
  }

  return false
}

interface ParsedSectionTitle {
  cleanTitle: string
  insertBefore?: string
  insertAfter?: string
  isPlacementMeta: boolean
  isH3Level: boolean
}

function parseSectionTitleMetadata(rawTitle: string): ParsedSectionTitle {
  let title = rawTitle
    .trim()
    .replace(/^\*\s*/, '')
    .replace(/\s*\*$/, '')
    .replace(/^`+|`+$/g, '')
    .trim()

  const isH3Level = /^\[NEW H3\]/i.test(title) || /^\[新增\s*H3\]/i.test(title)
  title = title.replace(/^\[NEW H3\]\s*/i, '').replace(/^\[新增\s*H3\]\s*/i, '').trim()

  let insertBefore: string | undefined
  let insertAfter: string | undefined
  let isPlacementMeta = false

  const betweenMatch = title.match(
    /\|\s*`?(?:Insert|insert)\s+between\s*[「"']?(.+?)[」"']?\s+and\s+[「"']?(.+?)[」"']?\s*$/i
  )
  if (betweenMatch) {
    insertBefore = betweenMatch[1].trim()
    insertAfter = betweenMatch[2].trim()
    title = title.slice(0, betweenMatch.index).trim()
    isPlacementMeta = true
  }

  const pipeBefore = title.match(/\|\s*`?(?:Insert|insert)\s+before\s*[「"']?(.+?)[」"']?\s*$/i)
  if (pipeBefore) {
    insertBefore = pipeBefore[1].trim()
    title = title.slice(0, pipeBefore.index).trim()
    isPlacementMeta = true
  }

  const parenBefore = title.match(/\*?\s*\((?:Insert|insert)\s+before\s+([^)]+)\)\s*\*?\s*$/i)
  if (parenBefore) {
    insertBefore = parenBefore[1].trim()
    title = title.replace(/\*?\s*\((?:Insert|insert)\s+before\s+[^)]+\)\s*\*?\s*$/i, '').trim()
    isPlacementMeta = true
  }

  title = title
    .replace(/^\[NEW H2\]\s*/i, '')
    .replace(/^\[新增\s*H2(?:\s*[:：][^\]]*)?\]\s*/i, '')
    .replace(/\s*\|\s*`?(?:Insert|insert)\s+(?:before|between)[^|]*$/i, '')
    .trim()

  if (/^(?:Insert|insert)\s+(?:before|between)\b/i.test(title)) {
    isPlacementMeta = true
  }

  if (isH3Level) {
    isPlacementMeta = true
  }

  return { cleanTitle: title || rawTitle.trim(), insertBefore, insertAfter, isPlacementMeta, isH3Level }
}

function isMetaInstructionSection(title: string, body: string): boolean {
  const parsed = parseSectionTitleMetadata(title)
  if (parsed.isPlacementMeta) return true
  if (/^\*+\s/.test(title.trim()) || /^`/.test(title.trim())) return true
  if (/\|\s*`?(?:Insert|insert)\s+(?:before|between)/i.test(title)) return true
  if (/^\*\s*[\d.]+\s/.test(title.trim()) && countWords(body) < 40) return true
  return false
}

function titleMatchesAnchor(sectionTitle: string, anchor: string): boolean {
  const section = sectionTitle.trim().toLowerCase()
  const needle = anchor.trim().toLowerCase()
  if (!needle) return false
  return section.includes(needle) || needle.includes(section)
}

function findMergeTargetIndex(sections: OutlineSection[], anchor?: string): number {
  if (anchor) {
    const idx = sections.findIndex((item) => titleMatchesAnchor(item.title, anchor))
    if (idx >= 0) return idx
  }

  const introIdx = sections.findIndex((item) => classifyArticleModule(item.title) === 'introduction')
  if (introIdx >= 0) return introIdx

  const bodyIdx = sections.findIndex((item) => classifyArticleModule(item.title) === 'body')
  return bodyIdx >= 0 ? bodyIdx : 0
}

function deduplicateModuleSections(sections: OutlineSection[], log: SectionSanitizeLog): OutlineSection[] {
  const buckets: Record<'quickAnswer' | 'introduction' | 'faq' | 'conclusion', OutlineSection[]> = {
    quickAnswer: [],
    introduction: [],
    faq: [],
    conclusion: []
  }
  const body: OutlineSection[] = []

  for (const section of sections) {
    const bucket = moduleBucket(section.title)
    if (bucket === 'body') body.push(section)
    else buckets[bucket].push(section)
  }

  const pickBest = (items: OutlineSection[], label: string): OutlineSection[] => {
    if (items.length <= 1) return items

    const sorted = [...items].sort((a, b) => countWords(b.body) - countWords(a.body))
    const best = { ...sorted[0] }

    for (let i = 1; i < sorted.length; i += 1) {
      const duplicate = sorted[i]
      const note = duplicate.body.trim()
        ? `- Consolidate duplicate ${label} from "${duplicate.title}": ${duplicate.body.trim().slice(0, 400)}`
        : `- Consolidate duplicate ${label}: "${duplicate.title}"`
      best.body = `${best.body.trim()}\n${note}`.trim()
      log.merged.push({
        from: duplicate.title,
        into: best.title,
        reason: `duplicate ${label} module`
      })
    }

    return [best]
  }

  return [
    ...pickBest(buckets.quickAnswer, 'Quick Answer'),
    ...pickBest(buckets.introduction, 'Introduction'),
    ...body,
    ...pickBest(buckets.faq, 'FAQ'),
    ...pickBest(buckets.conclusion, 'Conclusion')
  ]
}

function buildMergeBullet(section: OutlineSection, parsed: ParsedSectionTitle): string {
  const label = parsed.cleanTitle || section.title.trim()
  const placement = parsed.insertBefore
    ? ` (insert before "${parsed.insertBefore}")`
    : parsed.insertAfter
      ? ` (insert after "${parsed.insertAfter}")`
      : ''
  const bodyNote = section.body.trim() ? `: ${section.body.trim().slice(0, 500)}` : ''
  return `- ADD subsection${placement}: ${label}${bodyNote}`
}

export function filterJunkSourceSections(sections: OutlineSection[]): OutlineSection[] {
  return sections.filter((section) => !isJunkOptimizeSection(section.title, section.body))
}

export function sanitizeOptimizeSections(
  sections: OutlineSection[],
  _context?: { sourceSections?: OutlineSection[] }
): SanitizeOptimizeSectionsResult {
  const log: SectionSanitizeLog = { dropped: [], merged: [] }
  const keepers: OutlineSection[] = []
  const pendingMerges: Array<{ targetAnchor?: string; insertAfter?: string; bullet: string }> = []

  for (const section of sections) {
    if (isJunkOptimizeSection(section.title, section.body)) {
      log.dropped.push({ title: section.title, reason: 'CMS / comment junk' })
      continue
    }

    const parsed = parseSectionTitleMetadata(section.title)
    if (isMetaInstructionSection(section.title, section.body)) {
      pendingMerges.push({
        targetAnchor: parsed.insertBefore ?? parsed.insertAfter,
        insertAfter: parsed.insertAfter,
        bullet: buildMergeBullet(section, parsed)
      })
      log.merged.push({
        from: section.title,
        into: parsed.insertBefore ?? parsed.insertAfter ?? 'Introduction/body',
        reason: parsed.isH3Level ? 'H3 instruction merged into parent' : 'insert placement merged'
      })
      continue
    }

    keepers.push({
      title: parsed.cleanTitle,
      body: section.body.trim()
    })
  }

  for (const merge of pendingMerges) {
    const targetIdx = findMergeTargetIndex(keepers, merge.targetAnchor ?? merge.insertAfter)
    if (targetIdx >= 0 && keepers[targetIdx]) {
      keepers[targetIdx] = {
        ...keepers[targetIdx],
        body: `${keepers[targetIdx].body.trim()}\n${merge.bullet}`.trim()
      }
    }
  }

  const deduped = deduplicateModuleSections(keepers, log)

  return { sections: deduped, log }
}
