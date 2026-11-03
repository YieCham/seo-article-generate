import { parseH2Sections, progressTitlesMatch } from '../../shared/articleProgress'
import {
  previewLengthHunkText,
  type LengthHunk,
  type LengthWorkbenchState
} from '../../shared/lengthWorkbench'
import { normalizeArticleMarkdown, stripOuterCodeFence } from '../../shared/normalizeArticleMarkdown'
import {
  countArticleWords,
  isConclusionSection,
  isFaqSection,
  isIntroductionSection,
  MAX_FAQ_SECTION_WORDS,
  MAX_INTRO_CONCLUSION_WORDS
} from './articleLength'
import { isAbortError } from './articleRunRegistry'
import {
  applyOptimizePatchBestEffort,
  buildDeleteOnlyPatchSystemPrompt,
  buildInsertAfterPatchSystemPrompt,
  parseOptimizePatch,
  patchOptionsForAction,
  validateOptimizeSectionIntegrity,
  type OptimizePatchOp
} from './optimizePatch'
import { chatCompletion, createRateLimitRetryStatus, type LlmConfig } from './llmClient'

type LengthStatusEmit = (event: { type: 'status'; step: 'length'; message: string }) => void

const MAX_QA_WORDS = 100
const MAX_SECTIONS_SHRINK = 3
const LARGE_SHRINK_RATIO = 0.3
const MAX_SECTIONS_EXPAND = 2
const MAX_OPS_PER_SECTION = 5
const MAX_ROUNDS = 2

export type LengthSectionKind = 'qa' | 'intro' | 'faq' | 'conclusion' | 'howto' | 'body'

interface ArticleLanguageContext {
  lock: string
  label: string
}

interface LengthSection {
  title: string
  body: string
  words: number
  kind: LengthSectionKind
}

interface ArticleParts {
  prefix: string
  h1: string
  leadIn: string
  sections: LengthSection[]
}

export function isHowToLengthSection(title: string, body: string): boolean {
  const ctx = `${title}\n${body}`
  if (/step[\s-]?by[\s-]?step|tutorial|how[\s-]?to\b/i.test(ctx)) return true
  if (/^step\s*\d+/im.test(body)) return true
  const numbered = body.match(/^\s*\d+\.\s+/gm)?.length ?? 0
  return numbered >= 3
}

export function classifyLengthSection(title: string, body: string): LengthSectionKind {
  if (/quick answer|key takeaways/i.test(title)) return 'qa'
  if (isIntroductionSection(title)) return 'intro'
  if (isFaqSection(title)) return 'faq'
  if (isConclusionSection(title)) return 'conclusion'
  if (isHowToLengthSection(title, body)) return 'howto'
  return 'body'
}

function sectionCap(kind: LengthSectionKind): number | null {
  if (kind === 'qa') return MAX_QA_WORDS
  if (kind === 'intro' || kind === 'conclusion') return MAX_INTRO_CONCLUSION_WORDS
  if (kind === 'faq') return MAX_FAQ_SECTION_WORDS
  return null
}

function splitArticleParts(markdown: string): ArticleParts {
  let text = normalizeArticleMarkdown(markdown.trim())
  let prefix = ''
  const seoMetaMatch = text.match(/^(## SEO Meta[\s\S]*?\n---\n+)/i)
  if (seoMetaMatch) {
    prefix = seoMetaMatch[1]
    text = text.slice(prefix.length).trimStart()
  }

  let h1 = ''
  const h1Match = text.match(/^(#\s[^\n]+\n+)/)
  if (h1Match) {
    h1 = h1Match[1]
    text = text.slice(h1Match[1].length).trimStart()
  }

  const firstH2 = text.search(/^##(?!#)\s+/m)
  const leadIn = firstH2 > 0 ? text.slice(0, firstH2).trim() : ''
  const parsed = parseH2Sections(text)
  const sections = parsed.map((item) => {
    const body = item.body.trim()
    return {
      title: item.title,
      body,
      words: countArticleWords(body),
      kind: classifyLengthSection(item.title, body)
    }
  })
  return { prefix, h1, leadIn, sections }
}

function joinArticleParts(parts: ArticleParts): string {
  const body = [
    parts.leadIn,
    ...parts.sections.map((section) => {
      const bodyText = section.body.trim()
      return bodyText ? `## ${section.title}\n\n${bodyText}` : `## ${section.title}`
    })
  ]
    .filter(Boolean)
    .join('\n\n')
  const h1Block = parts.h1.trimEnd()
  const headed = [h1Block, body].filter(Boolean).join('\n\n').trim()
  return [parts.prefix.trimEnd(), headed].filter(Boolean).join('\n\n').trim()
}

function isProtectedOp(op: OptimizePatchOp): boolean {
  const chunks = [op.find, op.with ?? '']
  return chunks.some(
    (chunk) =>
      /^#{1,6}\s/m.test(chunk) ||
      /\[Image:/i.test(chunk) ||
      /^\s*\|.+\|/m.test(chunk) ||
      /^step\s*\d+/im.test(chunk)
  )
}

function filterPatchOps(ops: OptimizePatchOp[], action: 'shrink' | 'expand'): OptimizePatchOp[] {
  const allowed = action === 'shrink' ? new Set(['delete']) : new Set(['insert_after'])
  return ops
    .filter((op) => allowed.has(op.op) && !isProtectedOp(op))
    .slice(0, MAX_OPS_PER_SECTION)
}

export interface LengthShrinkTarget {
  title: string
  removeWords: number
}

function isLargeShrink(sectionWords: number, removeWords: number): boolean {
  return sectionWords > 0 && removeWords / sectionWords >= LARGE_SHRINK_RATIO
}

function clampRemoveWords(sectionWords: number, requested: number): number {
  const keep = Math.min(40, Math.floor(sectionWords * 0.4))
  return Math.max(0, Math.min(requested, sectionWords - keep))
}

function sameSectionTitle(left: string, right: string): boolean {
  return progressTitlesMatch(left, right) && left.trim().length === right.trim().length
}

function matchFocusSections(sections: LengthSection[], focusTitles: string[]): LengthSection[] {
  const used = new Set<string>()
  const picked: LengthSection[] = []
  for (const title of focusTitles) {
    const exact = sections.find(
      (section) => !used.has(section.title) && sameSectionTitle(section.title, title)
    )
    const fuzzy = sections.filter(
      (section) => !used.has(section.title) && progressTitlesMatch(section.title, title)
    )
    const match = exact ?? (fuzzy.length === 1 ? fuzzy[0] : undefined)
    if (!match || match.words <= 0) continue
    used.add(match.title)
    picked.push(match)
  }
  return picked
}

export function pickLengthPatchTargets(
  sections: LengthSection[],
  action: 'shrink' | 'expand',
  excludeTitles: Set<string>,
  focusTitles: string[] = []
): LengthSection[] {
  const available = sections.filter(
    (section) => !excludeTitles.has(section.title) && section.words > 0
  )
  if (available.length === 0) return []

  if (action === 'shrink' && focusTitles.length > 0) {
    return matchFocusSections(available, focusTitles)
  }

  if (action === 'shrink') {
    const overCap = available
      .filter((section) => {
        const cap = sectionCap(section.kind)
        return cap != null && section.words > cap
      })
      .sort((a, b) => b.words - a.words)
    const rest = available
      .filter((section) => !overCap.includes(section) && section.words >= 80)
      .sort((a, b) => b.words - a.words)
    const ranked = [
      ...overCap,
      ...rest.filter((section) => section.kind !== 'howto'),
      ...rest.filter((section) => section.kind === 'howto')
    ]
    return ranked.slice(0, MAX_SECTIONS_SHRINK)
  }

  const flex = available
    .filter((section) => section.kind === 'body' || section.kind === 'howto')
    .filter((section) => section.words >= 40)
    .sort((a, b) => a.words - b.words)
  const preferred = flex.filter((section) => section.kind === 'body')
  const pool = preferred.length > 0 ? preferred : flex
  return pool.slice(0, MAX_SECTIONS_EXPAND)
}

function hunkFromOp(
  op: OptimizePatchOp,
  sectionTitle: string,
  id: string
): LengthHunk | null {
  if (op.op !== 'delete' && op.op !== 'insert_after') return null
  const find = op.find.trim()
  if (!find) return null
  const inserted = op.op === 'insert_after' ? (op.with ?? '').trim() : ''
  const wordDelta =
    op.op === 'delete' ? -countArticleWords(find) : countArticleWords(inserted)
  return {
    id,
    op: op.op,
    sectionTitle,
    find,
    with: inserted || undefined,
    wordDelta,
    preview: previewLengthHunkText(inserted || find)
  }
}

async function requestSectionPatch(
  llm: LlmConfig,
  section: LengthSection,
  action: 'shrink' | 'expand',
  wordGoal: number,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  maxTokens: number | undefined,
  emit: LengthStatusEmit
): Promise<OptimizePatchOp[]> {
  const statusMessage =
    action === 'expand'
      ? `⑨ 词数校准：为「${section.title}」补大约 ${wordGoal} 词…`
      : `⑨ 词数校准：为「${section.title}」删大约 ${wordGoal} 词…`

  emit({ type: 'status', step: 'length', message: statusMessage })

  let requestError = ''
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          action === 'expand' ? buildInsertAfterPatchSystemPrompt() : buildDeleteOnlyPatchSystemPrompt(),
          articleLang.lock,
          '只改下面这一节的正文。find 必须能在本节中唯一匹配。'
        ].join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题/页面：${topicLabel}`,
          `章节：${section.title}`,
          `本节现有 ${section.words} 词。`,
          action === 'expand'
            ? `请 insert_after 大约 ${wordGoal} 个英文词的实质内容。`
            : `请 delete 大约 ${wordGoal} 个英文词的重复或低价值原句。`,
          '',
          section.body
        ].join('\n')
      }
    ],
    {
      temperature: 0.2,
      jsonObject: true,
      maxTokens: Math.min(2048, maxTokens ?? 2048),
      step: 'length',
      label: action === 'expand' ? '词数扩写补丁' : '词数删减补丁',
      cacheSystemPrefix: true,
      onRateLimitRetry: createRateLimitRetryStatus(statusMessage, (message) =>
        emit({ type: 'status', step: 'length', message })
      )
    }
  ).catch((error: unknown) => {
    if (isAbortError(error)) throw error
    requestError = error instanceof Error ? error.message : '未知错误'
    return null
  })

  if (raw == null) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：章节「${section.title}」调用失败（${requestError || '未知错误'}），已跳过`
    })
    return []
  }

  const parsed = parseOptimizePatch(raw)
  if (!parsed.ok) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：章节「${section.title}」补丁无效（${parsed.error}），已跳过`
    })
    return []
  }

  return filterPatchOps(parsed.ops, action)
}

async function condenseSection(
  llm: LlmConfig,
  section: LengthSection,
  targetWords: number,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  maxTokens: number | undefined,
  emit: LengthStatusEmit
): Promise<string | null> {
  const statusMessage = `⑨ 词数校准：大幅消减「${section.title}」，并优化删后的行文…`
  emit({ type: 'status', step: 'length', message: statusMessage })

  let requestError = ''
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是文章编辑。把这一节压缩到指定词数，并让压缩后的正文读起来连贯。',
          articleLang.lock,
          '保留原有事实、图片 Markdown、表格和仍可用的操作步骤。',
          '删掉重复、铺垫和低价值句子后，重写衔接，避免留下残句或空步骤。',
          '不要新增事实，不要输出本节 ## 标题，不要解释。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `主题/页面：${topicLabel}`,
          `章节：${section.title}`,
          `本节现有 ${section.words} 词，请压缩到大约 ${targetWords} 词。`,
          '',
          section.body
        ].join('\n')
      }
    ],
    {
      temperature: 0.2,
      maxTokens: Math.min(4096, maxTokens ?? 4096),
      step: 'length',
      label: '大幅消减并优化',
      cacheSystemPrefix: true,
      onRateLimitRetry: createRateLimitRetryStatus(statusMessage, (message) =>
        emit({ type: 'status', step: 'length', message })
      )
    }
  ).catch((error: unknown) => {
    if (isAbortError(error)) throw error
    requestError = error instanceof Error ? error.message : '未知错误'
    return null
  })

  if (raw == null) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：章节「${section.title}」优化失败（${requestError || '未知错误'}），已跳过`
    })
    return null
  }

  const text = stripOuterCodeFence(raw).replace(/^##\s+[^\n]+\n+/, '').trim()
  const integrityError = validateOptimizeSectionIntegrity(section.body, text, [])
  if (!text || integrityError || countArticleWords(text) >= section.words) {
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：章节「${section.title}」消减结果不可用${integrityError ? `（${integrityError}）` : ''}，已跳过`
    })
    return null
  }
  return text
}

function workbenchOf(
  status: LengthWorkbenchState['status'],
  words: number,
  bounds: { min: number; max: number; label: string },
  hunks: LengthHunk[],
  baseline?: string
): LengthWorkbenchState {
  return {
    status,
    words,
    min: bounds.min,
    max: bounds.max,
    label: bounds.label,
    hunks,
    pending: hunks.length > 0,
    baseline
  }
}

export async function calibrateArticleLengthBySection(input: {
  llm: LlmConfig
  article: string
  topicLabel: string
  articleLang: ArticleLanguageContext
  bounds: { min: number; max: number; label: string }
  maxTokens?: number
  focusShrinks?: LengthShrinkTarget[]
  emit: LengthStatusEmit
}): Promise<{ article: string; workbench: LengthWorkbenchState }> {
  const original = normalizeArticleMarkdown(input.article.trim())
  const startCount = countArticleWords(original)
  const { min, max, label } = input.bounds
  const chosen = (input.focusShrinks ?? []).filter((item) => item.removeWords > 0)
  const parts = splitArticleParts(original)
  if (parts.sections.length === 0) {
    input.emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：程序计数 ${startCount} 词，无 H2 章节可打补丁，已保留正文`
    })
    return {
      article: original,
      workbench: workbenchOf('skipped', startCount, input.bounds, [])
    }
  }

  if (chosen.length === 0 && startCount >= min && startCount <= max) {
    return {
      article: original,
      workbench: workbenchOf('in_range', startCount, input.bounds, [])
    }
  }

  const hunks: LengthHunk[] = []
  const touched = new Set<string>()
  let current = original

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const count = countArticleWords(current)
    if (chosen.length > 0) {
      if (round > 0) break
    } else if (count >= min && count <= max) {
      break
    }

    const action: 'shrink' | 'expand' = chosen.length > 0 || count > max ? 'shrink' : 'expand'
    const parsed = splitArticleParts(current)
    const targets = pickLengthPatchTargets(
      parsed.sections,
      action,
      touched,
      chosen.map((item) => item.title)
    )
    if (targets.length === 0) {
      if (chosen.length > 0 && hunks.length === 0) {
        input.emit({
          type: 'status',
          step: 'length',
          message: '⑨ 词数校准：所选章节未在正文中找到，已保留原文'
        })
      }
      break
    }

    const remaining = action === 'shrink' ? Math.max(0, count - max) : min - count

    input.emit({
      type: 'status',
      step: 'length',
      message:
        chosen.length > 0
          ? `⑨ 词数校准：按所选 ${targets.length} 个章节消减…`
          : `⑨ 词数校准：程序计数 ${count} 词 → 目标 ${label}，按 ${targets.length} 个章节打补丁…`
    })

    let changed = false
    for (const target of targets) {
      const live = parsed.sections.find((item) => item.title === target.title)
      if (!live) continue
      touched.add(live.title)
      const requested =
        chosen.find((item) => sameSectionTitle(item.title, live.title) || progressTitlesMatch(item.title, live.title))
          ?.removeWords ?? 0
      const removeWords = requested > 0 ? clampRemoveWords(live.words, requested) : 0
      if (chosen.length > 0 && removeWords <= 0) {
        input.emit({
          type: 'status',
          step: 'length',
          message: `⑨ 词数校准：章节「${live.title}」可消减空间不足，已跳过`
        })
        continue
      }

      if (removeWords > 0 && isLargeShrink(live.words, removeWords)) {
        const condensed = await condenseSection(
          input.llm,
          live,
          Math.max(40, live.words - removeWords),
          input.topicLabel,
          input.articleLang,
          input.maxTokens,
          input.emit
        )
        if (!condensed) continue
        hunks.push({
          id: `hunk-${hunks.length}`,
          op: 'replace',
          sectionTitle: live.title,
          find: live.body,
          with: condensed,
          wordDelta: countArticleWords(condensed) - live.words,
          preview: previewLengthHunkText(condensed)
        })
        live.body = condensed
        live.words = countArticleWords(live.body)
        changed = true
        continue
      }

      const perSection = Math.max(40, Math.ceil(remaining / targets.length))
      const wordGoal = removeWords > 0 ? removeWords : action === 'shrink' ? Math.min(120, perSection) : Math.min(180, perSection)

      const ops = await requestSectionPatch(
        input.llm,
        live,
        action,
        wordGoal,
        input.topicLabel,
        input.articleLang,
        input.maxTokens,
        input.emit
      )
      if (ops.length === 0) continue

      const applied = applyOptimizePatchBestEffort(
        live.body,
        ops,
        action === 'shrink' ? patchOptionsForAction('delete_only') : { allowedOps: ['insert_after'] }
      )
      if (applied.applied.length === 0) {
        input.emit({
          type: 'status',
          step: 'length',
          message: `⑨ 词数校准：章节「${live.title}」补丁未能落地，已跳过`
        })
        continue
      }

      live.body = applied.text.trim()
      live.words = countArticleWords(live.body)
      for (const op of applied.applied) {
        const hunk = hunkFromOp(op, live.title, `hunk-${hunks.length}`)
        if (hunk) hunks.push(hunk)
      }
      changed = true
    }

    if (changed) {
      current = normalizeArticleMarkdown(joinArticleParts(parsed))
    } else {
      break
    }
  }

  const nextCount = countArticleWords(current)
  if (hunks.length === 0 || current.trim() === original.trim()) {
    input.emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：程序计数 ${startCount} 词，补丁未能落地，已保留校准前正文`
    })
    return {
      article: original,
      workbench: workbenchOf('skipped', startCount, input.bounds, [])
    }
  }

  const inRange = nextCount >= min && nextCount <= max
  input.emit({
    type: 'status',
    step: 'length',
    message: inRange
      ? `⑨ 词数校准：${startCount} → ${nextCount} 词，已按 ${hunks.length} 处补丁落入 ${label}`
      : `⑨ 词数校准：${startCount} → ${nextCount} 词（目标 ${label}），已应用 ${hunks.length} 处补丁`
  })

  return {
    article: current,
    workbench: workbenchOf('patched', nextCount, input.bounds, hunks, original)
  }
}
