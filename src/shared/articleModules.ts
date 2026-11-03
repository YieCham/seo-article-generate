import { isSeoMetaHeading, plainHeadingText } from './inPageNav'

const CLOSING_START =
  /^(?:conclusion|in conclusion|final thoughts|final words?|last words|wrapping up|wrap-up|wrap up|bottom line|closing remarks|closing thoughts|closing words|concluding remarks|concluding thoughts|to conclude|summing up|to sum up|in closing)\b/i

const CLOSING_AFTER_PART =
  /\bpart\s*\d+\s*[.:：)\-–—]\s*(?:bottom line|conclusion|final thoughts|final words?|wrapping up|wrap-up|wrap up|in conclusion|closing remarks|closing thoughts)\b/i

const CLOSING_END =
  /\b(?:bottom line|final thoughts|final words?|last words|wrapping up|wrap-up|wrap up|in conclusion|conclusion|closing remarks|closing thoughts)\s*$/i

export function isFaqHeading(title: string): boolean {
  const t = plainHeadingText(title)
  if (!t) return false
  if (/^faqs?$/i.test(t)) return true
  if (/frequently asked questions/i.test(t)) return true
  if (/常见问题|常見問題/.test(t)) return true
  if (/\bfaqs?\b/i.test(t) && t.length <= 90) return true
  if (/^q\s*&\s*a\b/i.test(t) && t.length <= 90) return true
  return false
}

export function isConclusionHeading(title: string): boolean {
  const t = plainHeadingText(title)
  if (!t) return false
  if (CLOSING_START.test(t)) return true
  if (/^(?:the|our|a)\s+(?:bottom line|conclusion|final thoughts|final words?)\b/i.test(t)) return true
  if (CLOSING_AFTER_PART.test(t)) return true
  if (CLOSING_END.test(t)) return true
  if (/^(?:总结|结语|結語|写在最后|寫在最後|最后的话|最後的話)\b/.test(t)) return true
  return false
}

export type ArticleModuleKind = 'quickAnswer' | 'introduction' | 'faq' | 'conclusion' | 'body'

export function articleModuleKind(title: string): ArticleModuleKind {
  const t = plainHeadingText(title)
  if (/quick answer|key takeaways/i.test(t)) return 'quickAnswer'
  if (/^introduction$/i.test(t)) return 'introduction'
  if (isFaqHeading(t)) return 'faq'
  if (isConclusionHeading(t)) return 'conclusion'
  return 'body'
}

/** Quick Answer → Introduction → body → FAQ → conclusion. Every section is kept. */
export function orderByArticleModule<T>(items: T[], titleOf: (item: T) => string): T[] {
  const quickAnswer: T[] = []
  const introduction: T[] = []
  const body: T[] = []
  const faq: T[] = []
  const conclusion: T[] = []

  for (const item of items) {
    switch (articleModuleKind(titleOf(item))) {
      case 'quickAnswer':
        quickAnswer.push(item)
        break
      case 'introduction':
        introduction.push(item)
        break
      case 'faq':
        faq.push(item)
        break
      case 'conclusion':
        conclusion.push(item)
        break
      default:
        body.push(item)
    }
  }

  return [...quickAnswer, ...introduction, ...body, ...faq, ...conclusion]
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

function splitH2Chunks(markdown: string): Array<{ title: string; raw: string }> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const inFence = fenceMask(lines)
  const chunks: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!inFence[index] && /^##(?!#)\s+/.test(line)) {
      if (current) chunks.push(current)
      current = { title: plainHeadingText(line.replace(/^##\s+/, '')), lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) chunks.push(current)

  return chunks.map((chunk) => ({
    title: chunk.title,
    raw: chunk.lines.join('\n').trim()
  }))
}

/** Move FAQ sections ahead of conclusion headings such as Conclusion or Final Words. */
export function reorderFaqBeforeConclusion(markdown: string): string {
  const text = markdown.replace(/\r\n/g, '\n').trim()
  if (!text || !/^##(?!#)\s+/m.test(text)) return markdown

  let rest = text
  let prefix = ''
  const seoMetaMatch = rest.match(/^(## SEO Meta[\s\S]*?\n---\n+)/i)
  if (seoMetaMatch) {
    prefix = seoMetaMatch[1]
    rest = rest.slice(prefix.length).replace(/^\n+/, '')
  }

  let h1 = ''
  const h1Match = rest.match(/^(#\s[^\n]+\n+)/)
  if (h1Match) {
    h1 = h1Match[1]
    rest = rest.slice(h1Match[1].length).replace(/^\n+/, '')
  }

  const firstH2 = rest.search(/^##(?!#)\s+/m)
  if (firstH2 < 0) return markdown
  const leadIn = firstH2 > 0 ? rest.slice(0, firstH2).trim() : ''
  const chunks = splitH2Chunks(rest.slice(firstH2)).filter((chunk) => !isSeoMetaHeading(chunk.title))
  if (chunks.length < 2) return markdown

  const ordered = orderByArticleModule(chunks, (chunk) => chunk.title)
  if (ordered.every((chunk, index) => chunk.title === chunks[index]?.title)) return markdown

  const body = ordered
    .map((chunk) => chunk.raw)
    .filter(Boolean)
    .join('\n\n')
  return [prefix.trimEnd(), h1.trimEnd(), leadIn, body].filter(Boolean).join('\n\n').trim()
}
