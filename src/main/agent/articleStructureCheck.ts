import { parseH2Sections } from '../../shared/articleProgress'
import {
  collapseDuplicateHeadings,
  normalizeArticleMarkdown
} from '../../shared/normalizeArticleMarkdown'
import { countArticleSections } from './articleRewriteGuard'
import {
  analyzeOutlineH2Contract,
  enforceOutlineH2Contract,
  formatOutlineH2ContractStatus
} from './optimizeH2Contract'
import { reorderArticleMarkdown } from './optimizeStructure'

export interface ArticleStructureCheckResult {
  article: string
  notes: string[]
  warnings: string[]
  changed: boolean
}

const MISSING_SECTION_PLACEHOLDER = /大纲契约：本节在终稿中缺失/

function stripThinkingTags(markdown: string): { text: string; stripped: boolean } {
  const stripped = markdown
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<\/?thinking\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text: stripped, stripped: stripped !== markdown.trim() }
}

function closeUnclosedFences(markdown: string): { text: string; closed: boolean } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let open = false
  let opener = '```'
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/)
    if (!match) continue
    if (!open) {
      open = true
      opener = match[1]
    } else {
      open = false
    }
  }
  if (!open) return { text: markdown, closed: false }
  return { text: `${markdown.replace(/\s+$/, '')}\n${opener}\n`, closed: true }
}

function hasArticleH1(markdown: string): boolean {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let inFence = false
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/^#\s+\S/.test(line)) return true
    if (/^##\s+\S/.test(line)) return false
  }
  return false
}

function emptySectionTitles(markdown: string): string[] {
  return parseH2Sections(markdown)
    .filter((section) => {
      const body = section.body.trim()
      if (!body) return true
      if (MISSING_SECTION_PLACEHOLDER.test(body)) return true
      return false
    })
    .map((section) => section.title)
}

function applyOutlineContract(article: string, outline: string, original: string): {
  article: string
  notes: string[]
  warnings: string[]
} {
  const notes: string[] = []
  const warnings: string[] = []
  const expected = analyzeOutlineH2Contract(article, outline)
  if (expected.expected.length === 0) {
    notes.push('无大纲章节可对照')
    return { article, notes, warnings }
  }

  try {
    const contracted = enforceOutlineH2Contract(article, outline, {
      draft: original,
      sourceMarkdown: original
    })
    if (contracted.fixed) {
      const fixedCount = countArticleSections(contracted.article)
      const currentCount = countArticleSections(article)
      if (fixedCount < currentCount) {
        warnings.push('大纲校验会丢失章节，已保留完整正文')
        return { article, notes, warnings }
      }
      const detail = formatOutlineH2ContractStatus(contracted.report)
      notes.push(detail ? `已按大纲对齐章节（${detail}）` : '已按大纲对齐章节')
      return { article: contracted.article, notes, warnings }
    }
  } catch {
    warnings.push('大纲契约校验失败，已保留完整正文')
    return { article, notes, warnings }
  }

  const remaining = formatOutlineH2ContractStatus(analyzeOutlineH2Contract(article, outline))
  if (remaining) warnings.push(`大纲未完全对齐：${remaining}`)
  else notes.push('章节与大纲一致')
  return { article, notes, warnings }
}

/** Local format + outline H2 check. Does not rewrite prose. */
export function checkArticleStructure(article: string, outline: string): ArticleStructureCheckResult {
  const notes: string[] = []
  const warnings: string[] = []
  const original = article

  const thinking = stripThinkingTags(article)
  let next = thinking.text
  if (thinking.stripped) notes.push('已移除残留 thinking 标签')

  const fenced = closeUnclosedFences(next)
  next = fenced.text
  if (fenced.closed) notes.push('已闭合未结束的代码围栏')

  const normalized = collapseDuplicateHeadings(normalizeArticleMarkdown(next))
  if (normalized !== next) notes.push('已修复标题与围栏格式')
  next = normalized

  const contracted = applyOutlineContract(next, outline, original)
  next = contracted.article
  notes.push(...contracted.notes)
  warnings.push(...contracted.warnings)

  const reordered = reorderArticleMarkdown(next)
  if (reordered !== next) notes.push('已调整 FAQ / Conclusion 顺序')
  next = reordered

  if (!hasArticleH1(next)) warnings.push('缺少一级标题')

  const empty = emptySectionTitles(next)
  if (empty.length > 0) {
    const preview = empty.slice(0, 3).join('、')
    warnings.push(`空章节：${preview}${empty.length > 3 ? '…' : ''}`)
  }

  return {
    article: next,
    notes,
    warnings,
    changed: next !== original
  }
}

export function formatStructureCheckStatus(result: ArticleStructureCheckResult): string {
  const parts = [...result.notes, ...result.warnings]
  if (parts.length === 0) return '格式正常，章节与大纲一致'
  return parts.join('；')
}
