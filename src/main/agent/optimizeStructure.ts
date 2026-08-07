import { countArticleWords as countWords, isFaqSection } from './articleLength'
import { MULTI_METHOD_POLISH_PRESERVATION_HINT } from './outlineSkeleton'
import { MULTI_METHOD_STRUCTURE_PRESERVE_RULE } from './articleStructurePreserve'
import { parseOutlineSections } from './llmClient'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'
import { filterJunkSourceSections } from './optimizeSectionSanitize'

export type OutlineSection = { title: string; body: string }

export { countWords }

export const INCREMENTAL_UPDATE_GUIDANCE = `
【Content-Aware Optimization — Evaluate First, Then Edit】
Optimization is **not** "always add more." Judge each passage/section on its own merits:

**KEEP + ENHANCE (excellent / accurate / EEAT-strong):**
- Preserve helpful, current, experience-rich sentences and the existing H2/H3 structure
- **Incrementally add** competitor/diagnosis gaps that strengthen already-good sections (new bullets, short paragraphs, missing FAQ angles)
- Do not rewrite strong passages for style alone

**ADD (missing high-value content):**
- Incorporate competitor/diagnosis points the source lacks (steps, tips, data, use cases)
- Insert into the **most relevant existing section**, or add a **new H2** when the audit marks [新增 H2] / [NEW H2]
- Prefer specific, actionable additions the reader can use immediately

**REMOVE (outdated / unusable / EEAT-weak) — narrow, evidence-based only:**
- **Delete** only content you can justify as outdated, deprecated, broken, misleading, duplicated, or empty filler
- **Do NOT** delete usable how-to / product usage steps, numbered procedures, or UI walkthroughs merely because they are long, look old, or differ from a competitor page
- **Default for tutorials:** KEEP the original step sequence and count; fix wording locally; ADD missing tips beside steps — wholesale step deletion is a last resort
- **Replace** a single step only when it is demonstrably wrong; then swap in a current alternative — do not drop the whole procedure
- Shortening is valid for stale/harmful text — **not** for cutting working instructions to hit a word band

**Local REWRITE only when needed:**
- Fix unclear, weak, repetitive, or SEO-poor sentences — not whole sections by default
- Do not invent statistics, reviews, or claims absent from source/competitor analysis
`.trim()

export const SOURCE_PRESERVATION_GUIDANCE = `
【Source-First Editing — Keep What Works, Cut What Doesn't】
This task is **optimizing an existing page**, not drafting a brand-new article.

**Preserve when content is still strong:**
- Keep the source page's **H2/H3 order, section titles, accurate facts, how-to / product usage steps, lists, tables, and product names**
- Keep **wording and paragraph flow** when passages are accurate, helpful, current, and EEAT-aligned
- Treat the scraped Markdown as the **working draft**; edit in place
- **How-to / Step-by-step sections are high-value:** preserve step count and order unless a specific step is proven broken

**Act when audit/competitor/EEAT flags issues:**
- **Enhance** excellent sections with missing competitor/diagnosis value (incremental add)
- **Add new H2 sections** when the diagnosis explicitly recommends them (Quick Answer, FAQ, or [新增 H2] modules)
- **Remove** only outdated, invalid, misleading, or low-trust content — never strip an entire working tutorial by default
- **Replace** obsolete methods with current alternatives; fix grammar/clarity/SEO sentence by sentence where weak
- When the user selects a **promo product**, weave its name where natural — **do not** delete the source page's original product usage steps to make room for promotion

**Do NOT:**
- Rewrite entire sections in a new voice or impose a new-article Part template
- Replace the page with generic tutorial content unrelated to the source
- Add new H2 **not** backed by the diagnosis / competitor analysis
- Keep stale or EEAT-harmful text just to avoid shortening the page
- Delete or collapse original how-to / usage steps without concrete evidence they no longer work

**Per-section when original text is supplied:**
- Passages that remain valid: retain **most unchanged sentences** (rough guide ≥70% where no add/remove needed)
- Where audit marks **add**: write new helpful content into strong sections
- Where audit marks **remove**: delete only the flagged stale/harmful parts — never the whole usable procedure
`.trim()

export const EEAT_OPTIMIZE_GUIDANCE = `
【Optimization Principles — E-E-A-T Drives Keep / Add / Remove】
- Use the scraped source as **structural and factual baseline**; improve it for today's readers.
- **Keep & enhance** passages that show Experience, Expertise, or Trustworthiness and are still accurate.
- **Add** competitor/user-intent gaps that increase helpfulness and Trust — especially where existing sections are good but incomplete.
- **Remove** outdated, broken, misleading, or thin SEO filler — outdated or untrustworthy help **lowers** E-E-A-T.
- **Usable how-to steps raise E-E-A-T** — keep them unless a specific step is proven wrong.
- **Rewrite** only unclear or weak sentences — not whole sections by default.
- Final length should stay within **±20% of the source word count** when quality allows; quality beats word count.
- Language must stay 100% identical to the source page.
`.trim()

export interface AuditNewH2Section {
  title: string
  insertBefore?: string
  insertAfter?: string
}

export interface AuditOutlineSkeletonItem {
  title: string
  isNew: boolean
  insertBefore?: string
  insertAfter?: string
  /** e.g. "Part 1" when audit says 原 Part 1 */
  sourcePartHint?: string
}

function normalizeAuditH2Title(raw: string): string {
  return raw
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^[\d.]+\s*/, '')
    .replace(/^\[NEW H2\]\s*/i, '')
    .replace(/^\[新增\s*H2(?:\s*[:：][^\]]*)?\]\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s*[（(]原[^）)]*[）)]\s*/g, '')
    .trim()
}

/**
 * Parse the numbered「大纲骨架」list from the diagnosis — this is what the UI shows
 * and should drive drafting + H2 contract.
 */
export function parseAuditOutlineSkeleton(audit: string): AuditOutlineSkeletonItem[] {
  const skeletonMatch = audit.match(
    /(?:大纲骨架|优化后大纲)[\s\S]*?(?=\n##\s+\d+\.|\n##\s+[^#\d]|\n###\s+建议新增|\n---\s*\n>\s*\*\*文档结束|$)/i
  )
  if (!skeletonMatch) return []

  const items: AuditOutlineSkeletonItem[] = []
  const seen = new Set<string>()

  for (const rawLine of skeletonMatch[0].split('\n')) {
    const line = rawLine.trim()
    if (!/^\d+\.\s+/.test(line)) continue

    const isNew = /\[新增\s*H2|\[NEW H2\]/i.test(line)
    // Only「原 Part N」counts as source anchor — not insert-before/after Part mentions.
    const partHint = line.match(/原\s*(Part\s*\d+)/i)?.[1]

    let insertBefore: string | undefined
    let insertAfter: string | undefined
    const beforeMatch = line.match(/insert\s+\*\*before\*\*\s*[「"']?([^」"'\n|]+)[」"']?/i)
      || line.match(/insert\s+before\s*[「"']?([^」"'\n|]+)[」"']?/i)
    const afterMatch = line.match(/insert\s+\*\*after\*\*\s*[「"']?([^」"'\n|]+)[」"']?/i)
      || line.match(/insert\s+after\s*[「"']?([^」"'\n|]+)[」"']?/i)
    if (beforeMatch) insertBefore = beforeMatch[1].replace(/\*\*/g, '').trim()
    if (afterMatch) insertAfter = afterMatch[1].replace(/\*\*/g, '').trim()

    let title = line
      .replace(/^\d+\.\s+/, '')
      .replace(/`+/g, '')
      .replace(/\[新增\s*H2[^\]]*\]\s*/gi, '')
      .replace(/\[NEW H2\]\s*/gi, '')
      .replace(/\*\*/g, '')
      .replace(/\s*[|｜]\s*insert\s+.+$/i, '')
      .replace(/\s*[（(][^）)]*[）)]\s*$/g, '')
      .trim()

    title = normalizeAuditH2Title(title)
    if (title.length < 3) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    items.push({
      title,
      isNew,
      insertBefore,
      insertAfter,
      sourcePartHint: partHint?.replace(/\s+/g, ' ')
    })
  }

  return items
}

function findSourceSectionForSkeletonItem(
  item: AuditOutlineSkeletonItem,
  sourceSections: OutlineSection[]
): OutlineSection | undefined {
  if (item.sourcePartHint) {
    const hint = item.sourcePartHint.toLowerCase()
    const byPart = sourceSections.find((section) =>
      section.title.toLowerCase().includes(hint.toLowerCase())
    )
    if (byPart) return byPart
  }

  const exact = sourceSections.find(
    (section) => section.title.trim().toLowerCase() === item.title.trim().toLowerCase()
  )
  if (exact) return exact

  return sourceSections.find((section) => titleMatchesAnchor(section.title, item.title))
}

function materializeAuditOutlineSkeleton(
  skeleton: AuditOutlineSkeletonItem[],
  sourceSections: OutlineSection[]
): OutlineSection[] {
  const result: OutlineSection[] = []

  const place = (item: AuditOutlineSkeletonItem, section: OutlineSection): void => {
    if (item.insertBefore) {
      const idx = result.findIndex((entry) => titleMatchesAnchor(entry.title, item.insertBefore!))
      if (idx >= 0) {
        result.splice(idx, 0, section)
        return
      }
    }
    if (item.insertAfter) {
      const idx = result.findIndex((entry) => titleMatchesAnchor(entry.title, item.insertAfter!))
      if (idx >= 0) {
        result.splice(idx + 1, 0, section)
        return
      }
    }
    result.push(section)
  }

  for (const item of skeleton) {
    if (item.isNew) {
      place(item, {
        title: item.title,
        body: '- NEW (audit skeleton): write full section per diagnosis ADD items for this H2'
      })
      continue
    }

    const source = findSourceSectionForSkeletonItem(item, sourceSections)
    place(item, {
      title: item.title,
      body: source?.body?.trim()
        ? source.body
        : '- Same theme as source — preserve strong sentences; apply audit KEEP/ADD/REMOVE'
    })
  }

  return result
}

function titleMatchesAnchor(sectionTitle: string, anchor: string): boolean {
  const section = sectionTitle.trim().toLowerCase()
  const needle = anchor.trim().toLowerCase().replace(/[「」"']/g, '')
  if (!needle) return false
  return section.includes(needle) || needle.includes(section)
}

/** Extract diagnosis-recommended new H2 sections from audit markdown. */
export function parseAuditRecommendedH2s(audit: string): AuditNewH2Section[] {
  const results: AuditNewH2Section[] = []
  const seen = new Set<string>()

  const add = (rawTitle: string, opts?: Partial<AuditNewH2Section>): void => {
    const title = normalizeAuditH2Title(rawTitle)
    if (title.length < 8) return
    const key = title.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    results.push({ title, ...opts })
  }

  for (const match of audit.matchAll(
    /\*\*\[新增\s*H2(?:\s*[:：][^\]]*)?\]\s*([^*\n]+?)\*\*/gi
  )) {
    add(match[1])
  }

  for (const match of audit.matchAll(
    /\*\*\[Part\s*(\d+)[^\]]*之前\]\s*([^*]+?)\*\*/gi
  )) {
    add(match[2], { insertBefore: `Part ${match[1]}` })
  }

  for (const match of audit.matchAll(
    /\*\*\[NEW H2\]\s*([^*(\n]+?)(?:\*\*|\()/gi
  )) {
    add(match[1])
  }

  for (const match of audit.matchAll(
    /(?:^|\n)\s*\d+\.\s+\*\*\[新增\s*H2\]\s*([^*(\n]+?)(?:\*\*|\()/gi
  )) {
    add(match[1])
  }

  for (const match of audit.matchAll(
    /(?:^|\n)\s*\d+\.\s+\*\*\[新增\s*H2[:：][^\]]*\]\s*([^*(\n]+?)(?:\*\*|\()/gi
  )) {
    add(match[1])
  }

  const skeletonMatch = audit.match(/(?:大纲骨架|优化后大纲)[\s\S]*?(?=\n###|\n## [^#]|$)/i)
  if (skeletonMatch) {
    for (const line of skeletonMatch[0].split('\n')) {
      if (!/\[新增\s*H2|\[NEW H2\]/i.test(line)) continue
      const titlePart = line
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/\[新增\s*H2[^\]]*\]\s*/i, '')
        .replace(/\[NEW H2\]\s*/i, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
      if (titlePart) add(titlePart)
    }
  }

  return results
}

function resolveInsertIndex(
  sections: OutlineSection[],
  neu: AuditNewH2Section
): number {
  if (neu.insertBefore) {
    const idx = sections.findIndex((item) => titleMatchesAnchor(item.title, neu.insertBefore!))
    if (idx >= 0) return idx
  }
  if (neu.insertAfter) {
    const idx = sections.findIndex((item) => titleMatchesAnchor(item.title, neu.insertAfter!))
    if (idx >= 0) return idx + 1
  }

  const faqIdx = sections.findIndex((item) => isFaqSection(item.title))
  if (faqIdx >= 0) return faqIdx

  const verdictIdx = sections.findIndex((item) => /^verdict$/i.test(item.title.trim()))
  if (verdictIdx >= 0) return verdictIdx

  return sections.length
}

function mergeAuditNewH2Sections(
  sourceSections: OutlineSection[],
  audit: string
): OutlineSection[] {
  const merged = sourceSections.map((section) => ({ ...section }))
  const recommended = parseAuditRecommendedH2s(audit)

  for (const neu of recommended) {
    const exists = merged.some(
      (item) => item.title.trim().toLowerCase() === neu.title.trim().toLowerCase()
    )
    if (exists) continue

    const idx = resolveInsertIndex(merged, neu)
    merged.splice(idx, 0, {
      title: neu.title,
      body: '- NEW (audit): write this H2 per diagnosis ADD items; keep concise and helpful'
    })
  }

  return merged
}

export function isAuditRecommendedNewSection(title: string, audit: string): boolean {
  const normalized = title.trim().toLowerCase()
  return parseAuditRecommendedH2s(audit).some(
    (item) => item.title.trim().toLowerCase() === normalized
  )
}
export function getOptimizePromptBlocks(): string {
  return `${SOURCE_PRESERVATION_GUIDANCE}\n\n${INCREMENTAL_UPDATE_GUIDANCE}\n\n${EEAT_OPTIMIZE_GUIDANCE}`
}

export interface OptimizeWordRange {
  min: number
  max: number
  label: string
}

export function getOptimizeLengthPromptBlock(wordRange: OptimizeWordRange): string {
  return `
【Article Length — optimize mode (±20% of source)】
- The complete final article should stay within **${wordRange.min}–${wordRange.max} English words** ${wordRange.label}.
- Length may be verified programmatically — **quality beats word count**; do not pad or keep stale text to hit a number.
- **No per-paragraph word cap** — write naturally; only the full-article band above is the target.
- If under ${wordRange.min}: add genuinely helpful missing points from diagnosis/competitors — never pad with filler.
- If under min **because outdated/broken content was removed with evidence**: **do not** expand back toward the old length; do **not** restore deleted how-to steps.
- If over ${wordRange.max}: cut redundancy and low-value sentences — removing outdated content is valid even when the article becomes shorter than the source.
`.trim()
}

const OPTIMIZE_WORD_TOLERANCE = 0.2
/** Floor when quality REMOVE justifies staying under the ±20% min (relative to source). */
export const OPTIMIZE_QUALITY_SHORTEN_FLOOR_RATIO = 0.65

export interface OptimizeQualityShortenDecision {
  allowBelowMin: boolean
  reason: string
}

/**
 * When audit shows evidence-based REMOVE and the article shrank for quality,
 * allow finishing below the ±20% lower bound instead of padding.
 */
export function resolveOptimizeQualityShorten(options: {
  sourceWords: number
  articleWords: number
  bounds: Pick<OptimizeWordRange, 'min' | 'max'>
  audit?: string
}): OptimizeQualityShortenDecision {
  const { sourceWords, articleWords, bounds, audit = '' } = options
  if (articleWords >= bounds.min) {
    return { allowBelowMin: false, reason: '' }
  }

  const hasRemoveEvidence =
    /建议删减|REMOVE\s*\/\s*REPLACE|\bREMOVE\b|过时|不可用|失效|deprecated|outdated|no longer work/i.test(
      audit
    )
  if (!hasRemoveEvidence) {
    return { allowBelowMin: false, reason: '' }
  }

  const floor = Math.max(
    1,
    Math.floor(sourceWords * OPTIMIZE_QUALITY_SHORTEN_FLOOR_RATIO),
    Math.floor(bounds.min * 0.75)
  )

  if (articleWords >= floor) {
    return {
      allowBelowMin: true,
      reason: `诊断含有证据型删减，当前 ${articleWords} 词低于 ±20% 下限 ${bounds.min}，但高于质量下限 ${floor}，跳过注水扩写`
    }
  }

  return { allowBelowMin: false, reason: '' }
}
/** Lead-in between H1 and first H2 counts as Introduction when non-trivial. */
const MIN_LEAD_IN_WORDS = 3
const MIN_LEAD_IN_CHARS = 20

/** Programmatic word count in this band skips optimize length-adjust LLM step. */
export const OPTIMIZE_LENGTH_SKIP_MIN = 1100
export const OPTIMIZE_LENGTH_SKIP_MAX = 2500

export function shouldSkipOptimizeLengthAdjust(wordCount: number): boolean {
  return wordCount >= OPTIMIZE_LENGTH_SKIP_MIN && wordCount <= OPTIMIZE_LENGTH_SKIP_MAX
}

function hasIntroductionSection(sections: OutlineSection[]): boolean {
  return sections.some((item) => /^introduction$/i.test(item.title.trim()))
}

function isQuickAnswerSection(title: string): boolean {
  return /quick answer|key takeaways/i.test(title.trim())
}

function isConclusionSection(title: string): boolean {
  const t = title.trim()
  if (/^conclusion$/i.test(t)) return true
  if (/^in conclusion$/i.test(t)) return true
  if (/^(?:final thoughts|wrapping up|bottom line)$/i.test(t)) return true
  // Diagnosis often renames endings to「Part N. Bottom Line」
  if (/\bpart\s*\d+\s*[.:：)]\s*(?:bottom line|conclusion|final thoughts|wrapping up)\b/i.test(t)) {
    return true
  }
  if (/\b(?:bottom line|final thoughts|wrapping up)\s*$/i.test(t)) return true
  return false
}

export type ArticleModuleKind = 'quickAnswer' | 'introduction' | 'faq' | 'conclusion' | 'body'

export function classifyArticleModule(title: string): ArticleModuleKind {
  const trimmed = title.trim()
  if (isQuickAnswerSection(trimmed)) return 'quickAnswer'
  if (/^introduction$/i.test(trimmed)) return 'introduction'
  if (isFaqSection(trimmed)) return 'faq'
  if (isConclusionSection(trimmed)) return 'conclusion'
  return 'body'
}

function hasFaqSection(sections: OutlineSection[]): boolean {
  return sections.some((item) => isFaqSection(item.title))
}

function hasQuickAnswerSection(sections: OutlineSection[]): boolean {
  return sections.some((item) => isQuickAnswerSection(item.title))
}

/** GEO front modules missing from source should always be planned for optimize output. */
export function ensureOptimizeGeoModules(
  sections: OutlineSection[],
  sourceSections: OutlineSection[]
): OutlineSection[] {
  const result = sections.map((section) => ({ ...section }))

  if (!hasQuickAnswerSection(sourceSections) && !hasQuickAnswerSection(result)) {
    result.unshift({
      title: 'Quick Answer',
      body: '- NEW (GEO): 3–4 bullets directly answering the core query from source themes + diagnosis ADD items'
    })
  }

  return normalizeOptimizeSectionOrder(result)
}

/** GEO module order: Quick Answer → Introduction → body → FAQ → Conclusion */
export function normalizeOptimizeSectionOrder(sections: OutlineSection[]): OutlineSection[] {
  const quickAnswer: OutlineSection[] = []
  const introduction: OutlineSection[] = []
  const faq: OutlineSection[] = []
  const conclusion: OutlineSection[] = []
  const body: OutlineSection[] = []

  for (const section of sections) {
    switch (classifyArticleModule(section.title)) {
      case 'quickAnswer':
        quickAnswer.push(section)
        break
      case 'introduction':
        introduction.push(section)
        break
      case 'faq':
        faq.push(section)
        break
      case 'conclusion':
        conclusion.push(section)
        break
      default:
        body.push(section)
    }
  }

  return [
    ...quickAnswer.slice(0, 1),
    ...introduction.slice(0, 1),
    ...body,
    ...faq.slice(0, 1),
    ...conclusion.slice(0, 1)
  ]
}

export const OPTIMIZE_MODULE_ORDER_GUIDANCE =
  '模块顺序（硬性）：## Quick Answer / Key Takeaways → ## Introduction → 正文 Part（保持相对顺序）→ FAQ 章节（H2 可含主题，如 FAQs About …）→ ## Conclusion（FAQ 必须在 Conclusion 之前）。'

/** Reorder ## sections in a finished article so FAQ always precedes Conclusion. */
export function reorderArticleMarkdown(markdown: string): string {
  let text = normalizeArticleMarkdown(markdown.trim())
  if (!text || !/^##\s/m.test(text)) return markdown

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

  if (!/^##\s/m.test(text)) {
    return markdown
  }

  const sections = normalizeOptimizeSectionOrder(parseOutlineSections(text))
  if (sections.length === 0) return markdown

  const reorderedBody = sections
    .map((section) => {
      const body = section.body.trim()
      return body ? `## ${section.title}\n\n${body}` : `## ${section.title}`
    })
    .join('\n\n')

  return [prefix, h1, reorderedBody].filter(Boolean).join('\n').trim()
}

/** Text between H1 removal and the first ## heading — often the page intro. */
export function extractLeadInBeforeFirstH2(markdownWithoutH1: string): string {
  const trimmed = markdownWithoutH1.trim()
  if (!trimmed) return ''

  const firstH2Index = trimmed.search(/^##\s+/m)
  if (firstH2Index <= 0) return ''

  return trimmed.slice(0, firstH2Index).trim()
}

export function extractSourceLeadIn(markdown: string): string {
  const withoutH1 = markdown.replace(/^#\s+.+\n+/m, '')
  return extractLeadInBeforeFirstH2(withoutH1.trim() || markdown)
}

function isUsableLeadIn(leadIn: string): boolean {
  const trimmed = leadIn.trim()
  if (!trimmed) return false
  if (countWords(trimmed) >= MIN_LEAD_IN_WORDS) return true
  return trimmed.replace(/\s/g, '').length >= MIN_LEAD_IN_CHARS
}

function finalizeOptimizeWordRange(
  min: number,
  max: number,
  suffix: string
): OptimizeWordRange {
  const lo = Math.max(1, Math.min(min, max))
  const hi = Math.max(lo, Math.max(min, max))
  return { min: lo, max: hi, label: `${lo}–${hi}${suffix}` }
}

export function getOptimizeWordRange(
  sourceWords: number,
  _hasCompetitorInsights = false
): OptimizeWordRange {
  const min = Math.floor(sourceWords * (1 - OPTIMIZE_WORD_TOLERANCE))
  const max = Math.ceil(sourceWords * (1 + OPTIMIZE_WORD_TOLERANCE))
  return finalizeOptimizeWordRange(
    min,
    max,
    `（原文 ${sourceWords} 词，允许 ±${Math.round(OPTIMIZE_WORD_TOLERANCE * 100)}% 浮动；质量优先于字数）`
  )
}

export function getSourceSectionEditHint(options: {
  isNewSection: boolean
  hasOriginal: boolean
  sectionTitle?: string
  isAuditNewH2?: boolean
}): string {
  if (options.isNewSection) {
    return options.isAuditNewH2
      ? [
          '本节为**诊断建议新增 H2**：原文无对应章节。',
          '根据诊断报告与竞品缺口撰写完整新节（含 ## 标题行由程序拼接，你只输出正文）。',
          '篇幅适中、对读者有直接帮助；须落实诊断中针对本节的 ADD 要点，勿编造数据。'
        ].join('\n')
      : '本节为原文缺失的新增模块（如 Quick Answer/FAQ）：基于原文主题、诊断与竞品缺口撰写，篇幅简短，须对读者有直接帮助，勿编造。'
  }
  if (options.hasOriginal) {
    return [
      `【本节编辑模式：内容评估 + 按需增删】`,
      '以下方「原文本节」为底稿。**先判断质量，再决定动作**，不是默认整节增量叠加。',
      '**优质内容（准确、可用、符合 E-E-A-T）**：',
      '- **保留**大部分有效原句与结构',
      '- **增量补充**诊断/竞品中针对「' + (options.sectionTitle ?? '本节') + '」的高价值要点（新句、bullet 或短段）',
      '**问题内容（过时、不可用、误导、堆砌、重复）**：',
      '- **仅删减**有明确证据的失效步骤、过时版本、已不可用工具说明——不要因「看起来旧」或竞品写法不同而整段删教程',
      '- **替换**单步时须给出当前可行方案；默认保留原文步骤顺序与数量',
      '**局部润色**：仅改薄弱、难读或 SEO 不足的句子',
      '禁止整节重写或换成无关通用教程；增删均须服务于读者价值与 E-E-A-T。',
      '**硬性：** 原文 how-to / 产品使用步骤默认保留，除非诊断对某一具体步骤给出失效证据。'
    ].join('\n')
  }
  return '未匹配到同名原文节：从原文相关段落提炼；优质处保留并补充缺口，过时/低质处删减，保持与原页面一致的语气。'
}

export function getOptimizeSinglePassHint(wordRangeLabel: string): string {
  return [
    '【编辑模式：内容评估 + 按需增删】',
    OPTIMIZE_MODULE_ORDER_GUIDANCE,
    '保留原文 **H2/H3 顺序与标题**（可微调措辞）；**诊断明确标记 [新增 H2] / [NEW H2] 的章节必须新增**并插入诊断指定位置。',
    '**保留文首导语**：H1 下方、首个正文 Part 前的段落须保留为 ## Introduction 或等价开篇（不可整段删除）。',
    '**按内容质量执行**（见诊断与竞品分析）：',
    '- **优质内容**：保留有效原句；对优秀章节**增量吸纳**竞品/诊断要点',
    '- **缺失内容**：写入竞品缺口或诊断 ADD 项；新增 H2 写入完整新节',
    '- **问题内容**：**仅删减**有证据的过时/不可用/误导内容；**可用的产品使用步骤与 how-to 默认保留**',
    '- **局部润色**：仅改薄弱、难读、重复或 SEO 不足的句子',
    '篇幅可在原文 ±20% 内浮动；禁止整篇重写或套用新文 Part 模板。',
    `词数参考：${wordRangeLabel}`
  ].join('\n')
}

export function getOptimizePolishHint(): string {
  return [
    '【终稿校对】',
    OPTIMIZE_MODULE_ORDER_GUIDANCE,
    '- 修正错别字、语法、明显 AI 套话、段落衔接问题',
    '- **检查 Quick Answer / Introduction / FAQ / Conclusion 等模块是否齐全、顺序是否正确**',
    '- **Introduction 若来自原文 H1 后导语**：校对时保留该开篇，禁止换成全新引言',
    '- **保留现有 H2/H3 与实质内容**；仅局部润色弱句，禁止整篇重写或大幅增删章节',
    MULTI_METHOD_POLISH_PRESERVATION_HINT,
    '- 禁止 Target audience、for US reader 等 brief 标签渗入正文'
  ].join('\n')
}

export function getOptimizePolishSystemBlocks(): string {
  return [
    '前一阶段（分段优化）已落实内容评估与增删；本步仅做语言校对与结构完整性检查，勿重新展开内容策略。',
    MULTI_METHOD_STRUCTURE_PRESERVE_RULE
  ].join('\n\n')
}

export function validateSourceMarkdown(markdown: string): void {
  const trimmed = markdown.trim()
  if (trimmed.length < 400) {
    throw new Error('抓取到的正文过短，可能未成功获取页面内容。请检查 URL 或 Firecrawl 配置后重试。')
  }
  if (countWords(trimmed) < 80) {
    throw new Error('抓取到的正文词数过少，无法基于原文优化。请确认 URL 可访问且 Firecrawl 能抓取正文。')
  }
}

export function parseSourceSections(markdown: string): OutlineSection[] {
  const withoutH1 = markdown.replace(/^#\s+.+\n+/m, '')
  const trimmed = withoutH1.trim() || markdown
  const sections = filterJunkSourceSections(parseOutlineSections(trimmed))
  const leadIn = extractLeadInBeforeFirstH2(trimmed)

  if (isUsableLeadIn(leadIn)) {
    const introIndex = sections.findIndex((item) => /^introduction$/i.test(item.title.trim()))
    if (introIndex >= 0) {
      const intro = sections[introIndex]
      const existing = intro.body.trim()
      const leadPreview = leadIn.slice(0, Math.min(48, leadIn.length))
      const alreadyHasLeadIn = Boolean(leadPreview && existing.includes(leadPreview))
      sections[introIndex] = {
        ...intro,
        body: alreadyHasLeadIn ? existing : [leadIn, existing].filter(Boolean).join('\n\n')
      }
    } else {
      sections.unshift({ title: 'Introduction', body: leadIn })
    }
  }

  return sections
}

export function extractSourceH1(markdown: string, fallbackTitle: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || fallbackTitle
}

export function findMatchingSourceSection(
  sectionTitle: string,
  sourceSections: OutlineSection[]
): OutlineSection | undefined {
  const target = sectionTitle.trim().toLowerCase()
  if (!target) return undefined

  const exact = sourceSections.find((item) => item.title.trim().toLowerCase() === target)
  if (exact) return exact

  return sourceSections.find((item) => {
    const source = item.title.trim().toLowerCase()
    return source.includes(target) || target.includes(source)
  })
}

export type OptimizeSectionEditAction = 'write_new' | 'content_revise' | 'text_polish'

export interface OptimizeSectionPairing {
  outlineTitle: string
  sourceTitle?: string
  sourceBody?: string
  match: 'exact' | 'fuzzy' | 'none'
  action: OptimizeSectionEditAction
  reason: string
  /** True when body comes from H1→first-H2 lead-in (untitled intro). */
  fromLeadIn?: boolean
}

const OUTLINE_BOILERPLATE_SIGNAL =
  /same section as source|KEEP\s*\+\s*ENHANCE:|REMOVE\/REPLACE:\s*cut stale|NEW\s*\((?:audit|GEO)\)|LEAD-IN INTRO|preserve title and order/i

const CONTENT_REVISE_SIGNAL =
  /\b(?:ADD|REMOVE|REPLACE|NEW)\b|KEEP\s*\+\s*ENHANCE|删减|替换|补充|缺口|过时|不可用|增删|新增|写入|插入|删除/i
const TEXT_POLISH_SIGNAL =
  /局部改写|局部润色|polish|proofread|preserve|retain|保留原句|仅改薄弱|语法|可读性|LEAD-IN|就地润色|KEEP(?!\s*\+)/i

function stripOutlineBoilerplate(body: string): string {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      const content = line.replace(/^[-*+]\s+/, '')
      return !OUTLINE_BOILERPLATE_SIGNAL.test(content)
    })
    .join('\n')
    .trim()
}

function detectOutlineEditSignals(outlineBody: string): {
  wantsContentRevise: boolean
  wantsTextPolish: boolean
} {
  const body = stripOutlineBoilerplate(outlineBody)
  if (!body) return { wantsContentRevise: false, wantsTextPolish: false }
  return {
    wantsContentRevise: CONTENT_REVISE_SIGNAL.test(body),
    wantsTextPolish: TEXT_POLISH_SIGNAL.test(body) && !CONTENT_REVISE_SIGNAL.test(body)
  }
}

/**
 * Pair an optimize-outline section with the source outline before drafting,
 * then decide: write new / content add-remove / text polish only.
 */
export function pairOutlineSectionWithSource(
  outlineSection: OutlineSection,
  sourceSections: OutlineSection[],
  audit: string
): OptimizeSectionPairing {
  const outlineTitle = outlineSection.title.trim()
  const exact = sourceSections.find(
    (item) => item.title.trim().toLowerCase() === outlineTitle.toLowerCase()
  )
  const fuzzy = exact ? undefined : findMatchingSourceSection(outlineTitle, sourceSections)
  const matched = exact ?? fuzzy
  const match: OptimizeSectionPairing['match'] = exact ? 'exact' : fuzzy ? 'fuzzy' : 'none'

  const isBuiltinNew =
    isNewOptimizeSection(outlineTitle, audit) && !matched
  const isAuditNew = isAuditRecommendedNewSection(outlineTitle, audit)
  const isIntroduction = /^introduction$/i.test(outlineTitle)
  const fromLeadIn =
    isIntroduction && Boolean(matched?.body?.trim()) && !/^##\s+/m.test(matched?.body ?? '')

  // Untitled H1→H2 lead-in mapped to Introduction: never treat as brand-new GEO module
  if (fromLeadIn && matched) {
    const signals = detectOutlineEditSignals(outlineSection.body)
    if (signals.wantsContentRevise) {
      return {
        outlineTitle,
        sourceTitle: matched.title,
        sourceBody: matched.body,
        match,
        action: 'content_revise',
        reason: '原文开篇导语已配对为 Introduction，按大纲做有限增删',
        fromLeadIn: true
      }
    }
    return {
      outlineTitle,
      sourceTitle: matched.title,
      sourceBody: matched.body,
      match: match === 'none' ? 'exact' : match,
      action: 'text_polish',
      reason: '原文 H1 与首个 H2 之间的开篇导语即 Introduction，就地润色、禁止重写',
      fromLeadIn: true
    }
  }

  if (!matched || isBuiltinNew || (isAuditNew && !exact)) {
    return {
      outlineTitle,
      sourceTitle: matched?.title,
      sourceBody: matched?.body,
      match,
      action: 'write_new',
      reason: isAuditNew
        ? '诊断标记新增 H2，原文无对应完整章节'
        : match === 'none'
          ? '原文大纲无配对章节，按新模块撰写'
          : 'GEO/诊断新增模块，按新节撰写'
    }
  }

  const signals = detectOutlineEditSignals(outlineSection.body)
  const auditHit = audit
    .toLowerCase()
    .includes(outlineTitle.toLowerCase().slice(0, Math.min(outlineTitle.length, 24)))
  const auditWantsRevise =
    auditHit &&
    /\[(?:ADD|REMOVE|REPLACE|新增)\]|建议补充|建议删减|建议替换|KEEP\s*\+\s*ENHANCE/i.test(audit)

  if (signals.wantsContentRevise || auditWantsRevise) {
    return {
      outlineTitle,
      sourceTitle: matched.title,
      sourceBody: matched.body,
      match,
      action: 'content_revise',
      reason: signals.wantsContentRevise
        ? '大纲编辑要点含增删/替换指令'
        : '诊断对本节含增删或增强指令'
    }
  }

  if (signals.wantsTextPolish || match === 'exact') {
    return {
      outlineTitle,
      sourceTitle: matched.title,
      sourceBody: matched.body,
      match,
      action: 'text_polish',
      reason:
        match === 'exact' && !signals.wantsContentRevise
          ? '已与原文同名章节配对，默认文本优化'
          : '大纲指示以保留与局部润色为主'
    }
  }

  return {
    outlineTitle,
    sourceTitle: matched.title,
    sourceBody: matched.body,
    match,
    action: 'content_revise',
    reason: '已配对原文但标题不完全一致，按内容修订处理'
  }
}

export function getOptimizeSectionActionHint(pairing: OptimizeSectionPairing): string {
  if (pairing.fromLeadIn) {
    return [
      pairing.action === 'content_revise' ? '【本节动作：开篇导语 · 有限增删】' : '【本节动作：开篇导语 · 就地润色】',
      `配对结果：${pairing.reason}`,
      '底稿 = 原文 **H1 下方、第一个 ## 之前** 的介绍性段落（软件已映射为 ## Introduction）。',
      '**必须在该底稿上编辑**：保留原有论点、事实与大部分原句；禁止丢弃底稿另写一篇新 Introduction。',
      pairing.action === 'content_revise'
        ? '仅可按大纲补充少量缺失句，或删改有证据的过时句；不得整节换叙事重写。'
        : '以语法、衔接、可读性润色为主；保留 ≥80% 原句与段落结构。'
    ].join('\n')
  }

  switch (pairing.action) {
    case 'write_new':
      return [
        '【本节动作：新写】',
        `配对结果：${pairing.reason}`,
        '原文无可用底稿（或属 GEO/诊断新增模块）。根据诊断 ADD 与竞品缺口撰写完整本节正文。',
        '勿编造数据；篇幅适中、对读者有直接帮助。',
        '若本节为 Introduction：先确认原文 H1 后是否已有开篇段落；有则应改用该段落为底稿，禁止无视原文导语重写。'
      ].join('\n')
    case 'content_revise':
      return [
        '【本节动作：内容增删】',
        `配对结果：已配对原文「${pairing.sourceTitle}」· ${pairing.reason}`,
        '以原文本节为底稿，按大纲/诊断执行 KEEP+ENHANCE / ADD / REMOVE / REPLACE。',
        '优质原句保留；缺失要点写入；**仅**对有证据的过时/不可用内容删减或替换。',
        '**原文 how-to / 产品使用步骤默认完整保留**（步骤顺序与数量）；禁止为植入推广产品或压缩篇幅而删掉可用教程。',
        '禁止整节换题重写；增删须服务读者价值。'
      ].join('\n')
    case 'text_polish':
      return [
        '【本节动作：文本优化】',
        `配对结果：已配对原文「${pairing.sourceTitle}」· ${pairing.reason}`,
        '本节以语言与可读性优化为主：修正语法、薄弱句、重复与 SEO 不足表述。',
        '**保留绝大部分有效原句、信息结构与全部可用操作步骤**；非诊断明确要求时，不要大幅增删段落或删减 how-to。'
      ].join('\n')
  }
}

export function formatOptimizeSectionActionLabel(action: OptimizeSectionEditAction): string {
  switch (action) {
    case 'write_new':
      return '新写'
    case 'content_revise':
      return '内容增删'
    case 'text_polish':
      return '文本优化'
  }
}

export function isNewOptimizeSection(title: string, audit?: string): boolean {
  // Introduction is NOT auto-new: H1→first-H2 lead-in is mapped to Introduction in parseSourceSections
  if (/quick answer|key takeaways|^conclusion$/i.test(title.trim()) || isFaqSection(title)) {
    return true
  }
  if (audit && isAuditRecommendedNewSection(title, audit)) {
    return true
  }
  return false
}

/** Keep template ## titles/order; merge enriched bullets by fuzzy title match. */
export function lockOutlineH2TitlesToTemplate(
  templateOutline: string,
  enrichedOutline: string
): string {
  const template = parseOutlineSections(templateOutline)
  if (template.length === 0) return enrichedOutline.trim() || templateOutline

  const enriched = parseOutlineSections(enrichedOutline)
  const used = new Set<number>()

  const lines: string[] = []
  for (const section of template) {
    const exact = enriched.findIndex(
      (item, index) =>
        !used.has(index) &&
        item.title.trim().toLowerCase() === section.title.trim().toLowerCase()
    )
    let matchIdx = exact
    if (matchIdx < 0) {
      matchIdx = enriched.findIndex(
        (item, index) => !used.has(index) && titleMatchesAnchor(item.title, section.title)
      )
    }

    let body = section.body.trim()
    if (matchIdx >= 0) {
      used.add(matchIdx)
      const enrichedBody = enriched[matchIdx].body.trim()
      if (enrichedBody) body = enrichedBody
    }

    lines.push(body ? `## ${section.title}\n${body}\n` : `## ${section.title}\n`)
  }

  return lines.join('\n').trim() + '\n'
}

export function buildAnchoredOutline(
  sourceMarkdown: string,
  audit: string,
  skillsText: string
): string {
  const sourceSections = parseSourceSections(sourceMarkdown)
  const auditText = `${audit}\n${skillsText}`.toLowerCase()
  const skeleton = parseAuditOutlineSkeleton(audit)

  let sections: OutlineSection[]

  if (skeleton.length >= 2) {
    // Diagnosis「大纲骨架」is the single source of truth for H2 titles + order.
    sections = materializeAuditOutlineSkeleton(skeleton, sourceSections)
    const leadInIntro = sourceSections.find(
      (item) => /^introduction$/i.test(item.title.trim()) && item.body.trim()
    )
    if (leadInIntro && !hasIntroductionSection(sections)) {
      const qaIdx = sections.findIndex((item) => isQuickAnswerSection(item.title))
      const insertAt = qaIdx >= 0 ? qaIdx + 1 : 0
      sections.splice(insertAt, 0, { title: 'Introduction', body: leadInIntro.body })
    }
  } else {
    const needsQuickAnswer = !hasQuickAnswerSection(sourceSections)
    const needsFaq =
      /faq|常见问题|missing.*faq/i.test(auditText) && !hasFaqSection(sourceSections)
    const needsIntroduction =
      !hasIntroductionSection(sourceSections) &&
      /introduction|开篇|首段|缺少.*intro|missing.*intro|缺少.*引言/i.test(auditText)

    sections = mergeAuditNewH2Sections(sourceSections, audit)

    if (needsQuickAnswer) {
      sections.push({ title: 'Quick Answer', body: '' })
    }
    if (needsIntroduction && !hasIntroductionSection(sections)) {
      sections.push({ title: 'Introduction', body: '' })
    }
    if (needsFaq) {
      sections.push({ title: 'FAQ', body: '' })
    }
  }

  sections = normalizeOptimizeSectionOrder(sections)

  const lines: string[] = []
  const skeletonTitles = new Set(skeleton.map((item) => item.title.trim().toLowerCase()))

  for (const section of sections) {
    const isAuditNew = isAuditRecommendedNewSection(section.title, audit)
    const inSkeletonAsNew = skeleton.some(
      (item) =>
        item.isNew && item.title.trim().toLowerCase() === section.title.trim().toLowerCase()
    )
    const isLeadInIntroduction =
      /^introduction$/i.test(section.title.trim()) && Boolean(section.body.trim())
    const isBuiltinNew =
      (isQuickAnswerSection(section.title) ||
        (/^introduction$/i.test(section.title.trim()) && !section.body.trim()) ||
        isFaqSection(section.title) ||
        isConclusionSection(section.title)) &&
      !sourceSections.some(
        (item) => item.title.trim().toLowerCase() === section.title.trim().toLowerCase()
      )

    if (isLeadInIntroduction && !isAuditNew && !inSkeletonAsNew) {
      lines.push(
        `## ${section.title}`,
        '- LEAD-IN INTRO: body is the source text between H1 and the first ## — polish in place',
        '- Do NOT rewrite a new Introduction from scratch; keep ≥80% of original sentences',
        '- Optional: light ADD only for missing reader-critical context',
        ''
      )
      continue
    }

    if (isAuditNew || isBuiltinNew || inSkeletonAsNew) {
      const bodyNote = section.body.trim()
      const isPlaceholderBody = /^-?\s*NEW \(audit skeleton\)/i.test(bodyNote)
      lines.push(
        `## ${section.title}`,
        '- NEW (audit): write full section per diagnosis ADD items for this H2',
        '- Use this exact H2 title from the diagnosis outline skeleton',
        bodyNote && !isPlaceholderBody ? `- ${bodyNote}` : '',
        ''
      )
      continue
    }

    const renamed =
      skeletonTitles.size > 0 &&
      !sourceSections.some(
        (item) => item.title.trim().toLowerCase() === section.title.trim().toLowerCase()
      )

    lines.push(
      `## ${section.title}`,
      renamed
        ? '- AUDIT OUTLINE TITLE: use this H2 exactly (diagnosis renamed/optimized the source heading)'
        : '- Same section as source — preserve title and order',
      '- KEEP + ENHANCE: retain strong original sentences; ADD competitor gaps where relevant',
      '- REMOVE/REPLACE: cut stale, broken, or EEAT-weak content; do not pad obsolete text',
      ''
    )
  }

  if (lines.length === 0) {
    return '## 正文\n- Conservative in-place edit of source body; preserve structure and most wording\n'
  }

  return lines.join('\n')
}

export function buildSourcePreviewStats(markdown: string): string {
  const sections = parseSourceSections(markdown)
  return `约 ${countWords(markdown)} 词 · ${sections.length} 个章节`
}
