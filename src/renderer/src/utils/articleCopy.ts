/** Copy-ready markdown: from first H1 through end, without code-fence language tags. */
export function getArticleCopyMarkdown(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''

  const h1Match = trimmed.match(/^#\s+.+$/m)
  const fromH1 =
    h1Match && h1Match.index !== undefined ? trimmed.slice(h1Match.index) : trimmed

  return fromH1.replace(/^```[^\n`]*\n/gm, '```\n').trimEnd()
}
