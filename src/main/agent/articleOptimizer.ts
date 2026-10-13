import type { WebContents } from 'electron'
import { getEffectiveConfig, resolveRoutedLlm } from '../config/configStore'
import { resolveStepMaxTokens, maxTokensForOptimizeLengthAdjust, maxTokensForOptimizeSection } from '../config/llmTokenLimits'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext
} from '../token/tokenUsageContext'
import { scrapeToMarkdown, OPTIMIZE_MAX_MARKDOWN_CHARS } from '../research/firecrawl'
import {
  buildResearchDisplayMarkdown,
  buildScrapedCorpus,
  canRunResearch,
  searchWithQueries,
  type ResearchSource
} from '../research/researchService'
import { getLanguageLabel } from '../research/localeOptions'
import { throwIfAborted } from './abortContext'
import { isAbortError } from './articleRunRegistry'
import { mapSources, type GenerateProgressEvent } from './articleAgent'
import {
  analyzeAndExpandSearchQueries,
  buildResearchTopicFromSource
} from './searchIntent'
import { getEnabledSkillBundles } from './skillManager'
import { buildFullSkillsText, getSkillsTextForStep } from './skillPipeline'
import {
  chatCompletion,
  parseOutlineSections,
  type LlmConfig
} from './llmClient'
import {
  getArticleLanguageLock,
  type TopicLanguageCode
} from './topicLanguage'
import { normalizeOutputLanguage, type OutputLanguageCode } from './outputLanguage'
import {
  buildAnchoredOutline,
  ensureOptimizeGeoModules,
  buildSourcePreviewStats,
  countWords,
  extractSourceH1,
  formatOptimizeSectionActionLabel,
  getOptimizePromptBlocks,
  getOptimizeLengthPromptBlock,
  getOptimizeSectionActionHint,
  getOptimizeWordRange,
  extractSourceLeadIn,
  lockOutlineH2TitlesToTemplate,
  normalizeOptimizeSectionOrder,
  pairOutlineSectionWithSource,
  reorderArticleMarkdown,
  parseSourceSections,
  validateSourceMarkdown,
  type OptimizeWordRange,
  type OutlineSection
} from './optimizeStructure'
import {
  buildOptimizeDraftSystemPrompt,
  excerptOptimizeSectionBriefing
} from './optimizeSectionBriefing'
import { sanitizeOptimizeSections } from './optimizeSectionSanitize'
import {
  enforceOutlineH2Contract,
  formatOutlineH2ContractStatus
} from './optimizeH2Contract'
import {
  CONTENT_READABILITY_GUIDANCE,
  getIntroConclusionSectionHint,
  getSectionWordBudget,
  countArticleWords
} from './articleLength'
import { enforceOptimizeArticleWordCount } from './articleWordEnforcement'
import {
  buildSectionPatchSystemPrompt,
  patchOptionsForAction,
  resolveOptimizePatch
} from './optimizePatch'
import { finalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'
import { formatSeoMetaBlock, generateSeoMeta } from './seoMeta'
import { getUserContextPromptBlocks, parseUserWritingContext } from './userContext'
import {
  classifyDraftSectionProductKind,
  getDraftQuickAnswerHint,
  getUserContextPromptBlocksForSection,
  type DraftSectionProductKind
} from './productMention'
import {
  type DraftSectionResume,
  type OptimizePipelineCheckpoint,
  shouldRunPipelineStep
} from './pipelineCheckpoint'
import { normalizeArticleMarkdown, stripLeadingSectionHeading } from '../../shared/normalizeArticleMarkdown'
import {
  optimizeResearchPackMatchesUrl,
  type OptimizeResearchPack
} from '../../shared/researchPack'

export interface OptimizeArticleOptions {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
  llmPresetId?: string
  llmModel?: string
  resume?: OptimizePipelineCheckpoint
  /** When set and URL matches, skip Firecrawl/Tavily and reuse prior research. */
  reuseResearch?: OptimizeResearchPack
}

interface ArticleLanguageContext {
  code: TopicLanguageCode
  lock: string
  label: string
}

function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('请输入页面 URL。')

  try {
    const url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
    return url.toString()
  } catch {
    throw new Error('请输入有效的 URL（需为 http:// 或 https:// 链接）。')
  }
}

function buildArticleLanguageContext(outputLanguage: OutputLanguageCode): ArticleLanguageContext {
  const code = normalizeOutputLanguage(outputLanguage)
  return {
    code,
    lock: getArticleLanguageLock(code, 'user'),
    label: getLanguageLabel(code)
  }
}

function getEditorPromptBlocks(wordRange: OptimizeWordRange): string {
  return [
    getOptimizePromptBlocks(),
    getOptimizeLengthPromptBlock(wordRange),
    CONTENT_READABILITY_GUIDANCE
  ].join('\n\n')
}

function buildSourcePreviewMarkdown(sourceUrl: string, title: string, markdown: string): string {
  return [
    '## 页面抓取结果',
    '',
    `- **URL：** ${sourceUrl}`,
    `- **标题：** ${title}`,
    `- **统计：** ${buildSourcePreviewStats(markdown)}`,
    `- **正文预览：**`,
    '',
    markdown.slice(0, 2400),
    markdown.length > 2400 ? '\n\n…（预览已截断，优化将使用完整抓取正文）' : ''
  ].join('\n')
}

async function extractCompetitorGapInsights(
  llm: LlmConfig,
  topic: string,
  sourceUrl: string,
  sourceMarkdown: string,
  competitorCorpus: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  maxTokens?: number
): Promise<string> {
  if (!competitorCorpus.trim()) {
    return articleLang.code === 'en'
      ? '(No competitor pages scraped; gap analysis based on source page and Skills only.)'
      : '（未抓取到竞品正文，将仅基于原页面与 Skills 做缺口分析。）'
  }

  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 竞品分析专家。对比「待优化原页面」与「竞品高排名页面」，输出**可执行的内容评估清单**（保留增强什么、补充什么、删减什么）。',
          getUserContextPromptBlocks(userContext),
          skillsText ? `优化规范（Skills）：\n${skillsText}` : ''
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          `待优化页面 URL：${sourceUrl}`,
          userContext.briefForPrompt,
          '',
          '请输出 Markdown 竞品缺口分析，包含：',
          '### 建议保留并增强（KEEP + ENHANCE）',
          '- 原文仍准确、可用、体现经验/专业性的段落（注明章节；可补充哪些竞品要点）',
          '### 建议补充（ADD）',
          '- 竞品有、原文缺的高价值内容：具体观点/步骤/技巧/FAQ（每条注明**建议插入的原文章节 / H2**）',
          '- 至少 3–8 条可执行要点，写入对应 H2',
          '### 建议删减或替换（REMOVE / REPLACE）',
          '- 仅列出有证据的过时/失效/误导内容（注明章节与原因）；**不要**把仍可用的产品使用步骤整段列入删除',
          '- 空洞堆砌、重复、低信任表述也应列入删减候选',
          '### 按 H2 索引（必填，供分节摘录）',
          '对每个相关 ## 输出一块，标题须可与原文/大纲 H2 对应：',
          '#### H2: {章节标题}',
          '- KEEP / ADD / REMOVE 短句；新增模块写在自己的 H2 块里，并注明 placement: after/before 「相邻节标题」',
          '不要把「插在两节中间」的要点写进相邻旧节。',
          '',
          `语言：${articleLang.label}`,
          '',
          '--- 待优化原页面 ---',
          sourceMarkdown.slice(0, 12000),
          '',
          '--- 竞品页面摘录 ---',
          competitorCorpus.slice(0, 48000)
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.35, maxTokens }
  )
}

async function auditSourcePage(
  llm: LlmConfig,
  sourceUrl: string,
  title: string,
  sourceMarkdown: string,
  competitorInsights: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  wordRange: OptimizeWordRange,
  maxTokens?: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容诊断专家。分析现有页面并制定**内容评估 + 按需增删**方案，不要撰写终稿。',
          '须明确：哪些优质内容保留并增强、哪些缺口应补充、哪些过时/不可用/不符合 E-E-A-T 的内容应删减或替换。',
          '**重要：** 原文中的 how-to / 产品使用步骤 / 分步教程默认视为优质可保留内容；列入 REMOVE 须给出具体失效证据（如界面已变更且步骤不可用），禁止因「可压缩」或「竞品写法不同」建议整段删除教程。',
          '禁止默认整节重写，也禁止为保篇幅而保留问题内容。',
          getUserContextPromptBlocks(userContext),
          skillsText ? `优化规范（Skills）：\n${skillsText}` : '',
          getEditorPromptBlocks(wordRange)
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `来源 URL：${sourceUrl}`,
          `页面标题：${title}`,
          userContext.briefForPrompt,
          '',
          '请输出 Markdown 诊断报告，包含：',
          '1. 页面现状摘要（主题、意图、语言）',
          '2. **优质内容清单**：仍准确、可用、符合 E-E-A-T 的段落/章节（应保留；**how-to / 产品使用步骤默认列入保留**；可注明可增量补充的竞品要点）',
          '3. **缺口清单**：原文遗漏但对用户有价值、**应补充**的具体要点（按章节列出）',
          '4. **删减/替换清单**：仅列有证据的过时、不可用、误导、堆砌内容（按章节说明原因）；**禁止**把仍可用的完整使用步骤/教程整段标为删除',
          '5. 结构与 SEO/GEO 问题（标题层级、关键词、缺失模块如 Quick Answer/FAQ 等）',
          '6. **建议局部改写**的句子（薄弱/难读/SEO 不足，具体到句）',
          '7. **优化动作清单**（KEEP+ENHANCE / ADD / REMOVE / REPLACE / **NEW H2**，按优先级）',
          '8. 大纲骨架（H2 列表）：按终稿顺序列出**最终采用的 ## 标题**（可对原 Part 改名）；新增模块用 `[新增 H2] 标题`，插入位置写在标题外面（insert before/after 「章节名」）。标题正文里不要出现 `[insert after …]`、`(insert before …)` 或其他插入说明。该列表将直接驱动分节写作与 H2 契约，勿写「建议」而不写最终标题',
          '9. **建议新增章节**（可选）：每条 `- [NEW H2] 标题 | insert before/after 「原文章节名」| 要点摘要`',
          '10. **按 H2 编辑要点（必填）**：骨架中每个最终 ## 各一块，标题必须与骨架完全一致：',
          '#### H2: {精确标题}',
          '- placement: existing | after 「上一节标题」 | before 「下一节标题」',
          '- KEEP: 1–3 条；ADD: 1–5 条（新节以 ADD 为主）；REMOVE: 0–3 条',
          '「插在两节中间」只写在新节块的 placement，不要写进相邻旧节的 ADD。',
          '',
          `终稿语言须保持：${articleLang.label}`,
          '',
          '--- 竞品缺口分析 ---',
          competitorInsights,
          '',
          '--- 原页面 Markdown ---',
          sourceMarkdown,
          '---'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.35, maxTokens }
  )
}

async function enrichAnchoredOutline(
  llm: LlmConfig,
  anchoredOutline: string,
  audit: string,
  articleLang: ArticleLanguageContext,
  maxTokens?: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content:
          '你是内容优化编辑。在大纲各 ## 章节下补充编辑要点 bullet：**KEEP+ENHANCE / ADD / REMOVE / REPLACE / 局部改写**。**严禁修改、重命名、合并或删除任何 ## 标题文字**（标题已由诊断大纲骨架锁定）。仅当大纲明显缺少诊断中的 `[新增 H2]` / `[NEW H2]` 时才可插入该 ##；不得另起未在诊断骨架中的章节。'
      },
      {
        role: 'user',
        content: [
          '在以下大纲各 ## 章节下补充 1–3 条具体编辑说明（来自诊断报告）。',
          '**硬性：完整保留下方每个 ## 标题的原文，一个字都不要改。** 只改标题下的 bullet。',
          '不得删除已有 ##；不得把 Part 标题改回原文旧名；不得另增诊断骨架未列出的 ##。',
          `语言：${articleLang.label}`,
          '',
          '--- 诊断报告 ---',
          audit.slice(0, 6000),
          '',
          '--- 大纲（仅可补充 bullet；## 标题已锁定）---',
          anchoredOutline
        ].join('\n')
      }
    ],
    { temperature: 0.25, maxTokens }
  )
}

async function generateOptimizedOutline(
  llm: LlmConfig,
  sourceMarkdown: string,
  audit: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  maxTokens?: number
): Promise<string> {
  const anchored = buildAnchoredOutline(sourceMarkdown, audit, skillsText)
  const enriched = await enrichAnchoredOutline(llm, anchored, audit, articleLang, maxTokens)
  return lockOutlineH2TitlesToTemplate(anchored, enriched)
}

function resolveOptimizeDraftSections(
  outline: string,
  sourceSections?: OutlineSection[]
): ReturnType<typeof sanitizeOptimizeSections> {
  const sanitized = sanitizeOptimizeSections(parseOutlineSections(outline), { sourceSections })
  const sections = ensureOptimizeGeoModules(
    normalizeOptimizeSectionOrder(sanitized.sections),
    sourceSections ?? []
  )
  return { sections, log: sanitized.log }
}

function formatSectionSanitizeStatus(log: ReturnType<typeof sanitizeOptimizeSections>['log']): string | null {
  const parts: string[] = []
  if (log.dropped.length > 0) parts.push(`过滤 ${log.dropped.length} 个无效节`)
  if (log.merged.length > 0) parts.push(`合并 ${log.merged.length} 条插入指令`)
  return parts.length > 0 ? parts.join('，') : null
}

function outlineSectionsToMarkdown(sections: OutlineSection[]): string {
  return sections
    .map((section) => {
      const body = section.body.trim()
      return body ? `## ${section.title}\n${body}\n` : `## ${section.title}\n`
    })
    .join('\n')
}

function applyOutlineH2Contract(
  article: string,
  outline: string,
  fallbacks: { draft?: string; sourceMarkdown?: string },
  emit: (event: GenerateProgressEvent) => void,
  statusPrefix: string,
  step: GenerateProgressEvent['step'] = 'polish'
): string {
  const result = enforceOutlineH2Contract(article, outline, fallbacks)
  const note = formatOutlineH2ContractStatus(result.report)
  if (result.fixed) {
    emit({
      type: 'status',
      step,
      message: note
        ? `${statusPrefix}大纲 H2 契约已对齐（${note}）`
        : `${statusPrefix}大纲 H2 契约已对齐`
    })
  } else if (note) {
    emit({
      type: 'status',
      step,
      message: `${statusPrefix}大纲 H2 契约未完全满足：${note}`
    })
  }
  return result.article
}

/** Optimize-mode product hints: promote selected product without create-mode "ban from generic parts". */
function getOptimizeSectionProductBlocks(
  productName: string | undefined,
  mentionLock: string,
  sectionKind: DraftSectionProductKind
): string {
  if (!productName) return mentionLock

  const base = mentionLock || getUserContextPromptBlocksForSection(productName, mentionLock, sectionKind)
  const sectionExtra =
    sectionKind === 'quick-answer'
      ? getDraftQuickAnswerHint(productName)
      : sectionKind === 'conclusion'
        ? `Conclusion：可用 1 句自然回扣「${productName}」；勿展开硬广。`
        : sectionKind === 'faq'
          ? `FAQ：至多 1 个答案可轻量提及「${productName}」。`
          : sectionKind === 'intro'
            ? `Introduction：可在概述解决方案时轻量点名「${productName}」，勿做功能罗列。`
            : [
                `【优化模式 · 产品植入 — ${productName}】`,
                `用户已选择产品「${productName}」。在本节若自然相关（对比、替代方案、推荐），可保留或轻量强化对该产品的准确全名提及。`,
                '**禁止**为植入「' + productName + '」而删除、折叠或改写原文中的产品使用步骤 / how-to / 分步教程。',
                '勿删除原文中已有的该产品或其他产品可用步骤；勿改成 "this tool" 等泛称。',
                '禁止把整节改写成纯产品硬广，但允许 1–2 处自然植入。'
              ].join('\n')

  return [base, sectionExtra].filter(Boolean).join('\n\n')
}

function getOptimizeSectionActionHintWithProduct(
  pairing: ReturnType<typeof pairOutlineSectionWithSource>,
  productName?: string
): string {
  const base = getOptimizeSectionActionHint(pairing)
  if (!productName) return base
  return [
    base,
    `用户指定产品「${productName}」：即使本节动作为文本优化，也须保留/自然点名该产品全名，不得抹去或泛化。`
  ].join('\n')
}

async function draftOptimizedSections(
  llm: LlmConfig,
  title: string,
  outline: string,
  sourceMarkdown: string,
  sourceSections: OutlineSection[],
  audit: string,
  competitorInsights: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  wordRange: OptimizeWordRange,
  sourceWordTarget: number,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  resume?: DraftSectionResume
): Promise<string> {
  const { sections, log } = resolveOptimizeDraftSections(outline, sourceSections)
  const sanitizeNote = formatSectionSanitizeStatus(log)
  if (sanitizeNote) {
    emit({ type: 'status', step: 'draft', message: `大纲消毒：${sanitizeNote}…` })
  }

  const pairings = sections.map((section) => {
    const pairing = pairOutlineSectionWithSource(section, sourceSections, audit)
    if (
      /^introduction$/i.test(section.title.trim()) &&
      pairing.action === 'write_new' &&
      !pairing.sourceBody?.trim()
    ) {
      const leadIn = extractSourceLeadIn(sourceMarkdown)
      if (leadIn.trim()) {
        return {
          ...pairing,
          sourceTitle: 'Introduction',
          sourceBody: leadIn,
          match: 'exact' as const,
          action: 'text_polish' as const,
          reason: '原文 H1 与首个 H2 之间的开篇导语即 Introduction，就地润色、禁止重写',
          fromLeadIn: true
        }
      }
    }
    return pairing
  })
  const pairingSummary = pairings
    .map(
      (item, index) =>
        `${index + 1}. ${item.outlineTitle} → ${formatOptimizeSectionActionLabel(item.action)}`
    )
    .join('；')
  emit({
    type: 'status',
    step: 'draft',
    message: `大纲配对完成：${pairingSummary}`
  })

  const editorBlocks = getEditorPromptBlocks(wordRange)
  const sectionTitles = sections.map((section) => section.title)
  const articleTitle = extractSourceH1(sourceMarkdown, title)
  const draftSystemPrompt = buildOptimizeDraftSystemPrompt({
    articleTitle,
    langLock: articleLang.lock,
    languageLabel: articleLang.label,
    mentionLock: userContext.mentionLock,
    briefForPrompt: userContext.briefForPrompt,
    skillsText,
    editorBlocks,
    wordRangeLabel: wordRange.label
  })
  let fullDraft = resume?.initialDraft ?? `# ${articleTitle}\n\n`
  const startIndex = resume?.startIndex ?? 0

  for (let i = startIndex; i < sections.length; i += 1) {
    throwIfAborted()
    const section = sections[i]
    const pairing = pairings[i]
    const sectionWordBudget = getSectionWordBudget(section.title, sectionTitles, sourceWordTarget)
    const originalBody = pairing.sourceBody?.trim() ?? ''
    const hasOriginal = Boolean(originalBody) && pairing.action !== 'write_new'

    emit({
      type: 'status',
      step: 'draft',
      message: `正在优化第 ${i + 1}/${sections.length} 节：${section.title}（${formatOptimizeSectionActionLabel(pairing.action)}）`
    })

    const sectionProductKind = classifyDraftSectionProductKind(
      section.title,
      section.body,
      userContext.productName,
      { geo: Boolean(userContext.productName) }
    )
    const sectionUserContextBlocks = getOptimizeSectionProductBlocks(
      userContext.productName,
      userContext.mentionLock,
      sectionProductKind
    )
    const briefing =
      pairing.action === 'text_polish'
        ? { auditExcerpt: '', competitorExcerpt: '' }
        : excerptOptimizeSectionBriefing({
            sectionTitle: section.title,
            sourceTitle: pairing.sourceTitle,
            allSectionTitles: sectionTitles,
            audit,
            competitorInsights,
            action: pairing.action
          })

    const sectionLabel = `正在优化第 ${i + 1}/${sections.length} 节：${section.title}（${formatOptimizeSectionActionLabel(pairing.action)}）`
    let body = ''

    if (pairing.action === 'write_new' || !hasOriginal) {
      if (pairing.action !== 'write_new' && !hasOriginal) {
        emit({
          type: 'status',
          step: 'draft',
          message: `第 ${i + 1} 节「${section.title}」无原文底稿，已保留空节`
        })
      } else {
        const sectionText = await chatCompletion(
          llm,
          [
            { role: 'system', content: draftSystemPrompt },
            {
              role: 'user',
              content: [
                getOptimizeSectionActionHintWithProduct(pairing, userContext.productName),
                sectionUserContextBlocks,
                getIntroConclusionSectionHint(section.title),
                '',
                '编辑说明（来自优化大纲，必须落实）：',
                section.body.trim() ? section.body.trim() : '（无额外 bullet；按本节动作执行）',
                '',
                briefing.auditExcerpt ? '本节诊断要点（仅本节）：' : '',
                briefing.auditExcerpt,
                '',
                briefing.competitorExcerpt ? '本节竞品缺口（仅本节）：' : '',
                briefing.competitorExcerpt,
                '',
                `输出优化后的「${section.title}」正文。标题只用行首的 ##，不要写成列表或行内代码。`,
                `本节约 ${sectionWordBudget} 词。`
              ]
                .filter(Boolean)
                .join('\n')
            }
          ],
          {
            temperature: 0.25,
            cacheSystemPrefix: true,
            step: 'draft',
            label: sectionLabel,
            maxTokens: maxTokensForOptimizeSection(Math.max(sectionWordBudget, 280), globalMaxTokens)
          }
        )
        body = normalizeArticleMarkdown(stripLeadingSectionHeading(sectionText, section.title))
      }
    } else {
      const patchAction = pairing.action === 'text_polish' ? 'text_polish' : 'content_revise'
      const patchOptions = patchOptionsForAction(patchAction)
      let lastError = ''
      let applied = false

      const patchTokenCap = maxTokensForOptimizeSection(
        Math.max(countWords(originalBody), 200),
        globalMaxTokens
      )

      for (let attempt = 0; attempt < 2; attempt += 1) {
        throwIfAborted()
        const raw = await chatCompletion(
          llm,
          [
            { role: 'system', content: buildSectionPatchSystemPrompt(patchAction) },
            {
              role: 'user',
              content: [
                getOptimizeSectionActionHintWithProduct(pairing, userContext.productName),
                sectionUserContextBlocks,
                getIntroConclusionSectionHint(section.title),
                '',
                `--- 原文本节（${pairing.sourceTitle ?? section.title}）---`,
                originalBody,
                '---',
                '',
                '编辑说明（落成补丁，不要重写整节）：',
                section.body.trim() ? section.body.trim() : '（无额外 bullet；仅在确有薄弱句时 replace）',
                '',
                briefing.auditExcerpt ? '本节诊断要点（仅本节）：' : '',
                briefing.auditExcerpt,
                '',
                briefing.competitorExcerpt ? '本节竞品缺口（仅本节）：' : '',
                briefing.competitorExcerpt,
                '',
                lastError ? `上次补丁未应用：${lastError}。请按原文逐字引用 find 后重试。` : '',
                '只输出 JSON：{"ops":[...]}'
              ]
                .filter(Boolean)
                .join('\n')
            }
          ],
          {
            temperature: 0.2,
            jsonObject: true,
            step: 'draft',
            label: sectionLabel,
            maxTokens: patchTokenCap == null ? 4096 : Math.min(4096, patchTokenCap)
          }
        )

        const resolved = resolveOptimizePatch(raw, originalBody, patchOptions)
        if (resolved.ok) {
          body = normalizeArticleMarkdown(resolved.text)
          applied = true
          break
        }
        lastError = resolved.error
      }

      if (!applied) {
        body = originalBody
        emit({
          type: 'status',
          step: 'draft',
          message: `第 ${i + 1} 节「${section.title}」补丁未应用，已保留原文${lastError ? `（${lastError}）` : ''}`
        })
      }
    }

    const block = `## ${section.title}\n\n${body}\n\n`
    fullDraft += block
    emit({ type: 'chunk', text: block, step: 'draft' })
    resume?.onSectionComplete?.(i, sections.length, fullDraft.trim())
  }

  return reorderArticleMarkdown(fullDraft.trim())
}

function acceptOptimizedDraft(draft: string): string {
  return reorderArticleMarkdown(normalizeArticleMarkdown(draft))
}

export async function optimizeArticle(
  options: OptimizeArticleOptions,
  sender: WebContents
): Promise<{ ok: true; article: string } | { ok: false; message: string }> {
  const llmSelection = {
    presetId: options.resume?.options.llmPresetId ?? options.llmPresetId ?? '',
    model: options.resume?.options.llmModel ?? options.llmModel ?? ''
  }
  const appConfig = await getEffectiveConfig(
    llmSelection.presetId && llmSelection.model ? llmSelection : null
  )
  const llm = appConfig.llm
  const llmPre = resolveRoutedLlm(appConfig, 'preBodyAndMeta', llm)
  const llmBody = resolveRoutedLlm(appConfig, 'bodyWork', llm)
  const research = appConfig.research
  const globalMaxTokens = appConfig.llmMaxTokens
  const stepTokens = {
    intentExpand: resolveStepMaxTokens('intentExpand', globalMaxTokens),
    eeatExtract: resolveStepMaxTokens('eeatExtract', globalMaxTokens),
    optimizeAudit: resolveStepMaxTokens('optimizeAudit', globalMaxTokens),
    outline: resolveStepMaxTokens('outline', globalMaxTokens)
  }
  const firecrawlKey = research.firecrawlApiKey

  if (!llm.apiKey && !llmPre.apiKey && !llmBody.apiKey) {
    return { ok: false, message: '未配置 API Key，请在设置中填写 LLM 配置。' }
  }
  if (!llmPre.apiKey) {
    return { ok: false, message: '正文前/Meta 分工模型未配置 API Key，请检查 LLM 预设或关闭多模型分工。' }
  }
  if (!llmBody.apiKey) {
    return { ok: false, message: '正文与润色分工模型未配置 API Key，请检查 LLM 预设或关闭多模型分工。' }
  }
  if (!firecrawlKey) {
    return { ok: false, message: '未配置 Firecrawl API Key，请在设置 → 调研配置中填写。' }
  }

  let sourceUrl: string
  try {
    sourceUrl = normalizeSourceUrl(options.resume?.options.sourceUrl ?? options.sourceUrl)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'URL 无效' }
  }

  const userContext = parseUserWritingContext(
    options.resume?.options.extraInstructions ?? options.extraInstructions
  )

  return runWithTokenContext(createTokenRunContext('optimize', sourceUrl), async () => {
  const resume = options.resume
  const nextStep = resume?.nextStep ?? 'skills'

  const emit = (event: GenerateProgressEvent): void => {
    if (event.step) {
      updateTokenUsageContext({ step: event.step, stepLabel: event.message })
    }
    sender.send('article:progress', event)
  }

  const emitOptimizeCheckpoint = (checkpoint: OptimizePipelineCheckpoint): void => {
    emit({ type: 'checkpoint', checkpoint })
  }

  const buildOptimizeCheckpoint = (
    step: GenerateProgressEvent['step'] & string,
    partial: Omit<OptimizePipelineCheckpoint, 'kind' | 'assistantMessageId' | 'nextStep' | 'options'> &
      Partial<Pick<OptimizePipelineCheckpoint, 'options'>>
  ): OptimizePipelineCheckpoint => ({
    kind: 'optimize',
    assistantMessageId: resume?.assistantMessageId ?? '',
    nextStep: step as OptimizePipelineCheckpoint['nextStep'],
    options: {
      sourceUrl,
      extraInstructions: resume?.options.extraInstructions ?? options.extraInstructions,
      outputLanguage: resume?.options.outputLanguage ?? options.outputLanguage,
      llmPresetId: resume?.options.llmPresetId ?? options.llmPresetId,
      llmModel: resume?.options.llmModel ?? options.llmModel
    },
    ...partial
  })

  let outline = resume?.outline
  let audit = resume?.audit
  let sourceMarkdown = resume?.sourceMarkdown
  let sourceTitle = resume?.sourceTitle
  let competitorInsights = resume?.competitorInsights
  let wordRange: OptimizeWordRange | undefined
  let useSinglePass = resume?.useSinglePass
  const reusedPack = optimizeResearchPackMatchesUrl(options.reuseResearch, sourceUrl)
    ? options.reuseResearch
    : undefined

  try {
    emit({
      type: 'status',
      step: 'skills',
      message: resume?.statusLabel
        ? `继续优化：${resume.statusLabel}`
        : `① 加载优化 Skills…${userContext.productName ? `（产品：${userContext.productName}）` : ''}`
    })
    const skillBundles = await getEnabledSkillBundles('optimize')
    const skillsText = buildFullSkillsText(skillBundles)
    const stepSkills = getSkillsTextForStep('optimize', { bundles: skillBundles })

    let scraped: Awaited<ReturnType<typeof scrapeToMarkdown>>
    let sourceSections: OutlineSection[]

    if (shouldRunPipelineStep(nextStep, 'scrape', 'optimize') || !sourceMarkdown) {
      if (reusedPack) {
        emit({
          type: 'status',
          step: 'scrape',
          message: '② 复用上次页面抓取（跳过 Firecrawl）…'
        })
        scraped = {
          url: sourceUrl,
          title: reusedPack.sourceTitle || sourceUrl,
          markdown: reusedPack.sourceMarkdown
        }
        sourceMarkdown = scraped.markdown
        sourceTitle = scraped.title
        sourceSections = parseSourceSections(scraped.markdown)
        emit({
          type: 'research',
          step: 'scrape',
          message: '已复用上次页面抓取',
          researchSummary: reusedPack.researchSummary || buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown)
        })
      } else {
        emit({ type: 'status', step: 'scrape', message: '② 抓取页面正文…' })
        scraped = await scrapeToMarkdown(sourceUrl, firecrawlKey, OPTIMIZE_MAX_MARKDOWN_CHARS)
        validateSourceMarkdown(scraped.markdown)
        sourceMarkdown = scraped.markdown
        sourceTitle = scraped.title
        sourceSections = parseSourceSections(scraped.markdown)
        emit({
          type: 'research',
          step: 'scrape',
          message: '页面抓取完成',
          researchSummary: buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown)
        })
      }
    } else {
      scraped = {
        url: sourceUrl,
        title: sourceTitle ?? sourceUrl,
        markdown: sourceMarkdown!
      }
      sourceSections = parseSourceSections(sourceMarkdown!)
    }

    wordRange = getOptimizeWordRange(countWords(scraped.markdown))

    const articleLang = buildArticleLanguageContext(
      normalizeOutputLanguage(resume?.options.outputLanguage ?? options.outputLanguage)
    )
    const researchTopic = buildResearchTopicFromSource(
      scraped.title,
      scraped.markdown,
      sourceUrl
    )

    if (shouldRunPipelineStep(nextStep, 'extract', 'optimize')) {
      let searchQueries: string[] = [researchTopic]
      let searchIntentSummary = ''
      let competitorSources: ResearchSource[] = []
      if (!competitorInsights) {
        competitorInsights =
          articleLang.code === 'en'
            ? '(Competitor research disabled; gap analysis uses source page and Skills only.)'
            : '（未启用竞品调研，将仅基于原页面与 Skills 做缺口分析。）'
      }

      if (reusedPack) {
        emit({
          type: 'status',
          step: 'extract',
          message: '③ 复用上次竞品调研（跳过 Tavily / Firecrawl）…'
        })
        competitorInsights = reusedPack.competitorInsights
        emit({
          type: 'research',
          step: 'extract',
          message: '已复用上次竞品调研',
          researchSummary: reusedPack.researchSummary
        })
        emit({ type: 'researchPack', researchPack: reusedPack })
      } else if (canRunResearch(research)) {
        emit({ type: 'status', step: 'expand', message: '③ 搜索意图分析 & 拆解竞品搜索词…' })
        const intentResult = await analyzeAndExpandSearchQueries(llmPre, {
          topic: researchTopic,
          research,
          articleLang,
          extraInstructions: options.extraInstructions,
          userContext,
          sourceContext: scraped.markdown.slice(0, 1500),
          globalMaxTokens
        })
        searchQueries = intentResult.queries
        searchIntentSummary = [
          intentResult.intentSummary,
          intentResult.primaryKeyword ? `核心词：${intentResult.primaryKeyword}` : '',
          intentResult.searchIntentType ? `意图类型：${intentResult.searchIntentType}` : ''
        ]
          .filter(Boolean)
          .join('\n')

        emit({
          type: 'status',
          step: 'search',
          message: `④ 竞品调研：${searchQueries.length} 组关键词 → Top ${research.maxSearchResults}`
        })

        try {
          competitorSources = await searchWithQueries(
            searchQueries,
            research,
            (progress) => {
              throwIfAborted()
              emit({
                type: 'status',
                step: progress.phase === 'scrape' ? 'scrape' : 'search',
                message: progress.message
              })
            },
            { excludeUrls: [sourceUrl] }
          )

          emit({
            type: 'research',
            step: 'scrape',
            message: '竞品搜索与抓取完成',
            researchSummary: buildResearchDisplayMarkdown(researchTopic, searchQueries, competitorSources, research, {
              intentSummary: searchIntentSummary
            }),
            sources: mapSources(competitorSources)
          })

          emit({ type: 'status', step: 'extract', message: '⑤ 竞品缺口分析…' })
          const competitorCorpus = buildScrapedCorpus(competitorSources)
          competitorInsights = await extractCompetitorGapInsights(
            llmPre,
            researchTopic,
            sourceUrl,
            scraped.markdown,
            competitorCorpus,
            stepSkills,
            articleLang,
            userContext,
            stepTokens.eeatExtract
          )

          const researchSummary = buildResearchDisplayMarkdown(
            researchTopic,
            searchQueries,
            competitorSources,
            research,
            {
              intentSummary: searchIntentSummary,
              extractedPreview: competitorInsights
            }
          )
          emit({
            type: 'research',
            step: 'extract',
            message: '竞品缺口分析完成',
            researchSummary,
            sources: mapSources(competitorSources)
          })

          const pack: OptimizeResearchPack = {
            kind: 'optimize',
            sourceUrl,
            sourceTitle: scraped.title,
            sourceMarkdown: scraped.markdown,
            competitorInsights,
            researchSummary
          }
          emit({ type: 'researchPack', researchPack: pack })
        } catch (error) {
          const message = error instanceof Error ? error.message : '竞品调研失败'
          emit({
            type: 'status',
            step: 'search',
            message: `竞品调研跳过：${message}`
          })
          // Still persist source scrape so regenerate can skip Firecrawl for the page itself.
          const pack: OptimizeResearchPack = {
            kind: 'optimize',
            sourceUrl,
            sourceTitle: scraped.title,
            sourceMarkdown: scraped.markdown,
            competitorInsights: competitorInsights!,
            researchSummary: buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown)
          }
          emit({ type: 'researchPack', researchPack: pack })
        }
      } else {
        if (research.enabled) {
          emit({
            type: 'status',
            step: 'search',
            message: '未配置 Tavily / Firecrawl 或未启用调研，跳过竞品调研…'
          })
        }
        const pack: OptimizeResearchPack = {
          kind: 'optimize',
          sourceUrl,
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          competitorInsights: competitorInsights!,
          researchSummary: buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown)
        }
        emit({ type: 'researchPack', researchPack: pack })
      }

      emit({ type: 'status', step: 'extract', message: '⑥ 诊断原页面 SEO/GEO 问题…' })
      audit = await auditSourcePage(
        llmPre,
        scraped.url,
        scraped.title,
        scraped.markdown,
        competitorInsights!,
        stepSkills,
        articleLang,
        userContext,
        wordRange,
        stepTokens.optimizeAudit
      )

      emit({
        type: 'planning',
        step: 'plan',
        message: '诊断完成',
        planningSummary: audit
      })

      emitOptimizeCheckpoint(
        buildOptimizeCheckpoint('outline', {
          statusLabel: '⑥ 诊断完成',
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          audit,
          competitorInsights,
          wordRange
        })
      )
    }

    if (!audit || !competitorInsights || !wordRange) {
      return { ok: false, message: '无法继续：缺少诊断数据，请重新开始。' }
    }

    if (shouldRunPipelineStep(nextStep, 'outline', 'optimize')) {
      emit({ type: 'status', step: 'outline', message: '⑦ 按诊断大纲骨架生成优化大纲…' })
      outline = await generateOptimizedOutline(
        llmBody,
        scraped.markdown,
        audit,
        skillsText,
        articleLang,
        stepTokens.outline
      )
      useSinglePass = false
      const { sections: draftSections, log: sanitizeLog } = resolveOptimizeDraftSections(outline, sourceSections)
      const sanitizeNote = formatSectionSanitizeStatus(sanitizeLog)
      if (sanitizeNote) {
        emit({ type: 'status', step: 'outline', message: `⑦ 大纲消毒：${sanitizeNote}` })
      }
      outline = outlineSectionsToMarkdown(draftSections)
      const sectionCount = draftSections.length
      const articleTitle = extractSourceH1(scraped.markdown, scraped.title)
      emitOptimizeCheckpoint(
        buildOptimizeCheckpoint('draft', {
          statusLabel: `⑦ 大纲已完成 · 共 ${sectionCount} 节（将按大纲分段撰写）`,
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          audit,
          outline,
          competitorInsights,
          wordRange,
          useSinglePass: false,
          partialDraft: `# ${articleTitle}\n\n`,
          draftSectionIndex: 0,
          draftSectionCount: sectionCount
        })
      )
    }

    if (!outline) {
      return { ok: false, message: '无法继续：缺少优化大纲，请重新开始。' }
    }

    useSinglePass = false

    let draft = resume?.workText ?? resume?.partialDraft ?? ''
    if (shouldRunPipelineStep(nextStep, 'draft', 'optimize')) {
      emit({
        type: 'status',
        step: 'draft',
        message: resume?.draftSectionIndex
          ? `⑧ 继续按大纲分段优化（${(resume.draftSectionIndex ?? 0) + 1}/${resume.draftSectionCount ?? '?'} 起）…`
          : `⑧ 按大纲分段优化（${articleLang.label} · 先配对原文再撰写）…`
      })

      draft = await draftOptimizedSections(
        llmBody,
        scraped.title,
        outline,
        scraped.markdown,
        sourceSections,
        audit,
        competitorInsights,
        stepSkills,
        articleLang,
        userContext,
        wordRange,
        countWords(scraped.markdown),
        globalMaxTokens,
        emit,
        {
          startIndex: resume?.draftSectionIndex ?? 0,
          initialDraft:
            resume?.partialDraft ?? `# ${extractSourceH1(scraped.markdown, scraped.title)}\n\n`,
          onSectionComplete: (sectionIndex, total, partial) => {
            const nextIndex = sectionIndex + 1
            if (nextIndex < total) {
              emitOptimizeCheckpoint(
                buildOptimizeCheckpoint('draft', {
                  statusLabel: `⑧ 已完成第 ${nextIndex}/${total} 节`,
                  sourceTitle: scraped.title,
                  sourceMarkdown: scraped.markdown,
                  audit,
                  outline,
                  competitorInsights,
                  wordRange,
                  useSinglePass: false,
                  partialDraft: partial,
                  draftSectionIndex: nextIndex,
                  draftSectionCount: total
                })
              )
            } else {
              emitOptimizeCheckpoint(
                buildOptimizeCheckpoint('polish', {
                  statusLabel: '⑧ 章节优化完成',
                  sourceTitle: scraped.title,
                  sourceMarkdown: scraped.markdown,
                  audit,
                  outline,
                  competitorInsights,
                  wordRange,
                  useSinglePass: false,
                  partialDraft: partial,
                  workText: partial,
                  draftSectionCount: total
                })
              )
            }
          }
        }
      )
    }

    let polished =
      resume?.workText && !shouldRunPipelineStep(nextStep, 'polish', 'optimize') ? resume.workText : ''
    if (shouldRunPipelineStep(nextStep, 'polish', 'optimize')) {
      if (!draft) {
        return { ok: false, message: '无法继续：缺少优化稿，请重新开始。' }
      }
      emit({
        type: 'status',
        step: 'polish',
        message: '⑨ 跳过全文校对，保留分节补丁…'
      })
      polished = acceptOptimizedDraft(draft)
      polished = applyOutlineH2Contract(
        polished,
        outline,
        { draft, sourceMarkdown: scraped.markdown },
        emit,
        '⑨ ',
        'polish'
      )
      polished = reorderArticleMarkdown(polished)
      emit({ type: 'replace', text: polished, step: 'polish' })
      emitOptimizeCheckpoint(
        buildOptimizeCheckpoint('length', {
          statusLabel: '⑨ 终稿校对完成',
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          audit,
          outline,
          competitorInsights,
          wordRange,
          useSinglePass,
          workText: polished
        })
      )
    }

    let lengthAdjusted = polished
    if (shouldRunPipelineStep(nextStep, 'length', 'optimize')) {
      if (!polished) {
        return { ok: false, message: '无法继续：缺少校对稿，请重新开始。' }
      }
      // Resume into length may skip polish — still enforce H2 contract first.
      if (!shouldRunPipelineStep(nextStep, 'polish', 'optimize')) {
        polished = applyOutlineH2Contract(
          polished,
          outline,
          { draft: resume?.partialDraft, sourceMarkdown: scraped.markdown },
          emit,
          '⑩ ',
          'length'
        )
      }
      lengthAdjusted = reorderArticleMarkdown(
        await enforceOptimizeArticleWordCount(
          llmBody,
          polished,
          scraped.title,
          articleLang,
          wordRange,
          scraped.markdown,
          maxTokensForOptimizeLengthAdjust(countArticleWords(polished), globalMaxTokens),
          emit,
          (text) => emit({ type: 'replace', text, step: 'length' }),
          { audit }
        )
      )
      lengthAdjusted = applyOutlineH2Contract(
        lengthAdjusted,
        outline,
        { draft: polished, sourceMarkdown: scraped.markdown },
        emit,
        '⑩ ',
        'length'
      )
      lengthAdjusted = reorderArticleMarkdown(lengthAdjusted)
      emit({ type: 'replace', text: lengthAdjusted, step: 'length' })
      emitOptimizeCheckpoint(
        buildOptimizeCheckpoint('meta', {
          statusLabel: '⑩ 词数校准完成',
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          audit,
          outline,
          competitorInsights,
          wordRange,
          useSinglePass,
          workText: lengthAdjusted
        })
      )
    }

    let seoBlock = ''
    if (shouldRunPipelineStep(nextStep, 'meta', 'optimize')) {
      emit({ type: 'status', step: 'meta', message: '⑪ 生成 SEO Meta Title & Description…' })
      const seoMeta = await generateSeoMeta(
        llmPre,
        scraped.title,
        lengthAdjusted,
        articleLang,
        userContext.productName
      )
      seoBlock = formatSeoMetaBlock(seoMeta)
    }

    const finalArticle = `${seoBlock}${finalizeArticleMarkdown(lengthAdjusted || polished || draft, { preserveStructure: true })}`.trim()
    if (finalArticle) {
      emit({ type: 'replace', text: finalArticle, step: seoBlock ? 'meta' : 'length' })
    }
    emit({ type: 'done' })
    return { ok: true, article: finalArticle }
  } catch (error) {
    if (isAbortError(error)) {
      emit({ type: 'cancelled', message: '已中止生成' })
      return { ok: false, message: '已中止生成' }
    }
    const message = error instanceof Error ? error.message : '优化失败'
    emit({ type: 'error', message })
    return { ok: false, message }
  }
  })
}
