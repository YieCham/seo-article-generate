import { finalizeArticleMarkdown } from './normalizeArticleMarkdown'

/** Copy-ready markdown: from first H1 through end, without outer code fences. */
export function getArticleCopyMarkdown(content: string): string {
  const normalized = finalizeArticleMarkdown(content, { preserveStructure: true })
  if (!normalized.trim()) return ''

  const h1Match = normalized.match(/^#\s+.+$/m)
  const fromH1 =
    h1Match && h1Match.index !== undefined ? normalized.slice(h1Match.index) : normalized

  return fromH1.trimEnd()
}
