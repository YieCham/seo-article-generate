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
import { getEnabledSkillsTextForOptimize } from './skillManager'
import {
  chatCompletion,
  parseOutlineSections,
  streamChatCompletion,
  type LlmConfig
} from './llmClient'
import {
  getArticleLanguageLock,
  type TopicLanguageCode
} from './topicLanguage'
import { normalizeOutputLanguage, type OutputLanguageCode } from './outputLanguage'
import {
  buildAnchoredOutline,
  buildSourcePreviewStats,
  countWords,
  extractSourceH1,
  findMatchingSourceSection,
  getOptimizePolishHint,
  getOptimizePromptBlocks,
  getOptimizeSinglePassHint,
  getOptimizeWordRange,
  getSourceSectionEditHint,
  isAuditRecommendedNewSection,
  isNewOptimizeSection,
  parseSourceSections,
  validateSourceMarkdown,
  type OutlineSection
} from './optimizeStructure'
import {
  getArticleLengthPromptBlock,
  getSectionWordBudget,
  countArticleWords
} from './articleLength'
import { enforceOptimizeArticleWordCount } from './articleWordEnforcement'
import { formatSeoMetaBlock, generateSeoMeta } from './seoMeta'
import { getUserContextPromptBlocks, parseUserWritingContext } from './userContext'

export interface OptimizeArticleOptions {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
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

function getEditorPromptBlocks(): string {
  return [getOptimizePromptBlocks(), getArticleLengthPromptBlock()].join('\n\n')
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
          '你是 SEO/GEO 竞品分析专家。对比「待优化原页面」与「竞品高排名页面」，输出**可执行的增量更新清单**（写什么、删什么）。',
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
          '### 建议增量吸纳（ADD）',
          '- 竞品有、原文缺的高价值内容：具体观点/步骤/技巧/FAQ（每条注明**建议插入的原文章节**）',
          '- 至少 3–8 条可执行要点，可直接写入对应 H2',
          '### 原文仍优于竞品（KEEP）',
          '- 应保留甚至强化的原文论点',
          '### 原文可能过时（REVIEW for REMOVE/REPLACE）',
          '- 原文中疑似过时、失效、与竞品/现状不符的步骤或方法（注明章节，建议删除或替换方向）',
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
  maxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容诊断专家。分析现有页面并制定**保守结构 + 主动增量更新**方案，不要撰写终稿。',
          '须明确：保留什么、吸纳什么竞品内容、删除/替换什么过时内容；禁止默认整节重写。',
          getUserContextPromptBlocks(userContext),
          skillsText ? `优化规范（Skills）：\n${skillsText}` : '',
          getEditorPromptBlocks()
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
          '2. 竞品对比：**原文遗漏**但对用户有价值、**应增量写入**的具体要点（按章节列出）',
          '3. **过时/失效内容清单**：应删除或替换的步骤、工具、版本、方法（按章节列出，说明原因）',
          '4. 结构与 SEO/GEO 问题（标题层级、关键词、缺失模块如 Quick Answer/FAQ 等）',
          '5. **建议保留的原文**（仍准确有用的段落/句子，列出章节）',
          '6. **建议局部改写**的句子（薄弱/难读/SEO 不足，具体到句）',
          '7. **优化动作清单**（ADD / REMOVE / REPLACE / KEEP / **NEW H2**，按优先级）',
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
          '你是内容优化编辑。在大纲各 ## 章节下补充编辑要点 bullet：**ADD / REMOVE / KEEP / 局部改写**；若诊断报告含 `[新增 H2]` / `[NEW H2]` 而大纲中缺失，**可插入该 ## 标题**到诊断指定位置（before/after 某原文章节）。'
      },
      {
        role: 'user',
        content: [
          '在以下大纲各 ## 章节下补充 1–3 条具体编辑说明（来自诊断报告）。',
          '可依据诊断 **新增** 标记为 `[新增 H2]` / `[NEW H2]` 的 ## 标题并插入正确位置；不得删除已有原文章节 ## 标题，不得无诊断依据地增删章节。',
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
  wordRangeLabel: string,
  globalMaxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深 SEO/GEO 编辑。在**原文上就地优化**：保留结构，**主动吸纳竞品要点、删改过时内容**。',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          skillsText ? `Skills：\n${skillsText}` : '',
          getEditorPromptBlocks()
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
          getOptimizeSinglePassHint(wordRangeLabel),
          '',
          '请输出**完整优化后 Markdown 文章**：',
          '- 保留原文 H2/H3 顺序；保留仍然准确有用的原句',
          '- **执行诊断 ADD**：写入竞品/缺口要点到对应章节',
          '- **执行诊断 NEW H2**：新增诊断标记的 H2 章节并写入对应内容',
          '- **执行诊断 REMOVE/REPLACE**：删除或替换过时失效方法与步骤',
          '- 直接输出正文，不要写修改说明',
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
  wordRangeLabel: string,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void
): Promise<string> {
  const sections = parseOutlineSections(outline)
  const editorBlocks = getEditorPromptBlocks()
  const sectionTitles = sections.map((section) => section.title)
  const articleTitle = extractSourceH1(sourceMarkdown, title)
  let fullDraft = `# ${articleTitle}\n\n`

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    const sectionWordBudget = getSectionWordBudget(section.title, sectionTitles)
    const originalSection = findMatchingSourceSection(section.title, sourceSections)
    const isAuditNewH2 = isAuditRecommendedNewSection(section.title, audit)
    const isNewSection =
      (isNewOptimizeSection(section.title, audit) && !originalSection) || isAuditNewH2

    emit({
      type: 'status',
      step: 'draft',
      message: `正在优化第 ${i + 1}/${sections.length} 节：${section.title}`
    })

    const sectionText = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是 SEO/GEO 内容编辑。对本节做**保守结构 + 主动增量更新**：保留有效原句，吸纳竞品要点，删改过时内容。',
            articleLang.lock,
            getUserContextPromptBlocks(userContext),
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
            '',
            originalSection ? `--- 原文本节 ---\n${originalSection.body.trim()}\n---` : '',
            '',
            '编辑说明（来自大纲/诊断，仅作局部修改参考）：',
            section.body.trim() ? section.body.trim() : '',
            '',
            '诊断摘要：',
            audit.slice(0, 2500),
            '',
            '可补充的竞品缺口（须写入本节相关处）：',
            competitorInsights.slice(0, 2000),
            '',
            `输出优化后的「${section.title}」正文。`,
            `词数参考：${wordRangeLabel}；本节约 ${sectionWordBudget} 词。`
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
  }

  return fullDraft.trim()
}

async function polishOptimizedArticle(
  llm: LlmConfig,
  draft: string,
  sourceMarkdown: string,
  title: string,
  competitorInsights: string,
  audit: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: ReturnType<typeof parseUserWritingContext>,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<string> {
  emit({ type: 'status', step: 'polish', message: '⑨ 终稿校对（检查增量更新与过时删减）…' })
  emit({ type: 'reset' })

  let polished = ''
  const polishMaxTokens = maxTokensForOptimizePolish(countWords(draft), globalMaxTokens)

  await streamChatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是校对编辑。终稿校对并**确认增量更新已落实**（竞品吸纳、过时删减），不是整篇重写。',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          skillsText ? `Skills：\n${skillsText}` : '',
          getEditorPromptBlocks()
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `对以下优化稿做终稿校对：`,
          `- 保持${articleLang.label}`,
          getOptimizePolishHint(),
          '- 禁止 Target audience 等 brief 标签',
          '- 直接输出 Markdown 正文',
          '',
          '--- 原页面（结构与核心信息勿偏离）---',
          sourceMarkdown.slice(0, 6000),
          '',
          '--- 诊断摘要（ADD/REMOVE 须已落实）---',
          audit.slice(0, 3500),
          '',
          '--- 竞品增量要点 ---',
          competitorInsights.slice(0, 2500),
          '',
          '--- 优化稿 ---',
          draft
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    (text) => {
      polished += text
      onChunk(text)
    },
    { temperature: 0.2, maxTokens: polishMaxTokens }
  )

  return polished.trim()
}

export async function optimizeArticle(
  options: OptimizeArticleOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const appConfig = await getEffectiveConfig()
  const llm = appConfig.llm
  const research = appConfig.research
  const globalMaxTokens = appConfig.llmMaxTokens
  const stepTokens = {
    intentExpand: resolveStepMaxTokens('intentExpand', globalMaxTokens),
    eeatExtract: resolveStepMaxTokens('eeatExtract', globalMaxTokens),
    optimizeAudit: resolveStepMaxTokens('optimizeAudit', globalMaxTokens),
    outline: resolveStepMaxTokens('outline', globalMaxTokens),
    seoMeta: resolveStepMaxTokens('seoMeta', globalMaxTokens)
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
    sourceUrl = normalizeSourceUrl(options.sourceUrl)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'URL 无效' }
  }

  const userContext = parseUserWritingContext(options.extraInstructions)

  return runWithTokenContext(createTokenRunContext('optimize', sourceUrl), async () => {
  const emit = (event: GenerateProgressEvent): void => {
    if (event.step) {
      updateTokenUsageContext({ step: event.step, stepLabel: event.message })
    }
    sender.send('article:progress', event)
  }

  try {
    emit({ type: 'status', step: 'skills', message: '① 加载优化 Skills…' })
    const skillsText = await getEnabledSkillsTextForOptimize()

    emit({ type: 'status', step: 'scrape', message: '② 抓取页面正文…' })
    const scraped = await scrapeToMarkdown(sourceUrl, firecrawlKey, OPTIMIZE_MAX_MARKDOWN_CHARS)
    validateSourceMarkdown(scraped.markdown)

    const sourceSections = parseSourceSections(scraped.markdown)

    emit({
      type: 'research',
      step: 'scrape',
      message: '页面抓取完成',
      researchSummary: buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown)
    })

    const articleLang = buildArticleLanguageContext(normalizeOutputLanguage(options.outputLanguage))
    const researchTopic = buildResearchTopicFromSource(
      scraped.title,
      scraped.markdown,
      sourceUrl
    )

    let searchQueries: string[] = [researchTopic]
    let searchIntentSummary = ''
    let competitorSources: ResearchSource[] = []
    let competitorInsights =
      articleLang.code === 'en'
        ? '(Competitor research disabled; gap analysis uses source page and Skills only.)'
        : '（未启用竞品调研，将仅基于原页面与 Skills 做缺口分析。）'

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
          skillsText,
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
    const audit = await auditSourcePage(
      llm,
      scraped.url,
      scraped.title,
      scraped.markdown,
      competitorInsights,
      skillsText,
      articleLang,
      userContext,
      stepTokens.optimizeAudit
    )

    emit({
      type: 'planning',
      step: 'plan',
      message: '诊断完成',
      planningSummary: audit
    })

    const hasCompetitorInsights =
      !competitorInsights.includes('未抓取到竞品') &&
      !competitorInsights.includes('No competitor pages scraped') &&
      competitorInsights.trim().length > 120
    const sourceWordCount = countWords(scraped.markdown)
    const wordRange = getOptimizeWordRange(sourceWordCount, hasCompetitorInsights)

    emit({ type: 'status', step: 'outline', message: '⑦ 基于原文章节生成优化大纲…' })
    const outline = await generateOptimizedOutline(
      llm,
      scraped.markdown,
      audit,
      skillsText,
      articleLang,
      stepTokens.outline
    )

    const useSinglePass = sourceSections.length <= 1

    emit({
      type: 'status',
      step: 'draft',
      message: useSinglePass
        ? `⑧ 就地优化全文（${articleLang.label} · 增量更新）…`
        : `⑧ 按章节优化（${articleLang.label} · 增量吸纳 + 过时删减）…`
    })

    let draft: string
    if (useSinglePass) {
      const optimized = await optimizeArticleSinglePass(
        llm,
        scraped.markdown,
        scraped.title,
        audit,
        competitorInsights,
        skillsText,
        articleLang,
        userContext,
        wordRange.label,
        globalMaxTokens
      )
      draft = optimized.startsWith('#') ? optimized : `# ${extractSourceH1(scraped.markdown, scraped.title)}\n\n${optimized}`
      emit({ type: 'chunk', text: draft, step: 'draft' })
    } else {
      draft = await draftOptimizedSections(
        llm,
        scraped.title,
        outline,
        scraped.markdown,
        sourceSections,
        audit,
        competitorInsights,
        skillsText,
        articleLang,
        userContext,
        wordRange.label,
        globalMaxTokens,
        emit
      )
    }

    const polished = await polishOptimizedArticle(
      llm,
      draft,
      scraped.markdown,
      scraped.title,
      competitorInsights,
      audit,
      skillsText,
      articleLang,
      userContext,
      globalMaxTokens,
      emit,
      (text) => emit({ type: 'chunk', text, step: 'polish' })
    )

    const lengthAdjusted = await enforceOptimizeArticleWordCount(
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

    emit({ type: 'status', step: 'meta', message: '⑪ 生成 SEO Meta Title & Description…' })
    const seoMeta = await generateSeoMeta(
      llm,
      scraped.title,
      lengthAdjusted,
      articleLang,
      userContext,
      stepTokens.seoMeta
    )
    emit({ type: 'prepend', text: formatSeoMetaBlock(seoMeta), step: 'meta' })

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
