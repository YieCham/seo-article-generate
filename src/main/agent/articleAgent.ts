import type { WebContents } from 'electron'
import { throwIfAborted } from './abortContext'
import { isAbortError } from './articleRunRegistry'
import { getEffectiveConfig } from '../config/configStore'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext
} from '../token/tokenUsageContext'
import { maxTokensForFullArticleOutput, maxTokensForOutlineSkeleton, maxTokensForPlanning, resolveStepMaxTokens } from '../config/llmTokenLimits'
import type { ResearchConfig } from '../config/types'
import { getEnabledSkillBundles, type EnabledSkillBundle } from './skillManager'
import {
  buildFullSkillsText,
  getEnabledSkillIdsFromBundles,
  getSkillsTextForStep
} from './skillPipeline'
import {
  LENGTH_EDIT_SCOPE_RULE,
  MULTI_METHOD_STRUCTURE_PRESERVE_RULE,
  POLISH_EDIT_SCOPE_RULE,
  PRESERVE_MARKDOWN_HEADINGS_RULE
} from './articleStructurePreserve'
import { normalizeOptimizeSectionOrder, reorderArticleMarkdown } from './optimizeStructure'
import {
  chatCompletion,
  createRateLimitRetryStatus,
  parseOutlineSections,
  type LlmConfig
} from './llmClient'
import {
  buildResearchDisplayMarkdown,
  buildScrapedCorpus,
  canRunResearch,
  searchWithQueries,
  type ResearchSource
} from '../research/researchService'
import { getLanguageLabel } from '../research/localeOptions'
import {
  detectTopicLanguage,
  getArticleLanguageLock,
  type TopicLanguageCode
} from './topicLanguage'
import { normalizeOutputLanguage, type OutputLanguageCode } from './outputLanguage'
import { analyzeAndExpandSearchQueries } from './searchIntent'
import { getGeoSeoPromptBlock } from './geoSeoStructure'
import {
  getTopListPromptBlock,
  parseTopListCount,
  TOP_LIST_OUTLINE_SKELETON,
  TOP_LIST_PLAN_GUIDANCE
} from './topListStructure'
import {
  classifyDraftSectionProductKind,
  type DraftSectionProductKind,
  getDraftGenericPartHint,
  getDraftProductPartHint,
  getDraftQuickAnswerHint,
  getExtractProductHint,
  getPolishProductHint,
  getProductMentionSupplement,
  getUserContextPromptBlocksForSection,
  isQuickAnswerSection
} from './productMention'
import {
  getReviewPromptBlock,
  getReviewSectionDraftHint,
  getReviewSectionWordBudget,
  isReviewAlternativeSection,
  REVIEW_OUTLINE_SKELETON,
  REVIEW_PLAN_GUIDANCE
} from './reviewStructure'
import {
  buildOutlineSkeletonRules,
  buildPlanSkeletonRules,
  compactInternalPlan,
  enforceOutlineSkeleton,
  enrichOutlineMethodModes,
  estimateOutlineSectionCount,
  extractPlanLayoutDirectives,
  sectionOutlineHasMethodStubs
} from './outlineSkeleton'
import {
  countArticleWords,
  getArticleLengthPromptBlock,
  getArticleLengthBounds,
  getSectionWordBudget,
  maxTokensForWordBudget,
  resolveSectionDraftTokenPlan,
  getIntroConclusionSectionHint,
  getFaqSectionHint,
  getFaqHeadingGuidance,
  getIntroConclusionPolishHint,
  isFaqSection,
  MIN_FAQ_QUESTIONS,
  MAX_FAQ_QUESTIONS,
  MAX_FAQ_SECTION_WORDS,
  type ArticleLengthBounds
} from './articleLength'
import { enforceArticleWordCount } from './articleWordEnforcement'
import { formatSeoMetaBlock, generateSeoMeta } from './seoMeta'
import { parseUserWritingContext, getUserContextPromptBlocks, type UserWritingContext } from './userContext'
import {
  formatWritingBriefForPrompt,
  formatWritingBriefForSection,
  generateWritingBrief,
  type WritingBrief
} from './writingBrief'
import {
  getPrimaryKeywordOutlineHint,
  getPrimaryKeywordH1Hint,
  getPrimaryKeywordPolishHint,
  getPrimaryKeywordSectionHint,
  resolveArticleH1,
  getWritingPromptBlocks
} from './topicKeyword'
import { VOCABULARY_STYLE_HINT_ZH } from './writingStyle'
import {
  type CreatePipelineCheckpoint,
  type DraftSectionResume,
  type OptimizePipelineCheckpoint,
  type PipelineCheckpoint,
  shouldRunPipelineStep
} from './pipelineCheckpoint'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'

export interface GenerateArticleOptions {
  topic: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
  llmPresetId?: string
  llmModel?: string
  resume?: CreatePipelineCheckpoint
}

export interface ResearchSourcePreview {
  title: string
  url: string
  snippet: string
  position: number
  scraped: boolean
  error?: string
}

export type PipelineStep =
  | 'skills'
  | 'expand'
  | 'search'
  | 'scrape'
  | 'extract'
  | 'plan'
  | 'outline'
  | 'draft'
  | 'polish'
  | 'length'
  | 'meta'

export interface GenerateProgressEvent {
  type:
    | 'chunk'
    | 'status'
    | 'error'
    | 'done'
    | 'cancelled'
    | 'replace'
    | 'research'
    | 'reset'
    | 'planning'
    | 'prepend'
    | 'checkpoint'
    | 'clearCheckpoint'
  text?: string
  message?: string
  step?: PipelineStep
  researchSummary?: string
  planningSummary?: string
  sources?: ResearchSourcePreview[]
  checkpoint?: PipelineCheckpoint
}

interface ArticleLanguageContext {
  code: TopicLanguageCode
  lock: string
  label: string
}

export function mapSources(sources: ResearchSource[]): ResearchSourcePreview[] {
  return sources.map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    position: item.position,
    scraped: Boolean(item.markdown),
    error: item.scrapeError
  }))
}

interface PipelineSkillContext {
  bundles: EnabledSkillBundle[]
  skillsText: string
  enabledSkillIds: string[]
}

function getStructurePromptBlocks(
  skillsText: string,
  productName?: string,
  enabledSkillIds?: string[]
): {
  combined: string
  geoBlock: string
  reviewBlock: string
  topListBlock: string
  lengthBlock: string
  wordBounds: ArticleLengthBounds
} {
  const topListBlock = getTopListPromptBlock(skillsText, productName, enabledSkillIds)
  const geoBlock = topListBlock ? '' : getGeoSeoPromptBlock(skillsText, enabledSkillIds)
  const reviewBlock = getReviewPromptBlock(skillsText, enabledSkillIds)
  const wordBounds = getArticleLengthBounds(skillsText, enabledSkillIds)
  const lengthBlock = getArticleLengthPromptBlock(skillsText, enabledSkillIds)
  const productMentionBlock = getProductMentionSupplement(productName, {
    review: Boolean(reviewBlock),
    topList: Boolean(topListBlock),
    geo: Boolean(geoBlock)
  })
  return {
    geoBlock,
    reviewBlock,
    topListBlock,
    lengthBlock,
    wordBounds,
    combined: [lengthBlock, productMentionBlock, topListBlock, geoBlock, reviewBlock]
      .filter(Boolean)
      .join('\n\n')
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

export { expandSearchQueries } from './searchIntent'

function buildSectionOutlineContext(
  sections: ReturnType<typeof parseOutlineSections>,
  index: number
): string {
  const parts: string[] = []
  if (index > 0) {
    const prev = sections[index - 1]
    parts.push(`上一节：## ${prev.title}\n${prev.body.trim().slice(0, 280)}`)
  }
  const current = sections[index]
  parts.push(`本节：## ${current.title}\n${current.body.trim()}`)
  if (index < sections.length - 1) {
    const next = sections[index + 1]
    parts.push(`下一节：## ${next.title}\n${next.body.trim().slice(0, 280)}`)
  }
  return parts.join('\n\n')
}

async function extractEeatInsights(
  llm: LlmConfig,
  topic: string,
  corpus: string,
  skillCtx: PipelineSkillContext,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext,
  maxTokens: number
): Promise<string> {
  const stepSkills = getSkillsTextForStep('extract', { bundles: skillCtx.bundles })
  if (!corpus.trim()) {
    return articleLang.code === 'en'
      ? '(No scraped content available; writing from topic and Skills.)'
      : '（未抓取到可用正文，将基于主题与 Skills 直接创作。）'
  }

  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深内容评估师，熟悉 Google E-E-A-T 原则（Experience, Expertise, Authoritativeness, Trustworthiness）。',
          '这是内部分析步骤：可用中文或英文输出萃取笔记，但须保留可翻译的事实与论点。',
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          stepSkills ? `写作规范参考：\n${stepSkills}` : ''
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `阅读以下竞品页面内容，提取符合 E-E-A-T 的高价值信息：`,
          '- 有数据/研究支撑的结论',
          '- 可引用的专家观点或方法框架（勿伪造具体人名机构）',
          '- 真实场景案例、用户痛点、常见误区',
          '- 竞品文章的共性套路与内容缺口',
          userContext.productName ? getExtractProductHint(userContext.productName) : '',
          '',
          '忽略：水词、同质化废话、硬广、导航残留。',
          '',
          `主题：${topic}`,
          getPrimaryKeywordOutlineHint(topic),
          userContext.briefForPrompt,
          `后续成文语言（必须遵守）：${articleLang.label}`,
          '',
          '---',
          corpus,
          '---',
          '',
          '以 Markdown 结构化输出萃取结果，分条清晰，便于后续写大纲。'
        ].join('\n')
      }
    ],
    { temperature: 0.3, maxTokens: maxTokens }
  )
}

async function generateArticlePlan(
  llm: LlmConfig,
  topic: string,
  writingBrief: WritingBrief,
  skillCtx: PipelineSkillContext,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext,
  maxTokens: number
): Promise<string> {
  const { reviewBlock, topListBlock, wordBounds } = getStructurePromptBlocks(
    skillCtx.skillsText,
    userContext.productName,
    skillCtx.enabledSkillIds
  )
  const stepSkills = getSkillsTextForStep('plan', { bundles: skillCtx.bundles })
  const useSectionLayoutPlan = !reviewBlock && !topListBlock
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容策略师。完成内部分析与规划，不要撰写正文或章节大纲。',
          articleLang.lock,
          buildPlanSkeletonRules(useSectionLayoutPlan),
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          stepSkills ? `领域写作要点（节选）：\n${stepSkills}` : ''
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          getPrimaryKeywordOutlineHint(topic),
          userContext.briefForPrompt,
          userContext.productName
            ? reviewBlock
              ? `规划须为被测评产品分配五个 Part + 对比表 + FAQ 的顺序与目的（各 1 句）。`
              : topListBlock
                ? `规划 Top ${parseTopListCount(topic)} 榜单结构；判断「${userContext.productName}」准入与排位。`
                : `规划通用 Part 与「${userContext.productName}」产品 Part 的位置（各 1 句目的）。`
            : '',
          reviewBlock ? REVIEW_PLAN_GUIDANCE : '',
          topListBlock ? TOP_LIST_PLAN_GUIDANCE : '',
          '',
          '在 <thinking> 与 </thinking> 标签内输出内部规划，包含：',
          '1. 搜索意图与读者痛点（≤5 bullet）',
          '2. 竞品/行业要点如何整合（≤5 bullet）',
          `3. **${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS}** 个 FAQ **问题句**（无答案）`,
          useSectionLayoutPlan
            ? '4. **Part 结构规划**（每条格式：`- Part N · [标题] · layout: <type> · [1 句目的]`；layout 取值见 system 规则；**不要**输出 ## 大纲）'
            : '4. 各 Part 名称 + 差异化策略（**不要**输出 ## 大纲或正文段落）',
          '',
          '写作简报（摘要）：',
          formatWritingBriefForPrompt(writingBrief),
          reviewBlock
            ? `终稿 ${wordBounds.min}–${wordBounds.max} 词；被测评产品占正文主体。`
            : topListBlock
              ? `终稿 ${wordBounds.min}–${wordBounds.max} 词；榜单 Part 只规划 N 个产品席位名称。`
              : `终稿 ${wordBounds.min}–${wordBounds.max} 词；建议 2–4 个 Part。`,
          `语言：${articleLang.label}`
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.35, maxTokens: maxTokens }
  )

  if (raw.includes('<thinking>')) return raw.trim()
  const trimmed = raw.trim()
  if (!trimmed) {
    return '<thinking>\n（规划步骤未返回内容，将基于写作简报继续。）\n</thinking>'
  }
  return `<thinking>\n${trimmed}\n</thinking>`
}

async function generateDifferentiatedOutline(
  llm: LlmConfig,
  topic: string,
  writingBrief: WritingBrief,
  plan: string,
  skillCtx: PipelineSkillContext,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  maxTokens: number
): Promise<string> {
  const { geoBlock, reviewBlock, topListBlock, wordBounds } = getStructurePromptBlocks(
    skillCtx.skillsText,
    userContext.productName,
    skillCtx.enabledSkillIds
  )

  const structureSkeleton = topListBlock
    ? TOP_LIST_OUTLINE_SKELETON
    : reviewBlock
      ? REVIEW_OUTLINE_SKELETON
      : geoBlock
        ? 'GEO 骨架：首行 `#` SEO H1 → Quick Answer → Introduction → 2–3 个通用 Part（按规划 layout 标签展开）→ 1 个产品 Part（layout: product-tutorial）→ 与主题相关的 FAQ 节（仅问题）→ Conclusion（2–3 bullets）。'
        : '骨架：首行 `#` SEO H1 → Introduction → 2–4 个 Part（严格执行规划中的 layout 标签）→ 与主题相关的 FAQ 节（仅问题）→ Conclusion。'

  const planLayoutDirectives =
    !reviewBlock && !topListBlock ? extractPlanLayoutDirectives(plan) : ''

  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是内容策略主编。只输出**文章结构骨架**，不要写正文。',
          articleLang.lock,
          buildOutlineSkeletonRules(wordBounds),
          getFaqHeadingGuidance(),
          getPrimaryKeywordOutlineHint(topic),
          getPrimaryKeywordH1Hint(topic)
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          userContext.briefForPrompt,
          userContext.productName && topListBlock
            ? `用户产品「${userContext.productName}」：符合 Topic 则 ### 1；否则单独 Also Worth Considering Part。`
            :             userContext.productName && !reviewBlock && !topListBlock
              ? `须规划**一个**独立产品 Part（标题含产品名 + How to/with 语义），仅在该 Part 内写 ### Why … + ### Step-by-Step stub；**其他 Part 不得**出现产品教程 stub 或产品名 bullets。`
              : '',
          '',
          structureSkeleton,
          '',
          getPrimaryKeywordH1Hint(topic),
          '输出 Markdown：首行 `# SEO 标题`；其后 `##` 为一级节。',
          planLayoutDirectives
            ? '**以下规划 layout 标签为硬性约束**，展开大纲时必须逐条落实（layout 类型不可更改）：'
            : '**生成每个正文 Part 前应用 Section Layout 规则**：multi-method → 每个 `###` 首条 `- mode: …` + stub bullets；narrative → `##` + 3–4 bullets；产品 Part → `### Why` + `### Step-by-Step`。',
          '禁止段落与成稿文案。',
          planLayoutDirectives ? '' : '',
          planLayoutDirectives ? '--- 规划 Part layout（必须严格执行）---' : '',
          planLayoutDirectives,
          planLayoutDirectives ? '---' : '',
          '--- 内部规划（摘要）---',
          compactInternalPlan(plan),
          '',
          '--- 写作简报 ---',
          formatWritingBriefForPrompt(writingBrief)
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.35, maxTokens: maxTokens }
  )

  return enrichOutlineMethodModes(enforceOutlineSkeleton(raw))
}

async function draftBySections(
  llm: LlmConfig,
  topic: string,
  outline: string,
  writingBrief: WritingBrief,
  skillCtx: PipelineSkillContext,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  resume?: DraftSectionResume
): Promise<string> {
  const sections = normalizeOptimizeSectionOrder(parseOutlineSections(outline))
  const { combined, geoBlock, reviewBlock, topListBlock, wordBounds } = getStructurePromptBlocks(
    skillCtx.skillsText,
    userContext.productName,
    skillCtx.enabledSkillIds
  )
  const sectionTitles = sections.map((section) => section.title)
  const articleH1 = resolveArticleH1(outline, topic, resume?.initialDraft)
  const startIndex = resume?.startIndex ?? 0
  let fullDraft =
    startIndex === 0 ? `# ${articleH1}\n\n` : (resume?.initialDraft ?? `# ${articleH1}\n\n`)

  for (let i = startIndex; i < sections.length; i += 1) {
    throwIfAborted()
    const section = sections[i]
    const sectionContext = `${section.title} ${section.body}`
    const productName = userContext.productName ?? ''
    const sectionProductKind = classifyDraftSectionProductKind(
      section.title,
      section.body,
      productName || undefined,
      { geo: Boolean(geoBlock) }
    )
    const isProductPartSection = sectionProductKind === 'product-part'
    const reviewSectionBudget = reviewBlock
      ? getReviewSectionWordBudget(section.title, section.body)
      : 0
    const sectionWordBudget =
      reviewSectionBudget > 0
        ? reviewSectionBudget
        : getSectionWordBudget(section.title, sectionTitles, wordBounds.target)
    const introConclusionHint = getIntroConclusionSectionHint(section.title)
    const faqSectionHint = getFaqSectionHint()
    const isComparisonSection =
      reviewBlock && isReviewAlternativeSection(section.title, section.body)
    const reviewSectionHint = reviewBlock
      ? getReviewSectionDraftHint(section.title, section.body, topic, userContext.productName)
      : ''
    const isGeoMode = Boolean(geoBlock)
    const isGenericGeoSection =
      isGeoMode && sectionProductKind === 'generic-part'
    const isTopListMode = Boolean(topListBlock)
    const isTopListEntriesSection =
      isTopListMode && /top\s*\d+|best\s+\d+|downloaders?|converters?|榜单/i.test(sectionContext)
    const isAlsoWorthSection =
      isTopListMode && /also worth considering|补充推荐|额外推荐/i.test(sectionContext)
    const isHowToSection =
      !reviewBlock &&
      !isTopListMode &&
      Boolean(productName) &&
      (isGeoMode
        ? isProductPartSection
        : /how[\s-]?to|step|guide|tutorial|教程|步骤|使用/i.test(sectionContext))

    const { wordBudget: tokenWordBudget, tier: draftTokenTier } = resolveSectionDraftTokenPlan(
      section.title,
      section.body,
      sectionWordBudget,
      {
        isHowToSection,
        isProductPartSection,
        introConclusionHint
      }
    )

    emit({
      type: 'status',
      step: 'draft',
      message: `正在撰写第 ${i + 1}/${sections.length} 节：${section.title}`
    })

    const stepSkills = getSkillsTextForStep('draft', {
      bundles: skillCtx.bundles,
      structureBlock: combined,
      sectionTitle: section.title,
      sectionProductKind,
      sectionOutlineBody: section.body
    })

    const sectionUserContextBlocks = getUserContextPromptBlocksForSection(
      productName || undefined,
      userContext.mentionLock,
      sectionProductKind
    )

    const sectionText = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是该领域专家作者，写作需体现 Experience 与 Expertise。',
            articleLang.lock,
            getWritingPromptBlocks(sectionUserContextBlocks, topic),
            stepSkills || combined,
            '只输出本节 Markdown 正文，不要重复输出大纲。'
          ]
            .filter(Boolean)
            .join('\n\n')
        },
        {
          role: 'user',
          content: [
            `文章主题：${topic}`,
            `输出语言：${articleLang.label}（与主题一致，不得切换语言）`,
            userContext.briefForPrompt,
            introConclusionHint
              ? introConclusionHint
              : faqSectionHint && isFaqSection(section.title)
                ? faqSectionHint
              : isQuickAnswerSection(section.title)
                ? getDraftQuickAnswerHint(productName || undefined)
              : reviewSectionHint
                ? reviewSectionHint
                : isTopListEntriesSection
                  ? `本节为 Top N 榜单：按大纲为每个产品写独立 ### 编号条目（含简介、**Pros**、**Cons**、**Best for**、关键参数）。用户产品若符合 Topic 须为 ### 1 且篇幅略长。禁止合并成一段话带过。`
                  : isAlsoWorthSection && productName
                    ? `本节为榜单外补充：说明「${productName}」的适用场景、与 Topic 的差异，以及为何未进入主榜；客观不硬塞进 Top 列表。`
                : isGenericGeoSection
                  ? getDraftGenericPartHint(productName || undefined, section.body)
                  : isComparisonSection && productName
                    ? `本节为对比表格：输出 Markdown 表格，对比被测评产品与「${productName}」，至少 5 个维度；表格后 1–2 段说明为何推荐我方产品。`
                    : isHowToSection && productName
                      ? getDraftProductPartHint(productName)
                      : productName && !isGeoMode
                        ? getDraftGenericPartHint(productName, section.body)
                        : '',
            '',
            '大纲上下文（仅相邻节）：',
            buildSectionOutlineContext(sections, i),
            '',
            '写作简报（本节可用要点）：',
            formatWritingBriefForSection(writingBrief),
            '',
            `请撰写本节「${section.title}」`,
            getPrimaryKeywordSectionHint(topic, section.title),
            section.body.trim() ? `本节要点：\n${section.body.trim()}` : '',
            '',
            `本节英文词数目标约 ${sectionWordBudget} 词${reviewSectionHint ? '（被测评产品章节须写足，勿压缩）' : isTopListEntriesSection ? '（Top 榜单须写足每条产品）' : ''}；全文须在 ${wordBounds.min}–${wordBounds.max} 词之间（程序计数）。`,
            reviewSectionHint
              ? '要求：具体、可验证、有场景细节；段落连贯自然，必要时用 bullet 或 ### 组织信息。'
              : `要求：融入具体场景/案例、专业术语，段落连贯可读，避免空泛套话与机械拆段。${VOCABULARY_STYLE_HINT_ZH}`,
            '无单段字数上限；仅全文须在词数区间内。若需增字，补充对读者有用的实质内容，禁止水字数。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { temperature: 0.65, maxTokens: maxTokensForWordBudget(tokenWordBudget, globalMaxTokens, draftTokenTier) }
    )

    const block = `## ${section.title}\n\n${sectionText.trim()}\n\n`
    fullDraft += block
    emit({ type: 'chunk', text: block, step: 'draft' })
    resume?.onSectionComplete?.(i, sections.length, fullDraft.trim())
  }

  return reorderArticleMarkdown(fullDraft.trim())
}

async function polishDraft(
  llm: LlmConfig,
  draft: string,
  topic: string,
  skillCtx: PipelineSkillContext,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  maxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<string> {
  emit({ type: 'status', step: 'polish', message: '⑧ 润色并降低 AI 味…' })
  emit({ type: 'reset' })

  const { combined, geoBlock, reviewBlock, topListBlock, wordBounds } = getStructurePromptBlocks(
    skillCtx.skillsText,
    userContext.productName,
    skillCtx.enabledSkillIds
  )
  const stepSkills = getSkillsTextForStep('polish', { bundles: skillCtx.bundles })
  const polished = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深文字编辑，擅长让文章更自然、更有原创感。',
          articleLang.lock,
          PRESERVE_MARKDOWN_HEADINGS_RULE,
          POLISH_EDIT_SCOPE_RULE,
          MULTI_METHOD_STRUCTURE_PRESERVE_RULE,
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          stepSkills ? `合规与风格要点：\n${stepSkills}` : ''
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `对以下关于「${topic}」的文章进行「降 AI 味」润色：`,
          `- 全文必须保持${articleLang.label}，与主题语言一致`,
          '- **所有 # / ## / ### 标题必须与草稿逐字一致**，不得改写章节名',
          userContext.productName
            ? getPolishProductHint(userContext.productName, {
                review: Boolean(reviewBlock),
                topList: Boolean(topListBlock),
                geo: Boolean(geoBlock)
              })
            : userContext.raw
              ? '- 润色时必须保留用户补充要求中的关键信息（含产品/工具名称）'
              : '',
          userContext.briefForPrompt,
          '- 保留事实与结构，但改写句式与过渡',
          '- 增强自然语气与具体判断',
          '- 删除模板化开头/空洞总结',
          '- 正文中禁止出现 "Target audience"、"for US reader"、"目标读者" 等来自写作 brief 的标签或元信息',
          '- 保持段落连贯自然，勿为凑字数而机械拆段、重复或堆砌空话',
          '- 若草稿混入了其它语言，润色时全部改为主题语言',
          topListBlock
            ? `- 保留 Quick Answer、Introduction、选型标准 Part、Top N 榜单（### 1…N 每条含 Pros/Cons）、可选对比表、FAQ（${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS} 问、整节 ≤${MAX_FAQ_SECTION_WORDS} 词）、Conclusion；移除 <thinking>`
            : geoBlock
            ? `- 保留 Quick Answer、Introduction（≤150 词、≤3 段）、通用 Part（行业价值为主，联动时可轻量提及产品）+ **单一产品 Part**（推广与教程合一，禁止拆成两个 Part）、FAQ（${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS} 问、整节 ≤${MAX_FAQ_SECTION_WORDS} 词）、[Image: …]；Conclusion ≤150 词、≤3 段；移除 <thinking>`
            : reviewBlock
              ? '- 保留对被测评产品的充分描述（Overview、Pros & Cons、Features、How to Use、Value/Experience 各 Part 不可删减合并）；保留对比表格与 FAQ；移除任何 <thinking> 标签'
              : '',
          `- 终稿英文词数须在 ${wordBounds.min}–${wordBounds.max} 之间；不足时补充与主题相关、对读者有帮助的实质内容，禁止水字数`,
          getIntroConclusionPolishHint(),
          getPrimaryKeywordPolishHint(topic),
          '- 直接输出最终 Markdown 正文，不要解释修改过程',
          '- 不要用 ```markdown 代码围栏包裹正文',
          '',
          draft
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.55, maxTokens: maxTokens, step: 'polish', label: '润色',
      onRateLimitRetry: createRateLimitRetryStatus('⑧ 润色并降低 AI 味…', (message) =>
        emit({ type: 'status', step: 'polish', message })
      )
    }
  )

  const normalized = reorderArticleMarkdown(normalizeArticleMarkdown(polished))
  onChunk(normalized)
  return normalized
}

export async function generateArticle(
  options: GenerateArticleOptions,
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
    writingBrief: resolveStepMaxTokens('writingBrief', globalMaxTokens)
  }

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const topic = (options.resume?.options.topic ?? options.topic)?.trim()
  if (!topic) {
    return { ok: false, message: '请输入文章主题。' }
  }

  return runWithTokenContext(createTokenRunContext('create', topic), async () => {
  const resume = options.resume
  const nextStep = resume?.nextStep ?? 'skills'
  const articleLang = buildArticleLanguageContext(
    normalizeOutputLanguage(resume?.options.outputLanguage ?? options.outputLanguage)
  )
  const userContext = parseUserWritingContext(
    resume?.options.extraInstructions ?? options.extraInstructions
  )

  const emit = (event: GenerateProgressEvent): void => {
    if (event.step) {
      updateTokenUsageContext({ step: event.step, stepLabel: event.message })
    }
    sender.send('article:progress', event)
  }

  const emitCreateCheckpoint = (checkpoint: CreatePipelineCheckpoint): void => {
    emit({ type: 'checkpoint', checkpoint })
  }

  const buildCreateCheckpoint = (
    step: PipelineStep,
    partial: Omit<CreatePipelineCheckpoint, 'kind' | 'assistantMessageId' | 'nextStep' | 'options'> &
      Partial<Pick<CreatePipelineCheckpoint, 'options'>>
  ): CreatePipelineCheckpoint => ({
    kind: 'create',
    assistantMessageId: resume?.assistantMessageId ?? '',
    nextStep: step,
    options: {
      topic,
      extraInstructions: resume?.options.extraInstructions ?? options.extraInstructions,
      outputLanguage: resume?.options.outputLanguage ?? options.outputLanguage,
      llmPresetId: resume?.options.llmPresetId ?? options.llmPresetId,
      llmModel: resume?.options.llmModel ?? options.llmModel
    },
    ...partial
  })

  let outline = resume?.outline
  let writingBrief = resume?.writingBrief
  let plan = resume?.plan
  let extracted = resume?.extracted
  let searchIntentSummary = resume?.searchIntentSummary ?? ''

  try {
    emit({
      type: 'status',
      step: 'skills',
      message: resume?.statusLabel
        ? `继续生成：${resume.statusLabel}`
        : `① 加载 Skills…（成文语言：${articleLang.label}${userContext.productName ? ` · 产品：${userContext.productName}` : ''}）`
    })
    const skillBundles = await getEnabledSkillBundles('create')
    const enabledSkillIds = getEnabledSkillIdsFromBundles(skillBundles)
    const skillsText = buildFullSkillsText(skillBundles)
    const skillCtx: PipelineSkillContext = {
      bundles: skillBundles,
      skillsText,
      enabledSkillIds
    }

    if (resume?.plan && !shouldRunPipelineStep(nextStep, 'plan', 'create')) {
      emit({
        type: 'planning',
        step: 'plan',
        message: '创作规划',
        planningSummary: resume.plan
      })
    }

    let searchQueries = [topic]
    let sources: ResearchSource[] = []

    if (shouldRunPipelineStep(nextStep, 'extract', 'create')) {
      if (canRunResearch(research)) {
      emit({ type: 'status', step: 'expand', message: '② 搜索意图分析 & 拆解搜索词…' })
      const intentResult = await analyzeAndExpandSearchQueries(llm, {
        topic,
        research,
        articleLang,
        extraInstructions: options.extraInstructions,
        userContext,
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
        message: `③ 搜索与抓取：${searchQueries.length} 组关键词 → Top ${research.maxSearchResults}`
      })

      sources = await searchWithQueries(searchQueries, research, (progress) => {
        throwIfAborted()
        emit({
          type: 'status',
          step: progress.phase === 'scrape' ? 'scrape' : 'search',
          message: progress.message
        })
      })

      emit({
        type: 'research',
        step: 'scrape',
        message: '搜索与抓取完成',
        researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research, {
          intentSummary: searchIntentSummary
        }),
        sources: mapSources(sources)
      })

      emit({ type: 'status', step: 'extract', message: '④ E-E-A-T 信息萃取…' })
      const corpus = buildScrapedCorpus(sources)
      extracted = await extractEeatInsights(
        llm,
        topic,
        corpus,
        skillCtx,
        articleLang,
        userContext,
        stepTokens.eeatExtract
      )

      emit({
        type: 'research',
        step: 'extract',
        message: 'E-E-A-T 萃取完成',
        researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research, {
          intentSummary: searchIntentSummary,
          extractedPreview: extracted
        }),
        sources: mapSources(sources)
      })
      } else if (research.enabled) {
        emit({ type: 'status', message: '未配置 Tavily / Firecrawl，跳过调研阶段…' })
        extracted =
          articleLang.code === 'en'
            ? '(Research disabled; writing from topic and Skills.)'
            : '（未启用竞品调研，将基于主题与 Skills 创作。）'
      } else {
        extracted =
          articleLang.code === 'en'
            ? '(Research disabled; writing from topic and Skills.)'
            : '（未启用竞品调研，将基于主题与 Skills 创作。）'
      }

      emit({ type: 'status', step: 'extract', message: '④b 生成写作简报…' })
      writingBrief = await generateWritingBrief(
        llm,
        topic,
        extracted!,
        articleLang.label,
        userContext,
        globalMaxTokens,
        searchIntentSummary || undefined
      )
    } else if (!extracted) {
      extracted =
        articleLang.code === 'en'
          ? '(Research disabled; writing from topic and Skills.)'
          : '（未启用竞品调研，将基于主题与 Skills 创作。）'
    }

    if (shouldRunPipelineStep(nextStep, 'plan', 'create')) {
      if (!writingBrief) {
        emit({ type: 'status', step: 'extract', message: '④b 生成写作简报…' })
        writingBrief = await generateWritingBrief(
          llm,
          topic,
          extracted!,
          articleLang.label,
          userContext,
          globalMaxTokens,
          searchIntentSummary || undefined
        )
      }

      emit({
        type: 'status',
        step: 'plan',
        message: '⑤ 分析与规划（搜索意图 / FAQ / 大纲构思）…'
      })
      plan = await generateArticlePlan(
        llm,
        topic,
        writingBrief,
        skillCtx,
        articleLang,
        userContext,
        maxTokensForPlanning(globalMaxTokens)
      )
      emit({
        type: 'planning',
        step: 'plan',
        message: '创作规划完成',
        planningSummary: plan
      })
      emitCreateCheckpoint(
        buildCreateCheckpoint('outline', {
          statusLabel: '⑤ 分析与规划已完成',
          extracted,
          writingBrief,
          plan,
          searchIntentSummary
        })
      )
    }

    if (shouldRunPipelineStep(nextStep, 'outline', 'create')) {
      if (!writingBrief || !plan) {
        return { ok: false, message: '无法继续：缺少写作简报或规划，请重新开始。' }
      }

      emit({
        type: 'status',
        step: 'outline',
        message: `⑥ 生成差异化大纲（${articleLang.label}）…`
      })
      outline = await generateDifferentiatedOutline(
        llm,
        topic,
        writingBrief,
        plan,
        skillCtx,
        userContext,
        articleLang,
        maxTokensForOutlineSkeleton(
          globalMaxTokens,
          estimateOutlineSectionCount(topic, skillsText, enabledSkillIds)
        )
      )

      if (sources.length > 0) {
        emit({
          type: 'research',
          step: 'outline',
          message: '大纲已生成',
          researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research, {
            intentSummary: searchIntentSummary,
            extractedPreview: extracted,
            outlinePreview: outline
          }),
          sources: mapSources(sources)
        })
      }

      const sectionCount = parseOutlineSections(outline).length
      const articleH1 = resolveArticleH1(outline, topic)
      emitCreateCheckpoint(
        buildCreateCheckpoint('draft', {
          statusLabel: `⑥ 大纲已完成 · 共 ${sectionCount} 节`,
          extracted,
          writingBrief,
          plan,
          outline,
          searchIntentSummary,
          partialDraft: `# ${articleH1}\n\n`,
          draftSectionIndex: 0,
          draftSectionCount: sectionCount
        })
      )
    }

    if (!outline || !writingBrief) {
      return { ok: false, message: '无法继续：缺少大纲或写作简报，请重新开始。' }
    }

    let draft = resume?.workText ?? resume?.partialDraft ?? ''
    if (shouldRunPipelineStep(nextStep, 'draft', 'create')) {
      const sectionCount = parseOutlineSections(outline).length
      emit({
        type: 'status',
        step: 'draft',
        message:
          resume?.draftSectionIndex != null && resume.draftSectionIndex > 0
            ? `⑦ 继续分段撰写（${resume.draftSectionIndex + 1}/${sectionCount} 起）…`
            : `⑦ 分段撰写正文（${articleLang.label}）…`
      })
      draft = await draftBySections(
        llm,
        topic,
        outline,
        writingBrief,
        skillCtx,
        userContext,
        articleLang,
        globalMaxTokens,
        emit,
        {
          startIndex: resume?.draftSectionIndex ?? 0,
          initialDraft:
            resume?.partialDraft ??
            `# ${resolveArticleH1(outline, topic)}\n\n`,
          onSectionComplete: (sectionIndex, total, partial) => {
            const nextIndex = sectionIndex + 1
            if (nextIndex < total) {
              emitCreateCheckpoint(
                buildCreateCheckpoint('draft', {
                  statusLabel: `⑦ 已完成第 ${nextIndex}/${total} 节`,
                  extracted,
                  writingBrief,
                  plan,
                  outline,
                  searchIntentSummary,
                  partialDraft: partial,
                  draftSectionIndex: nextIndex,
                  draftSectionCount: total
                })
              )
            } else {
              emitCreateCheckpoint(
                buildCreateCheckpoint('polish', {
                  statusLabel: '⑦ 正文撰写完成',
                  extracted,
                  writingBrief,
                  plan,
                  outline,
                  searchIntentSummary,
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

    let polished = resume?.workText && !shouldRunPipelineStep(nextStep, 'polish', 'create') ? resume.workText : ''
    if (shouldRunPipelineStep(nextStep, 'polish', 'create')) {
      if (!draft) {
        return { ok: false, message: '无法继续：缺少正文草稿，请重新开始。' }
      }
      polished = await polishDraft(
        llm,
        draft,
        topic,
        skillCtx,
        userContext,
        articleLang,
        maxTokensForFullArticleOutput(countArticleWords(draft), globalMaxTokens, 'polish'),
        emit,
        (text) => {
          emit({ type: 'chunk', text, step: 'polish' })
        }
      )
      emitCreateCheckpoint(
        buildCreateCheckpoint('length', {
          statusLabel: '⑧ 润色完成',
          extracted,
          writingBrief,
          plan,
          outline,
          searchIntentSummary,
          workText: polished
        })
      )
    }

    let lengthAdjusted = polished
    if (shouldRunPipelineStep(nextStep, 'length', 'create')) {
      if (!polished) {
        return { ok: false, message: '无法继续：缺少润色稿，请重新开始。' }
      }
      lengthAdjusted = reorderArticleMarkdown(
        await enforceArticleWordCount(
        llm,
        polished,
        topic,
        articleLang,
        maxTokensForFullArticleOutput(countArticleWords(polished), globalMaxTokens, 'lengthAdjust'),
        emit,
        (text) => emit({ type: 'chunk', text, step: 'length' }),
        skillsText,
        enabledSkillIds
        )
      )
      emitCreateCheckpoint(
        buildCreateCheckpoint('meta', {
          statusLabel: '⑨ 词数校准完成',
          extracted,
          writingBrief,
          plan,
          outline,
          searchIntentSummary,
          workText: lengthAdjusted
        })
      )
    }

    if (shouldRunPipelineStep(nextStep, 'meta', 'create')) {
      emit({ type: 'status', step: 'meta', message: '⑩ 生成 SEO Meta Title & Description…' })
      const seoMeta = await generateSeoMeta(
        llm,
        topic,
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
    const message = error instanceof Error ? error.message : '未知错误'
    emit({ type: 'error', message })
    return { ok: false, message }
  }
  })
}

export async function testLlmConnection(options?: {
  presetId?: string
  model?: string
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const selection =
    options?.presetId && options.model
      ? { presetId: options.presetId, model: options.model }
      : null
  const appConfig = await getEffectiveConfig(selection)
  const llm = appConfig.llm

  if (!llm.apiKey) {
    return { ok: false, message: '请先填写 API Key' }
  }

  try {
    const response = await fetch(`${llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    })

    if (!response.ok) {
      const detail = await response.text()
      return { ok: false, message: `连接失败 (${response.status})：${detail.slice(0, 160)}` }
    }

    return { ok: true, message: '连接成功，LLM 配置可用' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '连接测试失败'
    }
  }
}
