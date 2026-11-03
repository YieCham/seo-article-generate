import { stripOuterCodeFence } from './normalizeArticleMarkdown'

/**
 * Word count used by the article pipeline and the UI.
 *
 * Counts Latin words plus CJK characters (roughly 1.5 characters per word), and
 * ignores SEO Meta, code fences, heading markers, list bullets and `[Image: …]`
 * placeholders so the number matches the length-calibration target.
 */
export function countArticleWords(text: string): number {
  const body = stripOuterCodeFence(
    text.replace(/^##\s+SEO Meta[\s\S]*?(?=\n## |\n# |$)/im, '').trim()
  )
  const withoutPlaceholders = body.replace(/\[Image:[^\]]*\]/gi, ' ')
  const plain = withoutPlaceholders
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[|*_`~>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return 0

  const cjk = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = plain.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return latin + Math.ceil(cjk / 1.5)
}
