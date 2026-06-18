import { parseTopListCount, shouldApplyTopListStructure } from './topListStructure'
import { shouldApplyReviewStructure } from './reviewStructure'
import type { ArticleLengthBounds } from './articleLength'

export function buildOutlineSkeletonRules(wordBounds: ArticleLengthBounds): string {
  return [
    '【大纲输出格式 — 必须遵守】',
    '- 这是**结构骨架**，不是正文；后续 Pipeline 会按 ## 章节逐节撰写全文。',
    '- 只允许：## / ### 标题 + 每节 **3–5 条** bullet 要点（每条 ≤20 英文词或 ≤35 中文字）。',
    '- **禁止**：完整段落、Pros/Cons 正文、分步教程细节、FAQ 答案、对比表单元格、引言/结论正文。',
    '- FAQ：只写问题句（以 ? 结尾），不写答案。',
    '- Quick Answer / Introduction / Conclusion：各 **2–3 条** bullet 即可，不要写段落。',
    `- 全文终稿目标 ${wordBounds.min}–${wordBounds.max} 词；**本大纲本身**控制在约 600 英文词以内。`,
    '- 不要复述 Skills 全文，不要输出 <thinking> 标签。'
  ].join('\n')
}

export function buildPlanSkeletonRules(): string {
  return [
    '【规划输出格式 — 必须遵守】',
    '- 在 <thinking> 与 </thinking> 内输出**战略层规划**，不要写正文、不要写 ## 章节大纲。',
    '- 用 bullet 列表；每点简洁；总篇幅约 **400–600 英文词**。',
    '- FAQ 只列问题句，不写答案。',
    '- 章节只写 Part 名称 + 1 句目的，不要展开成稿。'
  ].join('\n')
}

export function compactInternalPlan(plan: string, maxChars = 2400): string {
  const inner = plan.replace(/<\/?thinking>/gi, '').trim()
  if (inner.length <= maxChars) return inner
  return `${inner.slice(0, maxChars)}\n…（规划已截断，细节见写作简报）`
}

export function estimateOutlineSectionCount(topic: string, skillsText: string): number {
  if (shouldApplyTopListStructure(skillsText)) {
    return Math.min(12, parseTopListCount(topic) + 5)
  }
  if (shouldApplyReviewStructure(skillsText)) return 9
  return 6
}

/** Strip prose leaked into outline; keep headers, short bullets, ### product stubs. */
export function enforceOutlineSkeleton(outline: string): string {
  const lines = outline.split('\n')
  const out: string[] = []
  let bulletsUnderSection = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push('')
      bulletsUnderSection = 0
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      bulletsUnderSection = 0
      out.push(line)
      continue
    }

    if (/^\[Image:/i.test(trimmed)) {
      out.push(line)
      continue
    }

    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const capped = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed
      if (bulletsUnderSection < 5) {
        out.push(capped)
        bulletsUnderSection += 1
      }
      continue
    }

    if (trimmed.length > 90) {
      if (bulletsUnderSection < 5) {
        out.push(`- ${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}`)
        bulletsUnderSection += 1
      }
      continue
    }

    if (bulletsUnderSection < 5) {
      out.push(trimmed.startsWith('-') ? trimmed : `- ${trimmed}`)
      bulletsUnderSection += 1
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
