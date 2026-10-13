import { repairBrokenAtxHeadings } from '../../shared/normalizeArticleMarkdown'

export type OptimizePatchOpName = 'replace' | 'insert_after' | 'delete'

export interface OptimizePatchOp {
  op: OptimizePatchOpName
  find: string
  with?: string
}

export interface OptimizePatchApplyOptions {
  allowedOps?: OptimizePatchOpName[]
  /** text_polish: reject replacements longer than a short sentence. */
  shortReplaceOnly?: boolean
}

export type OptimizePatchResult =
  | { ok: true; ops: OptimizePatchOp[]; text: string }
  | { ok: false; error: string }

const SHORT_REPLACE_MAX_WORDS = 80

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function wordCount(value: string): number {
  const collapsed = collapseWhitespace(value)
  return collapsed ? collapsed.split(' ').length : 0
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectExactIndexes(source: string, needle: string): number[] {
  const hits: number[] = []
  let pos = 0
  while (pos <= source.length) {
    const idx = source.indexOf(needle, pos)
    if (idx < 0) break
    hits.push(idx)
    pos = idx + Math.max(needle.length, 1)
  }
  return hits
}

function findUniqueSpan(
  source: string,
  needle: string
): { start: number; end: number } | { error: string } {
  const trimmed = needle.trim()
  if (!trimmed) return { error: 'find 为空' }

  const exact = collectExactIndexes(source, trimmed)
  if (exact.length === 1) {
    return { start: exact[0], end: exact[0] + trimmed.length }
  }
  if (exact.length > 1) {
    return { error: `find 匹配到 ${exact.length} 处，请引用更长的原文` }
  }

  const tokens = collapseWhitespace(trimmed).split(' ').filter(Boolean)
  if (tokens.length === 0) return { error: 'find 为空' }

  const pattern = tokens.map(escapeRegExp).join('\\s+')
  const re = new RegExp(pattern, 'g')
  const hits: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    hits.push({ start: match.index, end: match.index + match[0].length })
    if (match[0].length === 0) re.lastIndex += 1
  }

  if (hits.length === 1) return hits[0]
  if (hits.length > 1) {
    return { error: `find 匹配到 ${hits.length} 处，请引用更长的原文` }
  }
  return { error: 'find 在原文中找不到' }
}

function isNearlyWholeSection(source: string, find: string): boolean {
  const sourceLen = collapseWhitespace(source).length
  const findLen = collapseWhitespace(find).length
  if (sourceLen === 0) return false
  return findLen >= sourceLen * 0.85
}

export function parseOptimizePatch(raw: string): { ok: true; ops: OptimizePatchOp[] } | { ok: false; error: string } {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: '补丁不是合法 JSON' }
    try {
      data = JSON.parse(match[0])
    } catch {
      return { ok: false, error: '补丁不是合法 JSON' }
    }
  }

  if (!data || typeof data !== 'object') return { ok: false, error: '补丁格式无效' }
  const opsRaw = (data as { ops?: unknown }).ops
  if (!Array.isArray(opsRaw)) return { ok: false, error: '缺少 ops 数组' }

  const ops: OptimizePatchOp[] = []
  for (const item of opsRaw) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'ops 中含无效条目' }
    const record = item as { op?: unknown; find?: unknown; with?: unknown }
    const op = typeof record.op === 'string' ? record.op.trim() : ''
    const find = typeof record.find === 'string' ? record.find : ''
    if (op !== 'replace' && op !== 'insert_after' && op !== 'delete') {
      return { ok: false, error: `未知操作「${op || '空'}」` }
    }
    if (!find.trim()) return { ok: false, error: 'find 为空' }
    ops.push({
      op,
      find,
      with: typeof record.with === 'string' ? record.with : undefined
    })
  }

  return { ok: true, ops }
}

export function applyOptimizePatch(
  source: string,
  ops: OptimizePatchOp[],
  options?: OptimizePatchApplyOptions
): OptimizePatchResult {
  const allowed = options?.allowedOps
  let text = source

  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]
    const label = `第 ${index + 1} 条`

    if (allowed && !allowed.includes(op.op)) {
      return { ok: false, error: `${label}不允许 ${op.op}` }
    }

    if ((op.op === 'replace' || op.op === 'insert_after') && !op.with?.trim()) {
      return { ok: false, error: `${label}的 with 不能为空` }
    }

    if (op.op === 'replace' && options?.shortReplaceOnly && wordCount(op.find) > SHORT_REPLACE_MAX_WORDS) {
      return { ok: false, error: `${label}替换范围过长，文本优化只允许改短句` }
    }

    if (op.op === 'delete' && isNearlyWholeSection(text, op.find)) {
      return { ok: false, error: `${label}范围过大，禁止删除整节` }
    }

    const span = findUniqueSpan(text, op.find)
    if ('error' in span) return { ok: false, error: `${label}：${span.error}` }

    if (op.op === 'delete') {
      text = `${text.slice(0, span.start)}${text.slice(span.end)}`
      continue
    }

    if (op.op === 'replace') {
      text = `${text.slice(0, span.start)}${repairBrokenAtxHeadings(op.with!)}${text.slice(span.end)}`
      continue
    }

    const insertion = repairBrokenAtxHeadings(op.with!.trim())
    const gap = text.slice(span.end, span.end + 2).startsWith('\n') ? '\n' : '\n\n'
    text = `${text.slice(0, span.end)}${gap}${insertion}${text.slice(span.end)}`
  }

  if (source.trim() && !text.trim()) {
    return { ok: false, error: '补丁删空了本节' }
  }

  return { ok: true, ops, text: repairBrokenAtxHeadings(text) }
}

export function resolveOptimizePatch(
  raw: string,
  source: string,
  options?: OptimizePatchApplyOptions
): OptimizePatchResult {
  const parsed = parseOptimizePatch(raw)
  if (!parsed.ok) return parsed
  return applyOptimizePatch(source, parsed.ops, options)
}

export function patchOptionsForAction(
  action: 'text_polish' | 'content_revise' | 'delete_only'
): OptimizePatchApplyOptions {
  if (action === 'text_polish') {
    return { allowedOps: ['replace'], shortReplaceOnly: true }
  }
  if (action === 'delete_only') {
    return { allowedOps: ['delete'] }
  }
  return { allowedOps: ['replace', 'insert_after', 'delete'] }
}

export function buildSectionPatchSystemPrompt(action: 'text_polish' | 'content_revise'): string {
  const opRule =
    action === 'text_polish'
      ? '只允许 op="replace"，且 find 必须是底稿中的短句（不要整段或整节替换）。'
      : '允许 op="replace" | "insert_after" | "delete"。delete 的 find 必须是底稿中的原句，禁止删除整节或可用的 how-to 步骤。'

  return [
    '你是 SEO/GEO 内容编辑。根据编辑说明对底稿打补丁，不要重写整节。',
    '只输出 JSON：{"ops":[{"op":"replace","find":"原文原句","with":"替换后的句子"}]}',
    '没有需要改的地方时输出 {"ops":[]}。',
    'find 必须是底稿里能唯一匹配的连续原文，优先整句引用，不要改写 find 本身。',
    opRule,
    'with 只放替换或插入的 Markdown 正文，不要包含本节 ## 标题，不要解释。',
    '禁止把标题写成列表或行内代码：不要输出 `- ## 标题` 或 `` `## 标题` ``。'
  ].join('\n')
}

export function buildDeleteOnlyPatchSystemPrompt(): string {
  return [
    '你是文章长度编辑。文章偏长，只允许删除重复或低价值原句。',
    '只输出 JSON：{"ops":[{"op":"delete","find":"要删除的原文原句"}]}',
    'find 必须是正文中能唯一匹配的原句。禁止 replace、禁止 insert_after、禁止改标题、禁止重写段落。',
    '不要删除整节，不要删除仍可用的操作步骤。若没有安全可删的句子，输出 {"ops":[]}。'
  ].join('\n')
}
