import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import { resolveStepMaxTokens, maxTokensForOptimizeFullDraft, maxTokensForOptimizeLengthAdjust, maxTokensForOptimizePolish, maxTokensForOptimizeSection } from '../config/llmTokenLimits'
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
  createRateLimitRetryStatus,
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
  findMatchingSourceSection,
  getOptimizePolishHint,
  getOptimizePolishSystemBlocks,
  getOptimizePromptBlocks,
  getOptimizeLengthPromptBlock,
  getOptimizeSinglePassHint,
  getOptimizeWordRange,
  getSourceSectionEditHint,
  isAuditRecommendedNewSection,
  isNewOptimizeSection,
  normalizeOptimizeSectionOrder,
  reorderArticleMarkdown,
  parseSourceSections,
  validateSourceMarkdown,
  type OptimizeWordRange,
  type OutlineSection
} from './optimizeStructure'
import { sanitizeOptimizeSections } from './optimizeSectionSanitize'
import {
  CONTENT_READABILITY_GUIDANCE,
  getIntroConclusionSectionHint,
  getSectionWordBudget,
  countArticleWords
} from './articleLength'
import { enforceOptimizeArticleWordCount } from './articleWordEnforcement'
import { formatSeoMetaBlock, generateSeoMeta } from './seoMeta'
import { getUserContextPromptBlocks, parseUserWritingContext } from './userContext'
import {
  classifyDraftSectionProductKind,
  getSectionDraftLayoutHint,
  getUserContextPromptBlocksForSection
} from './productMention'
import {
  type DraftSectionResume,
  type OptimizePipelineCheckpoint,
  shouldRunPipelineStep
} from './pipelineCheckpoint'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'

export interface OptimizeArticleOptions {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
  llmPresetId?: string
  llmModel?: string
  resume?: OptimizePipelineCheckpoint
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
  maxTokens: number
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
          '- 竞品有、原文缺的高价值内容：具体观点/步骤/技巧/FAQ（每条注明**建议插入的原文章节**）',
          '- 至少 3–8 条可执行要点，写入对应 H2',
          '### 建议删减或替换（REMOVE / REPLACE）',
          '- 原文中过时、失效、不可用、误导或与现状/E-E-A-T 不符的内容（注明章节；说明删或换的方向）',
          '- 空洞堆砌、重复、低信任表述也应列入删减候选',
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
  maxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容诊断专家。分析现有页面并制定**内容评估 + 按需增删**方案，不要撰写终稿。',
          '须明确：哪些优质内容保留并增强、哪些缺口应补充、哪些过时/不可用/不符合 E-E-A-T 的内容应删减或替换；禁止默认整节重写，也禁止为保篇幅而保留问题内容。',
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
          '2. **优质内容清单**：仍准确、可用、符合 E-E-A-T 的段落/章节（应保留；可注明可增量补充的竞品要点）',
          '3. **缺口清单**：原文遗漏但对用户有价值、**应补充**的具体要点（按章节列出）',
          '4. **删减/替换清单**：过时、不可用、误导、堆砌或损害 E-E-A-T 的内容（按章节列出，说明原因与处理方式）',
          '5. 结构与 SEO/GEO 问题（标题层级、关键词、缺失模块如 Quick Answer/FAQ 等）',
          '6. **建议局部改写**的句子（薄弱/难读/SEO 不足，具体到句）',
          '7. **优化动作清单**（KEEP+ENHANCE / ADD / REMOVE / REPLACE / **NEW H2**，按优先级）',
          '8. 大纲骨架（H2 列表）：保留原文章节顺序；**诊断建议的新模块须用 `[新增 H2] 标题` 标出**并注明插入位置（before/after 某原文章节）',
          '9. **建议新增章节**（可选）：每条 `- [NEW H2] 标题 | insert before/after 「原文章节名」| 要点摘要`',
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
  maxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content:
          '你是内容优化编辑。在大纲各 ## 章节下补充编辑要点 bullet：**KEEP+ENHANCE / ADD / REMOVE / REPLACE / 局部改写**；若诊断报告含 `[新增 H2]` / `[NEW H2]` 而大纲中缺失，**可插入该 ## 标题**到诊断指定位置（before/after 某原文章节）。**必须保留**大纲中已有的 ## Quick Answer / ## FAQ 等 GEO 新增模块（即使原文没有对应章节）。'
      },
      {
        role: 'user',
        content: [
          '在以下大纲各 ## 章节下补充 1–3 条具体编辑说明（来自诊断报告）。',
          '可依据诊断 **新增** 标记为 `[新增 H2]` / `[NEW H2]` 的 ## 标题并插入正确位置；不得删除已有原文章节 ## 标题；**不得删除 ## Quick Answer / ## FAQ 等 GEO 模块**；不得无诊断依据地增删其他章节。',
          `语言：${articleLang.label}`,
          '',
          '--- 诊断报告 ---',
          audit.slice(0, 6000),
          '',
          '--- 大纲（仅可补充 bullet）---',
          anchoredOutline
        ].join('\n')
      }
    ],
    { temperature: 0.25, maxTokens }
  )
}

async function optimizeArticleSinglePass(
  llm: LlmConfig,
  sourceMarkdown: string,
  title: string,
  audit: string,
  competitorInsights: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  wordRange: OptimizeWordRange,
  globalMaxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深 SEO/GEO 编辑。在**原文上就地优化**：先评估内容质量，**优质处保留并增量增强，问题处删减或替换**。',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          skillsText ? `Skills：\n${skillsText}` : '',
          getEditorPromptBlocks(wordRange)
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `页面标题：${title}`,
          userContext.briefForPrompt,
          '',
          getOptimizeSinglePassHint(wordRange.label),
          '',
          '请输出**完整优化后 Markdown 文章**：',
          '- 保留原文 H2/H3 顺序；**优质内容**保留有效原句并可增量补充竞品/诊断要点',
          '- **保留文首导语**：H1 下方、首个正文 Part 前的段落须保留为 ## Introduction 或等价开篇（不可整段删除）',
          '- **模块顺序**：Quick Answer → Introduction → 正文 Part → FAQ → Conclusion（FAQ 须在 Conclusion 之前）',
          '- **执行诊断 ADD / NEW H2**：补充缺口、新增诊断标记的 H2 章节',
          '- **执行诊断 REMOVE/REPLACE**：删减过时、不可用、误导或不符合 E-E-A-T 的内容；终稿变短是正常结果',
          '- 直接输出正文，不要写修改说明',
          '- 不要用 ```markdown 代码围栏包裹正文',
          '',
          '--- 诊断 ---',
          audit.slice(0, 5000),
          '',
          '--- 竞品缺口 ---',
          competitorInsights.slice(0, 3000),
          '',
          '--- 原文（必须在此基础上就地编辑）---',
          sourceMarkdown
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.25, maxTokens: maxTokensForOptimizeFullDraft(countWords(sourceMarkdown), globalMaxTokens) }
  )
}

async function generateOptimizedOutline(
  llm: LlmConfig,
  sourceMarkdown: string,
  audit: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  maxTokens: number
): Promise<string> {
  const anchored = buildAnchoredOutline(sourceMarkdown, audit, skillsText)
  return enrichAnchoredOutline(llm, anchored, audit, articleLang, maxTokens)
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

  const editorBlocks = getEditorPromptBlocks(wordRange)
  const sectionTitles = sections.map((section) => section.title)
  const articleTitle = extractSourceH1(sourceMarkdown, title)
  let fullDraft = resume?.initialDraft ?? `# ${articleTitle}\n\n`
  const startIndex = resume?.startIndex ?? 0

  for (let i = startIndex; i < sections.length; i += 1) {
    throwIfAborted()
    const section = sections[i]
    const sectionWordBudget = getSectionWordBudget(section.title, sectionTitles, sourceWordTarget)
    const originalSection = findMatchingSourceSection(section.title, sourceSections)
    const isAuditNewH2 = isAuditRecommendedNewSection(section.title, audit)
    const isNewSection =
      (isNewOptimizeSection(section.title, audit) && !originalSection) || isAuditNewH2

    emit({
      type: 'status',
      step: 'draft',
      message: `正在优化第 ${i + 1}/${sections.length} 节：${section.title}`
    })

    const sectionProductKind = classifyDraftSectionProductKind(
      section.title,
      section.body,
      userContext.productName,
      { geo: Boolean(userContext.productName) }
    )
    const sectionLayoutHint = getSectionDraftLayoutHint({
      sectionTitle: section.title,
      sectionBody: section.body,
      productName: userContext.productName,
      geo: Boolean(userContext.productName)
    })
    const sectionUserContextBlocks = getUserContextPromptBlocksForSection(
      userContext.productName,
      userContext.mentionLock,
      sectionProductKind
    )

    const sectionText = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是 SEO/GEO 内容编辑。对本节做**内容评估 + 按需增删**：优质原句保留并增量补充，过时/不可用/低 E-E-A-T 内容删减或替换。',
            articleLang.lock,
            sectionUserContextBlocks,
            skillsText ? `Skills：\n${skillsText}` : '',
            editorBlocks,
            '只输出本节 Markdown 正文（不要 ## 标题行），不要解释修改过程。'
          ]
            .filter(Boolean)
            .join('\n\n')
        },
        {
          role: 'user',
          content: [
            `页面标题：${articleTitle}`,
            `输出语言：${articleLang.label}（与原文一致）`,
            userContext.briefForPrompt,
            getSourceSectionEditHint({
              isNewSection,
              hasOriginal: Boolean(originalSection) && !isAuditNewH2,
              sectionTitle: section.title,
              isAuditNewH2
            }),
            getIntroConclusionSectionHint(section.title),
            sectionLayoutHint,
            '',
            originalSection ? `--- 原文本节 ---\n${originalSection.body.trim()}\n---` : '',
            '',
            '编辑说明（来自大纲/诊断，仅作局部修改参考）：',
            section.body.trim() ? section.body.trim() : '',
            '',
            '诊断摘要：',
            audit.slice(0, 2500),
            '',
            '可补充的竞品缺口（优质章节须写入本节相关处）：',
            competitorInsights.slice(0, 2000),
            '',
            `输出优化后的「${section.title}」正文。`,
            `词数参考：${wordRange.label}；本节约 ${sectionWordBudget} 词。`
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      {
        temperature: 0.25,
        maxTokens: maxTokensForOptimizeSection(
          isAuditNewH2
            ? Math.max(sectionWordBudget, 280)
            : countWords(originalSection?.body ?? ''),
          globalMaxTokens
        )
      }
    )

    const block = `## ${section.title}\n\n${sectionText.trim()}\n\n`
    fullDraft += block
    emit({ type: 'chunk', text: block, step: 'draft' })
    resume?.onSectionComplete?.(i, sections.length, fullDraft.trim())
  }

  return reorderArticleMarkdown(fullDraft.trim())
}

async function polishOptimizedArticle(
  llm: LlmConfig,
  draft: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  wordRange: OptimizeWordRange,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<string> {
  emit({ type: 'status', step: 'polish', message: '⑨ 终稿校对（语法与结构完整性）…' })
  emit({ type: 'reset' })

  const polishMaxTokens = maxTokensForOptimizePolish(countWords(draft), globalMaxTokens)

  const polished = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是校对编辑。对**已优化稿**做终稿校对：语法、衔接、可读性与模块完整性；不是整篇重写。',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          getOptimizePolishSystemBlocks(),
          CONTENT_READABILITY_GUIDANCE
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          '对以下优化稿做终稿校对：',
          `- 保持${articleLang.label}`,
          getOptimizePolishHint(),
          `- 全文词数参考：${wordRange.label}`,
          '- 直接输出 Markdown 正文',
          '- 不要用 ```markdown 代码围栏包裹正文',
          '',
          draft
        ].join('\n')
      }
    ],
    {
      temperature: 0.2,
      maxTokens: polishMaxTokens,
      step: 'polish',
      label: '终稿校对',
      onRateLimitRetry: createRateLimitRetryStatus('⑨ 终稿校对（语法与结构完整性）…', (message) =>
        emit({ type: 'status', step: 'polish', message })
      )
    }
  )

  onChunk(reorderArticleMarkdown(normalizeArticleMarkdown(polished)))
  return reorderArticleMarkdown(normalizeArticleMarkdown(polished))
}

export async function optimizeArticle(
  options: OptimizeArticleOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const llmSelection = {
    presetId: options.resume?.options.llmPresetId ?? options.llmPresetId ?? '',
    model: options.resume?.options.llmModel ?? options.llmModel ?? ''
  }
  const appConfig = await getEffectiveConfig(
    llmSelection.presetId && llmSelection.model ? llmSelection : null
  )
  const llm = appConfig.llm
  const research = appConfig.research
  const globalMaxTokens = appConfig.llmMaxTokens
  const stepTokens = {
    intentExpand: resolveStepMaxTokens('intentExpand', globalMaxTokens),
    eeatExtract: resolveStepMaxTokens('eeatExtract', globalMaxTokens),
    optimizeAudit: resolveStepMaxTokens('optimizeAudit', globalMaxTokens),
    outline: resolveStepMaxTokens('outline', globalMaxTokens)
  }
  const firecrawlKey = research.firecrawlApiKey

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在设置中填写 LLM 配置。' }
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

  const userContext = parseUserWritingContext(options.extraInstructions)

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

  try {
    emit({
      type: 'status',
      step: 'skills',
      message: resume?.statusLabel ? `继续优化：${resume.statusLabel}` : '① 加载优化 Skills…'
    })
    const skillBundles = await getEnabledSkillBundles('optimize')
    const skillsText = buildFullSkillsText(skillBundles)
    const stepSkills = getSkillsTextForStep('optimize', { bundles: skillBundles })

    let scraped: Awaited<ReturnType<typeof scrapeToMarkdown>>
    let sourceSections: OutlineSection[]

    if (shouldRunPipelineStep(nextStep, 'scrape', 'optimize') || !sourceMarkdown) {
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

      if (canRunResearch(research)) {
        emit({ type: 'status', step: 'expand', message: '③ 搜索意图分析 & 拆解竞品搜索词…' })
        const intentResult = await analyzeAndExpandSearchQueries(llm, {
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
            llm,
            researchTopic,
            sourceUrl,
            scraped.markdown,
            competitorCorpus,
            stepSkills,
            articleLang,
            userContext,
            stepTokens.eeatExtract
          )

          emit({
            type: 'research',
            step: 'extract',
            message: '竞品缺口分析完成',
            researchSummary: buildResearchDisplayMarkdown(researchTopic, searchQueries, competitorSources, research, {
              intentSummary: searchIntentSummary,
              extractedPreview: competitorInsights
            }),
            sources: mapSources(competitorSources)
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '竞品调研失败'
          emit({
            type: 'status',
            step: 'search',
            message: `竞品调研跳过：${message}`
          })
        }
      } else if (research.enabled) {
        emit({
          type: 'status',
          step: 'search',
          message: '未配置 Tavily / Firecrawl 或未启用调研，跳过竞品调研…'
        })
      }

      emit({ type: 'status', step: 'extract', message: '⑥ 诊断原页面 SEO/GEO 问题…' })
      audit = await auditSourcePage(
        llm,
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
      emit({ type: 'status', step: 'outline', message: '⑦ 基于原文章节生成优化大纲…' })
      outline = await generateOptimizedOutline(
        llm,
        scraped.markdown,
        audit,
        skillsText,
        articleLang,
        stepTokens.outline
      )
      useSinglePass = sourceSections.length <= 1
      const { sections: draftSections, log: sanitizeLog } = resolveOptimizeDraftSections(outline, sourceSections)
      const sanitizeNote = formatSectionSanitizeStatus(sanitizeLog)
      if (sanitizeNote) {
        emit({ type: 'status', step: 'outline', message: `⑦ 大纲消毒：${sanitizeNote}` })
      }
      if (!useSinglePass) {
        outline = outlineSectionsToMarkdown(draftSections)
      }
      const sectionCount = useSinglePass ? 1 : draftSections.length
      const articleTitle = extractSourceH1(scraped.markdown, scraped.title)
      emitOptimizeCheckpoint(
        buildOptimizeCheckpoint('draft', {
          statusLabel: `⑦ 大纲已完成 · 共 ${sectionCount} 节`,
          sourceTitle: scraped.title,
          sourceMarkdown: scraped.markdown,
          audit,
          outline,
          competitorInsights,
          wordRange,
          useSinglePass,
          partialDraft: `# ${articleTitle}\n\n`,
          draftSectionIndex: 0,
          draftSectionCount: sectionCount
        })
      )
    }

    if (!outline) {
      return { ok: false, message: '无法继续：缺少优化大纲，请重新开始。' }
    }

    if (useSinglePass == null) {
      useSinglePass = sourceSections.length <= 1
    }

    let draft = resume?.workText ?? resume?.partialDraft ?? ''
    if (shouldRunPipelineStep(nextStep, 'draft', 'optimize')) {
      emit({
        type: 'status',
        step: 'draft',
        message: useSinglePass
          ? `⑧ 就地优化全文（${articleLang.label} · 内容评估 + 按需增删）…`
          : resume?.draftSectionIndex
            ? `⑧ 继续按章节优化（${(resume.draftSectionIndex ?? 0) + 1}/${resume.draftSectionCount ?? '?'} 起）…`
            : `⑧ 按章节优化（${articleLang.label} · 保留增强 / 删减替换）…`
      })

      if (useSinglePass) {
        const optimized = normalizeArticleMarkdown(
          await optimizeArticleSinglePass(
          llm,
          scraped.markdown,
          scraped.title,
          audit,
          competitorInsights,
          stepSkills,
          articleLang,
          userContext,
          wordRange,
          globalMaxTokens
          )
        )
        draft = reorderArticleMarkdown(
          optimized.startsWith('#')
            ? optimized
            : `# ${extractSourceH1(scraped.markdown, scraped.title)}\n\n${optimized}`
        )
        emit({ type: 'chunk', text: draft, step: 'draft' })
        emitOptimizeCheckpoint(
          buildOptimizeCheckpoint('polish', {
            statusLabel: '⑧ 全文优化完成',
            sourceTitle: scraped.title,
            sourceMarkdown: scraped.markdown,
            audit,
            outline,
            competitorInsights,
            wordRange,
            useSinglePass: true,
            partialDraft: draft,
            workText: draft
          })
        )
      } else {
        draft = await draftOptimizedSections(
          llm,
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
    }

    let polished =
      resume?.workText && !shouldRunPipelineStep(nextStep, 'polish', 'optimize') ? resume.workText : ''
    if (shouldRunPipelineStep(nextStep, 'polish', 'optimize')) {
      if (!draft) {
        return { ok: false, message: '无法继续：缺少优化稿，请重新开始。' }
      }
      polished = await polishOptimizedArticle(
        llm,
        draft,
        articleLang,
        userContext,
        wordRange,
        globalMaxTokens,
        emit,
        (text) => emit({ type: 'chunk', text, step: 'polish' })
      )
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
      lengthAdjusted = reorderArticleMarkdown(
        await enforceOptimizeArticleWordCount(
        llm,
        polished,
        scraped.title,
        articleLang,
        wordRange,
        scraped.markdown,
        maxTokensForOptimizeLengthAdjust(countArticleWords(polished), globalMaxTokens),
        emit,
        (text) => emit({ type: 'chunk', text, step: 'length' })
        )
      )
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

    if (shouldRunPipelineStep(nextStep, 'meta', 'optimize')) {
      emit({ type: 'status', step: 'meta', message: '⑪ 生成 SEO Meta Title & Description…' })
      const seoMeta = await generateSeoMeta(
        llm,
        scraped.title,
        lengthAdjusted,
        articleLang,
        userContext.productName
      )
      emit({ type: 'prepend', text: formatSeoMetaBlock(seoMeta), step: 'meta' })
    }

    emit({ type: 'clearCheckpoint' })
    emit({ type: 'done' })
    return { ok: true }
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
