import { countArticleWords } from './articleLength'
import {
  normalizeArticleMarkdown,
  sanitizeHeadingTitle
} from '../../shared/normalizeArticleMarkdown'

/**
 * Guard for full-article LLM rewrites (polish / word-count calibration).
 *
 * Those steps ask the model to return the whole article. A network hiccup, a
 * provider-side output cap or an early stop can return only the first few
 * sections. Never let such a response replace a complete article: either merge
 * the missing sections back from the previous text, or keep the previous text.
 */

export interface RewriteGuardVerdict {
  article: string
  /** The candidate was rejected and the previous article is kept. */
  discarded: boolean
  /** Missing/hollow sections were restored from the previous article. */
  recovered: boolean
  reason?: string
}

interface ArticleSection {
  title: string
  body: string
}

interface ArticleShell {
  prefix: string
  h1: string
  leadIn: string
  sections: ArticleSection[]
}

/** A matched section shorter than this share of the previous body counts as lost. */
const HOLLOW_RATIO = 0.25
/** Bodies shorter than this are never trustworthy, regardless of ratio. */
const HOLLOW_MIN_WORDS = 12
/** Restored article must keep at least this share of the previous word count. */
const RESTORE_MIN_WORD_RATIO = 0.9

function splitSections(body: string): { leadIn: string; sections: ArticleSection[] } {
  const lines = body.split('\n')
  const sections: ArticleSection[] = []
  const leadInLines: string[] = []
  let current: ArticleSection | null = null

  for (const line of lines) {
    const heading = line.match(/^##(?!#)\s+(.+)$/)
    if (heading) {
      if (current) sections.push(current)
      current = { title: heading[1].trim(), body: '' }
      continue
    }
    if (current) {
      current.body += `${line}\n`
    } else {
      leadInLines.push(line)
    }
  }
  if (current) sections.push(current)

  return { leadIn: leadInLines.join('\n').trim(), sections }
}

function splitShell(markdown: string): ArticleShell {
  let text = normalizeArticleMarkdown(markdown.trim())
  let prefix = ''
  const seoMeta = text.match(/^(## SEO Meta[\s\S]*?\n---\n+)/i)
  if (seoMeta) {
    prefix = seoMeta[1]
    text = text.slice(prefix.length).trimStart()
  }

  let h1 = ''
  const h1Match = text.match(/^(#\s[^\n]+\n+)/)
  if (h1Match) {
    h1 = h1Match[1]
    text = text.slice(h1Match[1].length).trimStart()
  }

  const { leadIn, sections } = splitSections(text)
  return { prefix, h1, leadIn, sections }
}

function normalizedTitle(title: string): string {
  return sanitizeHeadingTitle(title)
    .toLowerCase()
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titlesMatch(a: string, b: string): boolean {
  const left = normalizedTitle(a)
  const right = normalizedTitle(b)
  if (!left || !right) return false
  if (left === right) return true
  // Only allow containment for long enough titles to avoid "FAQ" matching everything.
  return left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))
}

function sectionWords(section: ArticleSection): number {
  return countArticleWords(section.body)
}

function countH3(markdown: string): number {
  return markdown.match(/^###(?!#)\s+/gm)?.length ?? 0
}

function isOutputLengthStop(finishReason?: string): boolean {
  const reason = (finishReason ?? '').toLowerCase()
  return reason === 'length' || reason === 'max_tokens'
}

function describe(reason: string[]): string | undefined {
  return reason.length > 0 ? reason.join('，') : undefined
}

/** Is this matched section body too small to count as the rewritten section? */
function isHollow(previous: ArticleSection, candidate: ArticleSection | undefined): boolean {
  if (!candidate) return true
  const prevWords = sectionWords(previous)
  const nextWords = sectionWords(candidate)
  // Nothing to lose (e.g. an image-placeholder-only section).
  if (prevWords === 0) return false
  // Tiny sections (image placeholders, one-liners) must not trigger the guard.
  if (prevWords < 8) return nextWords === 0
  // Short sections get a proportionally lower floor.
  if (prevWords < 40) return nextWords < Math.max(5, Math.floor(prevWords * 0.5))
  return nextWords < Math.max(HOLLOW_MIN_WORDS, Math.floor(prevWords * HOLLOW_RATIO))
}

/**
 * Accept, repair or reject a full-article rewrite.
 *
 * `previous` is the complete article before the rewrite; `next` is the model
 * output. Structural losses (missing H2, emptied section bodies, collapsed H3
 * tree) are treated as truncation even when `finishReason` looks normal, because
 * many gateways report `stop` for a cut response.
 */
export function guardArticleRewrite(
  previous: string,
  next: string,
  finishReason?: string
): RewriteGuardVerdict {
  const prevText = normalizeArticleMarkdown(previous.trim())
  const nextText = normalizeArticleMarkdown(next.trim())

  if (!nextText) {
    return { article: prevText, discarded: true, recovered: false, reason: '空输出' }
  }

  const prev = splitShell(prevText)
  const candidate = splitShell(nextText)
  const prevWords = countArticleWords(prevText)
  const nextWords = countArticleWords(nextText)

  // Articles without H2s: fall back to a word-count comparison.
  if (prev.sections.length === 0) {
    const collapsed =
      prevWords >= 400 && nextWords < Math.max(400, Math.floor(prevWords * 0.6))
    if (collapsed) {
      return { article: prevText, discarded: true, recovered: false, reason: '正文明显短于改写前' }
    }
    return { article: nextText, discarded: false, recovered: false }
  }

  const used = new Set<number>()
  const missing: string[] = []
  const hollow: string[] = []
  const pairs: Array<{ previous: ArticleSection; candidate?: ArticleSection }> = prev.sections.map(
    (section) => {
      const index = candidate.sections.findIndex(
        (item, itemIndex) => !used.has(itemIndex) && titlesMatch(item.title, section.title)
      )
      if (index < 0) {
        missing.push(section.title)
        return { previous: section }
      }
      used.add(index)
      const matched = candidate.sections[index]
      if (isHollow(section, matched)) hollow.push(section.title)
      return { previous: section, candidate: matched }
    }
  )

  const extras = candidate.sections.filter((_, index) => !used.has(index))
  const prevH3 = countH3(prevText)
  const nextH3 = countH3(nextText)
  const h3Loss = prevH3 >= 4 && nextH3 < Math.ceil(prevH3 * 0.5)
  const wordCollapse = prevWords >= 500 && nextWords < Math.max(Math.floor(prevWords * 0.5), 400)
  const structurallyLost = missing.length > 0 || hollow.length > 0

  const truncated = structurallyLost || h3Loss || wordCollapse
  if (!truncated) {
    return { article: nextText, discarded: false, recovered: false }
  }

  const reasons: string[] = []
  if (missing.length > 0) reasons.push(`缺失 ${missing.length} 节`)
  if (hollow.length > 0) reasons.push(`${hollow.length} 节内容不完整`)
  if (h3Loss) reasons.push('三级标题明显减少')
  if (reasons.length === 0 && isOutputLengthStop(finishReason)) reasons.push('输出达到长度上限')
  if (reasons.length === 0 && wordCollapse) reasons.push('正文明显短于改写前')
  const reason = describe(reasons)

  // Merge: keep the rewritten body when it is usable, otherwise restore the
  // previous body. H2 titles stay exactly as before.
  const mergedSections = pairs.map(({ previous: prevSection, candidate: candSection }) => {
    const usable = candSection != null && !isHollow(prevSection, candSection)
    return {
      title: prevSection.title,
      body: usable && candSection ? candSection.body : prevSection.body
    }
  })

  // Keep extra sections only when nothing went missing (a rename would otherwise
  // duplicate the same content under two headings).
  const extraSections = missing.length === 0
    ? extras.filter((section) => sectionWords(section) >= 20)
    : []

  const h1 = candidate.h1.trim() || prev.h1.trim()
  const leadIn = candidate.leadIn || prev.leadIn
  const prefix = candidate.prefix.trim() || prev.prefix.trim()
  const sectionMarkdown = [...mergedSections, ...extraSections]
    .map((section) => {
      const body = section.body.trim()
      return body ? `## ${section.title}\n\n${body}` : `## ${section.title}`
    })
    .join('\n\n')
  const rebuilt = normalizeArticleMarkdown(
    [prefix, h1, leadIn, sectionMarkdown].filter((part) => part.trim()).join('\n\n').trim()
  )

  const rebuiltWords = countArticleWords(rebuilt)
  const rebuiltH3 = countH3(rebuilt)
  const restored =
    rebuiltWords >= Math.floor(prevWords * RESTORE_MIN_WORD_RATIO) &&
    (!h3Loss || rebuiltH3 >= Math.ceil(prevH3 * 0.8))

  if (!restored) {
    return { article: prevText, discarded: true, recovered: false, reason }
  }

  return { article: rebuilt, discarded: false, recovered: true, reason }
}

export function countArticleSections(markdown: string): number {
  return splitShell(markdown).sections.length
}
