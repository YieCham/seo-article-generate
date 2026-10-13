import { headingAnchorId, isSeoMetaHeading } from './inPageNav'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(text: string): string {
  const placeholders: string[] = []
  const stash = (html: string): string => {
    const token = `\u0000${placeholders.length}\u0000`
    placeholders.push(html)
    return token
  }

  let out = text
  out = out.replace(/`([^`]+)`/g, (_, code: string) => stash(`<code>${escapeHtml(code)}</code>`))
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt: string, src: string) =>
    stash(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`)
  )
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, label: string, href: string) => {
      const linkAttrs = href.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"'
      return stash(`<a href="${escapeHtml(href)}"${linkAttrs}>${escapeHtml(label)}</a>`)
    }
  )

  out = escapeHtml(out)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  out = out.replace(/\u0000(\d+)\u0000/g, (_, index: string) => placeholders[Number(index)] ?? '')
  return out
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function renderTable(rows: string[]): string {
  if (rows.length < 2) return rows.map((line) => `<p>${inlineMarkdown(line)}</p>`).join('\n')
  const header = splitTableRow(rows[0])
  const body = rows.slice(2).map(splitTableRow)
  const th = header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')
  const tr = body
    .map((cells) => `<tr>${cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('\n')
  return `<figure class="wp-block-table"><table><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></figure>`
}

function closeList(kind: 'ul' | 'ol' | null): string {
  if (kind === 'ul') return '</ul>'
  if (kind === 'ol') return '</ol>'
  return ''
}

export function markdownToHtml(markdown: string, assignHeadingIds = true): string {
  const source = markdown.replace(/\r\n/g, '\n').trim()
  if (!source) return ''
  const headingIds = new Set<string>()

  const fences: string[] = []
  const unfenced = source.replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code: string) => {
    const token = `@@FENCE${fences.length}@@`
    fences.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`)
    return token
  })

  const lines = unfenced.split('\n')
  const html: string[] = []
  let listKind: 'ul' | 'ol' | null = null
  let quoteLines: string[] = []
  let para: string[] = []
  let table: string[] = []

  const flushPara = (): void => {
    if (para.length === 0) return
    html.push(`<p>${inlineMarkdown(para.join(' ').trim())}</p>`)
    para = []
  }

  const flushQuote = (): void => {
    if (quoteLines.length === 0) return
    html.push(`<blockquote>${markdownToHtml(quoteLines.join('\n'), false)}</blockquote>`)
    quoteLines = []
  }

  const flushList = (): void => {
    if (!listKind) return
    html.push(closeList(listKind))
    listKind = null
  }

  const flushTable = (): void => {
    if (table.length === 0) return
    html.push(renderTable(table))
    table = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceMatch = line.match(/^@@FENCE(\d+)@@$/)
    if (fenceMatch) {
      flushPara()
      flushQuote()
      flushList()
      flushTable()
      html.push(fences[Number(fenceMatch[1])] ?? '')
      continue
    }

    if (/^\s*\|.+\|\s*$/.test(line) || (table.length > 0 && isTableSeparator(line))) {
      flushPara()
      flushQuote()
      flushList()
      table.push(line)
      const next = lines[i + 1]
      if (!next || (!/^\s*\|/.test(next) && !isTableSeparator(next))) {
        flushTable()
      }
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushPara()
      flushList()
      flushTable()
      quoteLines.push(line.replace(/^\s*>\s?/, ''))
      continue
    }
    if (quoteLines.length > 0) {
      flushQuote()
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushPara()
      flushList()
      flushTable()
      const level = heading[1].length
      const title = heading[2].trim()
      if (assignHeadingIds && level === 2 && !isSeoMetaHeading(title)) {
        const id = headingAnchorId(title, headingIds)
        html.push(`<h2 id="${escapeHtml(id)}">${inlineMarkdown(title)}</h2>`)
      } else {
        html.push(`<h${level}>${inlineMarkdown(title)}</h${level}>`)
      }
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara()
      flushList()
      flushTable()
      html.push('<hr />')
      continue
    }

    const ul = line.match(/^\s*[-*+]\s+(.+)$/)
    if (ul) {
      flushPara()
      flushTable()
      if (listKind !== 'ul') {
        flushList()
        html.push('<ul>')
        listKind = 'ul'
      }
      html.push(`<li>${inlineMarkdown(ul[1])}</li>`)
      continue
    }

    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (ol) {
      flushPara()
      flushTable()
      if (listKind !== 'ol') {
        flushList()
        html.push('<ol>')
        listKind = 'ol'
      }
      html.push(`<li>${inlineMarkdown(ol[1])}</li>`)
      continue
    }

    if (!line.trim()) {
      flushPara()
      flushList()
      flushTable()
      continue
    }

    flushList()
    para.push(line.trim())
  }

  flushQuote()
  flushPara()
  flushList()
  flushTable()
  return html.filter(Boolean).join('\n')
}
