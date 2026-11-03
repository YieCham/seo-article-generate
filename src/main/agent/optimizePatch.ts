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
  /** Reject patches that leave a step marker empty or silently lose an image. */
  preserveStructuralIntegrity?: boolean
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

interface StepMarker {
  number: number
  hasBody: boolean
}

function parseStepMarkers(markdown: string): StepMarker[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const result: StepMarker[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const plain = lines[index]
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const match = plain.match(/^step\s*(\d+)\s*[.)：:]?\s*(.*)$/i)
    if (!match) continue

    let hasBody = Boolean(match[2].trim())
    if (!hasBody) {
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const next = lines[cursor].trim()
        if (!next) continue
        if (
          /^(?:#{1,6}\s+|(?:[-*_]\s*){3,}$)/.test(next) ||
          /^step\s*\d+/i.test(next.replace(/[*_`]/g, '').trim())
        ) {
          break
        }
        hasBody = true
        break
      }
    }

    result.push({ number: Number(match[1]), hasBody })
  }

  return result
}

function imageTargets(markdown: string): string[] {
  const targets: string[] = []
  for (const match of markdown.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g)) {
    targets.push(match[1])
  }
  return targets
}

function emptyHeadingCount(markdown: string): number {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^#{1,6}\s*(?:[*_`]|\s)*$/.test(line.trim())).length
}

export function validateOptimizeSectionIntegrity(
  source: string,
  result: string,
  ops: OptimizePatchOp[]
): string | null {
  const beforeSteps = parseStepMarkers(source)
  const afterSteps = parseStepMarkers(result)
  const occurrence = new Map<number, number>()

  for (const step of afterSteps) {
    const ordinal = occurrence.get(step.number) ?? 0
    occurrence.set(step.number, ordinal + 1)
    if (step.hasBody) continue
    const beforeSame = beforeSteps.filter((item) => item.number === step.number)[ordinal]
    if (!beforeSame || beforeSame.hasBody) {
      return `补丁导致 Step ${step.number} 只剩编号、没有步骤正文`
    }
  }

  if (emptyHeadingCount(result) > emptyHeadingCount(source)) {
    return '补丁产生了空标题'
  }

  const afterImages = new Set(imageTargets(result))
  const explicitlyEdited = ops.map((op) => op.find).join('\n')
  for (const target of imageTargets(source)) {
    if (!afterImages.has(target) && !explicitlyEdited.includes(target)) {
      return `补丁意外移除了图片：${target}`
    }
  }

  return null
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

  const repaired = repairBrokenAtxHeadings(text)
  if (options?.preserveStructuralIntegrity) {
    const integrityError = validateOptimizeSectionIntegrity(source, repaired, ops)
    if (integrityError) return { ok: false, error: integrityError }
  }

  return { ok: true, ops, text: repaired }
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

/** Apply each op independently so one bad `find` does not drop the rest. */
export function applyOptimizePatchBestEffort(
  source: string,
  ops: OptimizePatchOp[],
  options?: OptimizePatchApplyOptions
): { text: string; applied: OptimizePatchOp[]; skipped: number } {
  let text = source
  const applied: OptimizePatchOp[] = []
  let skipped = 0
  for (const op of ops) {
    const result = applyOptimizePatch(text, [op], options)
    if (result.ok) {
      text = result.text
      applied.push(op)
    } else {
      skipped += 1
    }
  }
  return { text, applied, skipped }
}

export function patchOptionsForAction(
  action: 'text_polish' | 'content_revise' | 'delete_only'
): OptimizePatchApplyOptions {
  if (action === 'text_polish') {
    return {
      allowedOps: ['replace'],
      shortReplaceOnly: true,
      preserveStructuralIntegrity: true
    }
  }
  if (action === 'delete_only') {
    return { allowedOps: ['delete'], preserveStructuralIntegrity: true }
  }
  return {
    allowedOps: ['replace', 'insert_after', 'delete'],
    preserveStructuralIntegrity: true
  }
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
    '若编辑 Step N 步骤，必须保留该步骤的实质说明；禁止留下只有 “Step N.” 的空步骤。删除失效步骤时，find 必须同时包含步骤编号与完整步骤正文。',
    '不得无意删除原文图片；确需随失效内容删除图片时，find 必须完整包含该图片 Markdown。',
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

export function buildInsertAfterPatchSystemPrompt(): string {
  return [
    '你是文章长度编辑。本节偏短，只允许在原句之后插入实质内容。',
    '只输出 JSON：{"ops":[{"op":"insert_after","find":"本节中能唯一匹配的原句","with":"要插入的新段落"}]}',
    'find 必须是本节正文里的连续原文，优先整句引用，不要改写 find 本身。',
    'with 是 1–3 句对读者有用的补充（操作细节、例子、注意点、适用场景），禁止空话、禁止重复已有句子。',
    '禁止 delete、禁止 replace、禁止改标题、禁止输出 ## 标题、禁止改动表格和 [Image: …] 占位符、禁止改 how-to 步骤编号。',
    '没有合适位置则 {"ops":[]}。'
  ].join('\n')
}
