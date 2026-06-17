export interface OutlineSectionSlice {
  title: string
  body: string
}

export function buildSectionOutlineContext(sections: OutlineSectionSlice[], index: number): string {
  const current = sections[index]
  if (!current) return ''

  const previous = index > 0 ? sections[index - 1] : null
  const next = index < sections.length - 1 ? sections[index + 1] : null

  const lines = ['【大纲上下文 — 仅本节所需】']

  if (previous) {
    lines.push(`上一节：${previous.title}（正文已写完；本节开头须自然衔接，勿重复上一节内容）`)
  }

  lines.push('', `【当前节 — ${current.title}】`, current.body.trim() || '（按标题与主题自行展开要点）')

  if (next) {
    lines.push('', `下一节预告：${next.title}（勿提前写下一节内容）`)
  }

  return lines.join('\n')
}
