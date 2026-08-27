/**
 * Locate the product-tutorial Part / Step-by-Step block in a finished article.
 * Prefer the strongest product-tutorial H2; never take the first loose "how to" mention.
 */

export interface ProductTutorialRange {
  start: number
  end: number
  text: string
  heading: string
}

function findHeadingMatches(article: string, pattern: RegExp): RegExpMatchArray[] {
  return [...article.matchAll(pattern)]
}

function sectionEnd(article: string, startIndex: number, matches: RegExpMatchArray[]): number {
  for (const match of matches) {
    const index = match.index ?? -1
    if (index > startIndex) return index
  }
  return article.length
}

function headingPlain(heading: string): string {
  return heading.replace(/^#{1,6}\s+/, '').trim()
}

function isNonTutorialHeading(heading: string): boolean {
  const title = headingPlain(heading)
  return /^(quick\s*answer|tldr|introduction|intro|faq|frequently asked|conclusion|seo\s*meta|key takeaways|table of contents)$/i.test(
    title
  )
}

function scoreProductTutorial(title: string, body: string, productName?: string): number {
  if (isNonTutorialHeading(title)) return 0

  const titleText = headingPlain(title)
  let score = 0

  if (/^###\s+.*step-by-step/im.test(body) || /step-by-step/i.test(titleText)) score += 100
  if (/^###\s+why\s+/im.test(body)) score += 40
  if (/\[Image:/i.test(body)) score += 12

  const name = productName?.trim().toLowerCase()
  if (name) {
    if (titleText.toLowerCase().includes(name)) score += 40
    if (
      titleText.toLowerCase().includes(name) &&
      /how to|tutorial|with |使用|教程/i.test(titleText)
    ) {
      score += 20
    }
  }

  return score
}

export function extractProductTutorialRange(
  article: string,
  productName?: string
): ProductTutorialRange | null {
  const source = article ?? ''
  if (!source.trim()) return null

  const h2Matches = findHeadingMatches(source, /^##\s+.+$/gm)
  let best: (ProductTutorialRange & { score: number }) | null = null

  for (const match of h2Matches) {
    const start = match.index ?? 0
    const end = sectionEnd(source, start, h2Matches)
    const text = source.slice(start, end)
    const heading = match[0].trim()
    const score = scoreProductTutorial(heading, text, productName)
    if (score < 30) continue
    if (!best || score > best.score) {
      best = { start, end, text, heading, score }
    }
  }

  if (best) {
    return { start: best.start, end: best.end, text: best.text, heading: best.heading }
  }

  const stepMatches = findHeadingMatches(source, /^###\s+.*step-by-step.*$/gim)
  if (stepMatches.length === 0) return null

  const match = stepMatches[0]
  const h3Start = match.index ?? 0
  const parent = [...h2Matches].reverse().find((item) => (item.index ?? -1) < h3Start)
  if (parent && typeof parent.index === 'number') {
    const start = parent.index
    const end = sectionEnd(source, start, h2Matches)
    return {
      start,
      end,
      text: source.slice(start, end),
      heading: parent[0].trim()
    }
  }

  const h3After = findHeadingMatches(source, /^###\s+.+$/gm).filter(
    (item) => (item.index ?? -1) > h3Start
  )
  const h2After = h2Matches.filter((item) => (item.index ?? -1) > h3Start)
  const end = Math.min(sectionEnd(source, h3Start, h3After), sectionEnd(source, h3Start, h2After))
  return {
    start: h3Start,
    end,
    text: source.slice(h3Start, end),
    heading: match[0].trim()
  }
}
