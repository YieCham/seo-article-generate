import { countArticleWords as countWords, MIN_ARTICLE_WORDS, MAX_ARTICLE_WORDS } from './articleLength'
import { parseOutlineSections } from './llmClient'

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

**REMOVE (outdated / unusable / EEAT-weak):**
- **Delete** steps, tools, UI paths, version numbers, or methods that are outdated, deprecated, broken, or no longer work
- **Delete** misleading claims, empty filler, keyword stuffing, duplication, or content that hurts Trustworthiness
- **Replace** obsolete instructions with current viable alternatives when the audit or facts require it
- **Shortening the article is valid** when stale or harmful content is removed — do not keep bad text to preserve word count

**Local REWRITE only when needed:**
- Fix unclear, weak, repetitive, or SEO-poor sentences — not whole sections by default
- Do not invent statistics, reviews, or claims absent from source/competitor analysis
`.trim()

export const SOURCE_PRESERVATION_GUIDANCE = `
【Source-First Editing — Keep What Works, Cut What Doesn't】
This task is **optimizing an existing page**, not drafting a brand-new article.

**Preserve when content is still strong:**
- Keep the source page's **H2/H3 order, section titles, accurate facts, steps, lists, tables, and product names**
- Keep **wording and paragraph flow** when passages are accurate, helpful, current, and EEAT-aligned
- Treat the scraped Markdown as the **working draft**; edit in place

**Act when audit/competitor/EEAT flags issues:**
- **Enhance** excellent sections with missing competitor/diagnosis value (incremental add)
- **Add new H2 sections** when the diagnosis explicitly recommends them (Quick Answer, FAQ, or [新增 H2] modules)
- **Remove** outdated, invalid, misleading, or low-trust content — deletion is a first-class optimization outcome
- **Replace** obsolete methods with current alternatives; fix grammar/clarity/SEO sentence by sentence where weak

**Do NOT:**
- Rewrite entire sections in a new voice or impose a new-article Part template
- Replace the page with generic tutorial content unrelated to the source
- Add new H2 **not** backed by the diagnosis / competitor analysis
- Keep stale or EEAT-harmful text just to avoid shortening the page

**Per-section when original text is supplied:**
- Passages that remain valid: retain **most unchanged sentences** (rough guide ≥70% where no add/remove needed)
- Where audit marks **add**: write new helpful content into strong sections
- Where audit marks **remove**: delete stale/harmful parts — a shorter, sharper section is better than padded obsolete text
`.trim()

export const EEAT_OPTIMIZE_GUIDANCE = `
【Optimization Principles — E-E-A-T Drives Keep / Add / Remove】
- Use the scraped source as **structural and factual baseline**; improve it for today's readers.
- **Keep & enhance** passages that show Experience, Expertise, or Trustworthiness and are still accurate.
- **Add** competitor/user-intent gaps that increase helpfulness and Trust — especially where existing sections are good but incomplete.
- **Remove** outdated, broken, misleading, or thin SEO filler — outdated or untrustworthy help **lowers** E-E-A-T.
- **Rewrite** only unclear or weak sentences — not whole sections by default.
- Final length may go **up or down** depending on adds vs. deletions; quality beats word count.
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
        ? `${min}–${max}（原文 ${sourceWords} 词；优质内容可增量补充，过时内容可删减，篇幅可增可减）`
        : `${min}–${max}（贴近原文 ${sourceWords} 词；保留优质内容，删减过时/低质段落）`
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
      `【本节编辑模式：内容评估 + 按需增删】`,
      '以下方「原文本节」为底稿。**先判断质量，再决定动作**，不是默认整节增量叠加。',
      '**优质内容（准确、可用、符合 E-E-A-T）**：',
      '- **保留**大部分有效原句与结构',
      '- **增量补充**诊断/竞品中针对「' + (options.sectionTitle ?? '本节') + '」的高价值要点（新句、bullet 或短段）',
      '**问题内容（过时、不可用、误导、堆砌、重复）**：',
      '- **删减**失效步骤、过时版本、已不可用工具/方法说明',
      '- **替换**为当前可行方案；无法挽救的段落可直接删除，本节变短是正常结果',
      '**局部润色**：仅改薄弱、难读或 SEO 不足的句子',
      '禁止整节重写或换成无关通用教程；增删均须服务于读者价值与 E-E-A-T。'
    ].join('\n')
  }
  return '未匹配到同名原文节：从原文相关段落提炼；优质处保留并补充缺口，过时/低质处删减，保持与原页面一致的语气。'
}

export function getOptimizeSinglePassHint(wordRangeLabel: string): string {
  return [
    '【编辑模式：内容评估 + 按需增删】',
    '保留原文 **H2/H3 顺序与标题**（可微调措辞）；**诊断明确标记 [新增 H2] / [NEW H2] 的章节必须新增**并插入诊断指定位置。',
    '**按内容质量执行**（见诊断与竞品分析）：',
    '- **优质内容**：保留有效原句；对优秀章节**增量吸纳**竞品/诊断要点',
    '- **缺失内容**：写入竞品缺口或诊断 ADD 项；新增 H2 写入完整新节',
    '- **问题内容**：**删减**过时、不可用、误导或不符合 E-E-A-T 的段落/步骤；必要时替换为当前方案',
    '- **局部润色**：仅改薄弱、难读、重复或 SEO 不足的句子',
    '篇幅可因删减而变短、因补充而变长；禁止整篇重写或套用新文 Part 模板。',
    `词数参考：${wordRangeLabel}`
  ].join('\n')
}

export function getOptimizePolishHint(): string {
  return [
    '【终稿校对 + 内容质量复核】',
    '- 修正错别字、语法、明显 AI 套话、衔接问题',
    '- **检查优质章节是否已增量吸纳**诊断/竞品要点；遗漏则补入对应章节',
    '- **检查诊断建议的新增 H2 是否已出现**；若缺失则按诊断补写',
    '- **检查过时/不可用/低 E-E-A-T 内容是否已删减或替换**；若仍残留，按诊断删改（允许终稿比原文更短）',
    '- **禁止**无诊断依据地增删 H2；**允许**保留诊断批准的新 H2 及其顺序',
    '- 对照「原页面」：骨架一致 + 诊断新增模块；终稿应更当前、更可信，而非单纯更长'
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
      '- KEEP + ENHANCE: retain strong original sentences; ADD competitor gaps where relevant',
      '- REMOVE/REPLACE: cut stale, broken, or EEAT-weak content; do not pad obsolete text',
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
