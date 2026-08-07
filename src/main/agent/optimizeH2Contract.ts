import { parseOutlineSections } from './llmClient'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'
import {
  extractSourceH1,
  normalizeOptimizeSectionOrder,
  parseSourceSections,
  type OutlineSection
} from './optimizeStructure'

export interface OutlineH2ContractReport {
  ok: boolean
  expected: string[]
  actual: string[]
  missing: string[]
  extra: string[]
  orderMismatch: boolean
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return false
  if (left === right) return true
  return left.includes(right) || right.includes(left)
}

function findSectionByTitle(
  sections: OutlineSection[],
  title: string,
  used: Set<number>
): OutlineSection | undefined {
  const exact = sections.findIndex(
    (item, index) => !used.has(index) && normalizeTitle(item.title) === normalizeTitle(title)
  )
  if (exact >= 0) {
    used.add(exact)
    return sections[exact]
  }

  const fuzzy = sections.findIndex(
    (item, index) => !used.has(index) && titlesMatch(item.title, title)
  )
  if (fuzzy >= 0) {
    used.add(fuzzy)
    return sections[fuzzy]
  }

  return undefined
}

function splitArticleShell(markdown: string): {
  prefix: string
  h1: string
  body: string
} {
  let text = normalizeArticleMarkdown(markdown.trim())
  let prefix = ''
  const seoMetaMatch = text.match(/^(## SEO Meta[\s\S]*?\n---\n+)/i)
  if (seoMetaMatch) {
    prefix = seoMetaMatch[1]
    text = text.slice(prefix.length).trimStart()
  }

  let h1 = ''
  const h1Match = text.match(/^(#\s[^\n]+\n+)/)
  if (h1Match) {
    h1 = h1Match[1]
    text = text.slice(h1Match[1].length).trimStart()
  }

  return { prefix, h1, body: text }
}

export function getExpectedOutlineH2Titles(outline: string): string[] {
  const sections = normalizeOptimizeSectionOrder(parseOutlineSections(outline))
  return sections.map((item) => item.title.trim()).filter(Boolean)
}

export function analyzeOutlineH2Contract(
  article: string,
  outline: string
): OutlineH2ContractReport {
  const expected = getExpectedOutlineH2Titles(outline)
  const { body } = splitArticleShell(article)
  const actualSections = parseOutlineSections(body)
  const actual = actualSections.map((item) => item.title.trim()).filter(Boolean)

  const usedActual = new Set<number>()
  const missing: string[] = []
  for (const title of expected) {
    const hit = findSectionByTitle(actualSections, title, usedActual)
    if (!hit) missing.push(title)
  }

  const extra = actualSections
    .filter((_, index) => !usedActual.has(index))
    .map((item) => item.title.trim())
    .filter(Boolean)

  const orderMismatch =
    missing.length === 0 &&
    extra.length === 0 &&
    expected.length === actual.length &&
    expected.some((title, index) => !titlesMatch(title, actual[index] ?? ''))

  const ok = missing.length === 0 && extra.length === 0 && !orderMismatch

  return { ok, expected, actual, missing, extra, orderMismatch }
}

export function formatOutlineH2ContractStatus(report: OutlineH2ContractReport): string | null {
  if (report.ok) return null
  const parts: string[] = []
  if (report.missing.length > 0) parts.push(`缺失 ${report.missing.length} 节`)
  if (report.extra.length > 0) parts.push(`多余 ${report.extra.length} 节`)
  if (report.orderMismatch) parts.push('顺序不符')
  return parts.join('，')
}

/**
 * Rebuild article body so ## H2 titles match the optimize outline (order + set).
 * Missing bodies are recovered from draft / source when possible.
 */
export function enforceOutlineH2Contract(
  article: string,
  outline: string,
  fallbacks?: {
    draft?: string
    sourceMarkdown?: string
  }
): { article: string; report: OutlineH2ContractReport; fixed: boolean } {
  const before = analyzeOutlineH2Contract(article, outline)
  if (before.ok) {
    return { article: normalizeArticleMarkdown(article.trim()), report: before, fixed: false }
  }

  const expectedTitles = getExpectedOutlineH2Titles(outline)
  if (expectedTitles.length === 0) {
    return { article: normalizeArticleMarkdown(article.trim()), report: before, fixed: false }
  }

  const { prefix, h1, body } = splitArticleShell(article)
  const articleSections = parseOutlineSections(body)
  const draftSections = fallbacks?.draft
    ? parseOutlineSections(splitArticleShell(fallbacks.draft).body)
    : []
  const sourceSections = fallbacks?.sourceMarkdown
    ? parseSourceSections(fallbacks.sourceMarkdown)
    : []

  const usedArticle = new Set<number>()
  const usedDraft = new Set<number>()
  const usedSource = new Set<number>()

  const rebuilt: OutlineSection[] = expectedTitles.map((title) => {
    const fromArticle = findSectionByTitle(articleSections, title, usedArticle)
    if (fromArticle?.body.trim()) {
      return { title, body: fromArticle.body }
    }

    const fromDraft = findSectionByTitle(draftSections, title, usedDraft)
    if (fromDraft?.body.trim()) {
      return { title, body: fromDraft.body }
    }

    const fromSource = findSectionByTitle(sourceSections, title, usedSource)
    if (fromSource?.body.trim()) {
      return { title, body: fromSource.body }
    }

    if (fromArticle) return { title, body: fromArticle.body }
    return {
      title,
      body: '_（大纲契约：本节在终稿中缺失，已按大纲保留标题；请核对上游撰写结果。）_\n'
    }
  })

  const fallbackTitle =
    h1.replace(/^#\s+/, '').trim() ||
    (fallbacks?.sourceMarkdown ? extractSourceH1(fallbacks.sourceMarkdown, 'Article') : 'Article')
  const h1Block = h1.trim() ? h1.trimEnd() + '\n\n' : `# ${fallbackTitle}\n\n`
  const bodyMarkdown = rebuilt
    .map((section) => {
      const sectionBody = section.body.trim()
      return sectionBody ? `## ${section.title}\n\n${sectionBody}` : `## ${section.title}`
    })
    .join('\n\n')

  const nextArticle = normalizeArticleMarkdown(
    [prefix.trimEnd(), h1Block + bodyMarkdown].filter(Boolean).join('\n\n').trim()
  )
  const after = analyzeOutlineH2Contract(nextArticle, outline)

  return {
    article: nextArticle,
    report: after,
    fixed: true
  }
}
