import { countArticleWords as countWords, MIN_ARTICLE_WORDS, MAX_ARTICLE_WORDS } from './articleLength'
import { parseOutlineSections } from './llmClient'

export type OutlineSection = { title: string; body: string }

export { countWords }

export const INCREMENTAL_UPDATE_GUIDANCE = `
【Incremental Update — Editor MUST Act Proactively】
Conservative edit ≠ passive proofreading. You are an expert editor who **improves** the page.

**ADD (from audit + competitor analysis):**
- Actively **incorporate** high-value points from competitor pages that the source lacks (steps, tips, FAQ angles, data, use cases)
- Insert into the **most relevant existing section** as new sentences, bullets, or a short paragraph
- When the **audit explicitly recommends a new H2** (marked [新增 H2] / [NEW H2] / in the diagnosis outline skeleton), **add that section** at the position the audit specifies — do not fold mandatory new modules only into FAQ
- Prefer **specific, actionable** additions the reader can use immediately

**REMOVE or REPLACE (stale / harmful content):**
- **Delete** steps, tools, UI paths, version numbers, or methods that are **outdated, deprecated, broken, or no longer work**
- **Replace** obsolete instructions with current viable alternatives when the audit or your knowledge indicates they fail
- Remove duplication and low-trust filler — but never delete still-accurate core facts without cause

**Balance with preservation:**
- Keep existing H2/H3 order and titles unless the audit marks **new H2** or **REMOVE** for a section
- Unchanged good sentences stay as-is; **new** competitor value and **removed** stale parts are expected — this is not "patch only"
- Do not invent statistics, reviews, or claims absent from source/competitor analysis
`.trim()

export const SOURCE_PRESERVATION_GUIDANCE = `
【Source Preservation — Structure First, NOT Passive Patch】
This task is **optimizing an existing page**, not writing a new article from scratch.

**Preserve structure & good prose:**
- Keep the source page's **H2/H3 order, section titles, accurate facts, steps, lists, tables, and product names**
- Keep **wording and paragraph flow** when content is accurate, helpful, and current
- Treat the scraped Markdown as the **working draft**; edit in place

**Active edits (required when audit/competitor flags them):**
- **Insert** competitor gaps and missing high-value info into the right section
- **Add new H2 sections** when the diagnosis explicitly recommends them (Quick Answer, FAQ, or audit-marked [新增 H2] modules)
- **Remove or replace** outdated, invalid, or misleading steps/methods
- Fix grammar, clarity, weak SEO phrasing sentence by sentence

**Do NOT:**
- Rewrite entire sections in a new voice or impose a new-article Part template
- Replace the page with generic tutorial content unrelated to the source
- Add new H2 **not** backed by the diagnosis / competitor analysis

**Per-section when original text is supplied:**
- Retain **most unchanged sentences** in passages that stay valid (rough guide ≥70% where no add/remove needed)
- Where audit marks **add**: write new helpful content; where audit marks **remove**: delete stale parts — both are intentional changes
`.trim()

export const EEAT_OPTIMIZE_GUIDANCE = `
【Optimization Principles — E-E-A-T + Source First + Incremental Value】
- Use the scraped source as **structural and factual baseline**; improve it for today's readers.
- **Keep** accurate, current, helpful passages.
- **Add** competitor/user-intent gaps that increase Experience & Trustworthiness.
- **Remove/replace** outdated or misleading content — outdated help hurts E-E-A-T.
- **Rewrite** only unclear or weak sentences — not whole sections by default.
- Language must stay 100% identical to the source page.
`.trim()

export interface AuditNewH2Section {
  title: string
  insertBefore?: string
  insertAfter?: string
}

function normalizeAuditH2Title(raw: string): string {
  return raw
    .trim()
    .replace(/\*\*/g, '')
    .replace(/^[\d.]+\s*/, '')
    .replace(/^\[NEW H2\]\s*/i, '')
    .replace(/^\[新增\s*H2(?:\s*[:：][^\]]*)?\]\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

function titleMatchesAnchor(sectionTitle: string, anchor: string): boolean {
  const section = sectionTitle.trim().toLowerCase()
  const needle = anchor.trim().toLowerCase()
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

  const faqIdx = sections.findIndex((item) => /^faq$/i.test(item.title.trim()))
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

export function getOptimizeWordRange(
  sourceWords: number,
  hasCompetitorInsights = false
): { min: number; max: number; label: string } {
  if (sourceWords >= MIN_ARTICLE_WORDS && sourceWords <= MAX_ARTICLE_WORDS) {
    const min = Math.floor(sourceWords * (hasCompetitorInsights ? 0.9 : 0.92))
    const max = Math.min(
      MAX_ARTICLE_WORDS,
      Math.ceil(sourceWords * (hasCompetitorInsights ? 1.12 : 1.08))
    )
    return {
      min,
      max,
      label: hasCompetitorInsights
        ? `${min}–${max}（原文 ${sourceWords} 词；允许竞品增量补充 ±10–12%）`
        : `${min}–${max}（贴近原文 ${sourceWords} 词，±8%）`
    }
  }

  if (sourceWords < MIN_ARTICLE_WORDS) {
    const max = Math.min(MAX_ARTICLE_WORDS, Math.max(MIN_ARTICLE_WORDS, Math.ceil(sourceWords * 1.2)))
    return {
      min: sourceWords,
      max,
      label: `${sourceWords}–${max}（原文偏短，可补充缺失内容，禁止整篇重写）`
    }
  }

  const min = Math.max(MIN_ARTICLE_WORDS, Math.floor(sourceWords * 0.88))
  const max = Math.min(sourceWords, MAX_ARTICLE_WORDS)
  return {
    min,
    max: Math.max(min, max),
    label: `${min}–${Math.max(min, max)}（原文偏长，优先精简冗余，保留结构与关键信息）`
  }
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
      `【本节编辑模式：保守结构 + 主动增量更新】`,
      '以下方「原文本节」为底稿，**保留章节结构与大部分有效原句**。',
      '**必须主动执行**（若诊断/竞品分析有提及）：',
      '1. **增量吸纳**：将竞品/诊断中针对本节（或「' + (options.sectionTitle ?? '本节') + '」）的优秀要点自然写入（新句、bullet 或短段）',
      '2. **删减过时**：删除或替换本节中失效的方法、过时版本、已不可用步骤/工具说明，必要时给出当前可行替代',
      '3. **局部润色**：仅改薄弱、难读、重复或 SEO 不足的句子',
      '禁止整节重写或换成无关通用教程；新增与删除均须服务于读者价值。'
    ].join('\n')
  }
  return '未匹配到同名原文节：从原文相关段落提炼，并按诊断/竞品缺口做增量补充与过时删减，保持与原页面一致的语气。'
}

export function getOptimizeSinglePassHint(wordRangeLabel: string): string {
  return [
    '【编辑模式：就地优化 + 主动增量更新】',
    '保留原文 **H2/H3 顺序与标题**（可微调措辞）；**诊断明确标记 [新增 H2] / [NEW H2] 的章节必须新增**并插入诊断指定位置。',
    '**必须执行**诊断与竞品分析中的：',
    '- **增量吸纳**：竞品优秀内容写入对应章节',
    '- **新增 H2**：写入诊断大纲骨架中标记的新章节',
    '- **删减过时**：移除失效/错误/过时方法与步骤，必要时替换为当前方案',
    '- **局部润色**：保留仍然准确有用的原句',
    '禁止整篇重写或套用新文 Part 模板。',
    `词数目标：${wordRangeLabel}`
  ].join('\n')
}

export function getOptimizePolishHint(): string {
  return [
    '【终稿校对 + 增量检查】',
    '- 修正错别字、语法、明显 AI 套话、衔接问题',
    '- **检查诊断/竞品要点是否已写入**；若优化稿遗漏应吸纳的竞品内容，补入对应章节',
    '- **检查诊断建议的新增 H2 是否已出现**；若缺失则按诊断补写',
    '- **检查过时/失效内容是否已删除或替换**；若仍残留，按诊断删改',
    '- **禁止**无诊断依据地增删 H2；**允许**保留诊断批准的新 H2 及其顺序',
    '- 对照「原页面」：骨架一致 + 诊断新增模块，允许比原文更充实、更当前'
  ].join('\n')
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
  return parseOutlineSections(withoutH1.trim() || markdown)
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

export function isNewOptimizeSection(title: string, audit?: string): boolean {
  if (/quick answer|key takeaways|^faq$|^conclusion$|introduction/i.test(title.trim())) {
    return true
  }
  if (audit && isAuditRecommendedNewSection(title, audit)) {
    return true
  }
  return false
}

export function buildAnchoredOutline(
  sourceMarkdown: string,
  audit: string,
  skillsText: string
): string {
  const sourceSections = parseSourceSections(sourceMarkdown)
  const auditText = `${audit}\n${skillsText}`.toLowerCase()
  const needsQuickAnswer =
    /quick answer|key takeaways|缺少.*首屏|missing.*quick/i.test(auditText) &&
    !sourceSections.some((item) => /quick answer|key takeaways/i.test(item.title))
  const needsFaq =
    /faq|常见问题|missing.*faq/i.test(auditText) &&
    !sourceSections.some((item) => /^faq$/i.test(item.title.trim()))

  let sections = mergeAuditNewH2Sections(sourceSections, audit)
  const lines: string[] = []

  if (needsQuickAnswer && !sections.some((item) => /quick answer|key takeaways/i.test(item.title))) {
    lines.push(
      '## Quick Answer',
      '- NEW (audit): short bullets from original themes; do not rewrite other sections',
      ''
    )
  }

  for (const section of sections) {
    const isAuditNew = isAuditRecommendedNewSection(section.title, audit)
    const isBuiltinNew =
      /quick answer|key takeaways|^faq$|^conclusion$/i.test(section.title.trim()) &&
      !sourceSections.some(
        (item) => item.title.trim().toLowerCase() === section.title.trim().toLowerCase()
      )

    if (isAuditNew || isBuiltinNew) {
      lines.push(
        `## ${section.title}`,
        '- NEW (audit): write full section per diagnosis ADD items for this H2',
        section.body.trim() ? `- ${section.body.trim()}` : '',
        ''
      )
      continue
    }

    lines.push(
      `## ${section.title}`,
      '- Same section as source — preserve title and order',
      '- ADD competitor gaps into this section where relevant',
      '- REMOVE/REPLACE stale methods; keep valid original sentences',
      ''
    )
  }

  if (needsFaq && !sections.some((item) => /^faq$/i.test(item.title.trim()))) {
    lines.push('## FAQ', '- NEW (audit only): 3+ Q&A grounded in original; no other section rewrites', '')
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
