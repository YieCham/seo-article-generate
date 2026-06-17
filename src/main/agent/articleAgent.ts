import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext
} from '../token/tokenUsageContext'
import { resolveStepMaxTokens } from '../config/llmTokenLimits'
import type { ResearchConfig } from '../config/types'
import { getEnabledSkillsText } from './skillManager'
import {
  chatCompletion,
  parseOutlineSections,
  streamChatCompletion,
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
import { getReviewPromptBlock, getReviewSectionDraftHint, getReviewSectionWordBudget, isReviewAlternativeSection, REVIEW_OUTLINE_GUIDANCE, REVIEW_PLAN_GUIDANCE } from './reviewStructure'
import {
  getArticleLengthPromptBlock,
  getSectionWordBudget,
  maxTokensForWordBudget,
  resolveSectionDraftTokenPlan,
  MIN_ARTICLE_WORDS,
  MAX_ARTICLE_WORDS,
  getIntroConclusionSectionHint,
  getIntroConclusionPolishHint
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
  getPrimaryKeywordPolishHint,
  getPrimaryKeywordSectionHint,
  getWritingPromptBlocks
} from './topicKeyword'

export interface GenerateArticleOptions {
  topic: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
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
  type: 'chunk' | 'status' | 'error' | 'done' | 'research' | 'reset' | 'planning' | 'prepend'
  text?: string
  message?: string
  step?: PipelineStep
  researchSummary?: string
  planningSummary?: string
  sources?: ResearchSourcePreview[]
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

function getStructurePromptBlocks(skillsText: string): {
  combined: string
  geoBlock: string
  reviewBlock: string
  lengthBlock: string
} {
  const geoBlock = getGeoSeoPromptBlock(skillsText)
  const reviewBlock = getReviewPromptBlock(skillsText)
  const lengthBlock = getArticleLengthPromptBlock()
  return {
    geoBlock,
    reviewBlock,
    lengthBlock,
    combined: [lengthBlock, geoBlock, reviewBlock].filter(Boolean).join('\n\n')
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
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext,
  maxTokens: number
): Promise<string> {
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
          skillsText ? `写作规范参考：\n${skillsText}` : ''
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
          userContext.productName
            ? `- 注意：终稿需突出产品「${userContext.productName}」，萃取时可记录如何自然植入 How-to 的切入点`
            : '',
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
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext,
  maxTokens: number
): Promise<string> {
  const { combined, geoBlock, reviewBlock } = getStructurePromptBlocks(skillsText)
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容策略师。完成内部分析与规划，不要撰写正文。',
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          skillsText ? `Skills：\n${skillsText}` : '',
          combined
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
              ? `规划须为被测评产品（主题）分配主要篇幅：Overview、Pros & Cons、Features、How to Use、Value/Experience 五个模块各成 Part；最后再规划与「${userContext.productName}」的对比表及 FAQ。`
              : `规划须包含「${userContext.productName}」的分步 How-to 章节位置与 FAQ 是否涉及该产品。`
            : reviewBlock
              ? '规划须为被测评产品分配主要篇幅：五个独立 Part + 对比表 + FAQ。'
              : '',
          reviewBlock ? REVIEW_PLAN_GUIDANCE : '',
          '',
          '在 <thinking> 与 </thinking> 标签内输出内部规划，包含：',
          '1. 搜索意图分析与读者痛点',
          '2. 竞品/行业高价值知识点如何整合',
          '3. 至少 5 个 FAQ 设想（合法性、安全、音质、场景、兼容性）',
          '4. 完整大纲结构（含 Quick Answer、FAQ、结论）',
          '',
          'E-E-A-T 写作简报：',
          formatWritingBriefForPrompt(writingBrief),
          '',
          geoBlock
            ? '若 Skill 要求 GEO 结构：大纲先规划 **2–3 个通用 Part**（吸收调研/竞品要点，无产品名），再定 **产品 Part 位置**（Part 2–4 均可；该 Part 内 ### 推荐+教程合一）、FAQ（≥5 问）、图片占位。'
            : reviewBlock
              ? '大纲须明确：被测评产品五个独立 Part（Overview、Pros & Cons、Features、How to Use、Value/Experience）、Markdown 对比表格、FAQ、Conclusion；禁止合并成 1–2 个敷衍 Part。'
              : '按 Skills 规范构建差异化结构。',
          reviewBlock
            ? `全文英文词数须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 词之间（程序计数校验）；被测评产品各 Part 须充实，对比/Alternative 仅保留一个紧凑 Part。`
            : `全文英文词数须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 词之间（程序计数校验）；大纲 Part 不宜过多（建议 2–4 个 Part）。`,
          `终稿语言：${articleLang.label}`
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.45, maxTokens: maxTokens }
  )

  if (raw.includes('<thinking>')) return raw.trim()
  return `<thinking>\n${raw.trim()}\n</thinking>`
}

async function generateDifferentiatedOutline(
  llm: LlmConfig,
  topic: string,
  writingBrief: WritingBrief,
  plan: string,
  skillsText: string,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  maxTokens: number
): Promise<string> {
  const { combined, geoBlock, reviewBlock } = getStructurePromptBlocks(skillsText)
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是内容策略主编，擅长在竞品红海中找差异化切入点。',
          articleLang.lock,
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          skillsText ? `Skills 规范：\n${skillsText}` : '',
          combined
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
              ? `大纲必须将被测评产品拆成至少 5 个独立 Part（Overview、Pros & Cons、Features、How to Use、Value/Experience），每节写清要点；「${userContext.productName}」仅出现在最后的对比表 Part，之前不要大段 Alternative。`
              : `大纲必须包含独立章节：分步演示如何使用「${userContext.productName}」（至少 4 步）。`
            : reviewBlock
              ? '大纲必须将被测评产品拆成至少 5 个独立 Part，再写对比表格；禁止 Overview + Pros 后直接 Alternative。'
              : '',
          '',
          '基于以下内部规划与 E-E-A-T 萃取要点，生成正式文章大纲（Markdown，## 为一级节）。',
          '大纲必须全部使用与主题一致的语言。',
          geoBlock
            ? '必须包含：Quick Answer、Introduction（≤150 词、≤3 段）、若干 **通用 Part**（调研驱动、无产品名）→ **一个产品 Part**（推广+Step-by-Step 同一 Part、### 分节、位置由大纲决定）、FAQ（≥5 问）、Conclusion（≤150 词、≤3 段）、[Image: …]。'
            : reviewBlock
              ? '必须包含：Quick Answer、Introduction、被测评产品 5 个独立 Part、对比表 Part、FAQ、Conclusion。'
              : '',
          reviewBlock ? REVIEW_OUTLINE_GUIDANCE : '',
          reviewBlock ? '对比表格须为独立 Part，且位于被测评产品五个 Part 之后、FAQ 之前。' : '',
          reviewBlock
            ? `全文英文词数须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 词之间（程序计数校验）；被测评产品各 Part 分配充实篇幅，勿压缩成简介 + 优缺点就结束。`
            : `全文英文词数须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 词之间（程序计数校验）；控制 Part 数量（2–4 个），每节要点精简。`,
          '要求：',
          '- 必须包含作者的独立观点与论证路径',
          '- 避免复刻竞品结构',
          '- 每节注明要覆盖的核心论点',
          '',
          '--- 内部规划 ---',
          plan,
          '--- 写作简报 ---',
          formatWritingBriefForPrompt(writingBrief)
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.5, maxTokens: maxTokens }
  )
}

async function draftBySections(
  llm: LlmConfig,
  topic: string,
  outline: string,
  writingBrief: WritingBrief,
  skillsText: string,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  globalMaxTokens: number,
  emit: (event: GenerateProgressEvent) => void
): Promise<string> {
  const sections = parseOutlineSections(outline)
  const { combined, geoBlock, reviewBlock } = getStructurePromptBlocks(skillsText)
  const sectionTitles = sections.map((section) => section.title)
  let fullDraft = `# ${topic}\n\n`

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    const sectionContext = `${section.title} ${section.body}`
    const reviewSectionBudget = reviewBlock
      ? getReviewSectionWordBudget(section.title, section.body)
      : 0
    const sectionWordBudget =
      reviewSectionBudget > 0
        ? reviewSectionBudget
        : getSectionWordBudget(section.title, sectionTitles)
    const introConclusionHint = getIntroConclusionSectionHint(section.title)
    const isComparisonSection =
      reviewBlock && isReviewAlternativeSection(section.title, section.body)
    const reviewSectionHint = reviewBlock
      ? getReviewSectionDraftHint(section.title, section.body, topic, userContext.productName)
      : ''
    const isGeoMode = Boolean(geoBlock)
    const productName = userContext.productName ?? ''
    const isProductPartSection =
      isGeoMode &&
      Boolean(productName) &&
      (sectionContext.includes(productName) ||
        /step-by-step|step by step|tutorial|操作步骤|分步|实战|workflow using/i.test(sectionContext))
    const isGenericGeoSection =
      isGeoMode &&
      Boolean(productName) &&
      !introConclusionHint &&
      !isProductPartSection &&
      !/^quick answer|faq|key takeaways/i.test(section.title.trim())
    const isHowToSection =
      !reviewBlock &&
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

    const sectionText = await chatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            '你是该领域专家作者，写作需体现 Experience 与 Expertise。',
            articleLang.lock,
            getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
            skillsText ? `Skills：\n${skillsText}` : '',
            combined,
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
              : reviewSectionHint
                ? reviewSectionHint
                : isGenericGeoSection
                  ? `本节为通用/调研驱动内容：展开大纲要点，优先使用 E-E-A-T 参考中的行业与竞品洞察（深度改写）。**禁止出现产品名「${productName}」及推销语气。**`
                  : isComparisonSection && productName
                    ? `本节为对比表格：输出 Markdown 表格，对比被测评产品与「${productName}」，至少 5 个维度；表格后 1–2 段说明为何推荐我方产品。`
                    : isHowToSection && productName
                      ? `本节为产品 Part：先 1–2 段过渡承接前文，再 ### 推荐 + ### Step-by-Step Tutorial（≥4 步），逐步演示「${productName}」，多次使用产品全名，插入 [Image: …]。`
                      : productName && !isGeoMode
                        ? `若本节涉及解决方案，须自然提及「${productName}」，勿用泛称替代。`
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
            `本节英文词数目标约 ${sectionWordBudget} 词${reviewSectionHint ? '（被测评产品章节须写足，勿压缩）' : ''}；全文须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 词之间（程序计数）。`,
            reviewSectionHint
              ? '要求：具体、可验证、有场景细节；段落连贯自然，必要时用 bullet 或 ### 组织信息。'
              : '要求：融入具体场景/案例、专业术语，段落连贯可读，避免空泛套话与机械拆段。',
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
  }

  return fullDraft.trim()
}

async function polishDraft(
  llm: LlmConfig,
  draft: string,
  topic: string,
  skillsText: string,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  maxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<string> {
  emit({ type: 'status', step: 'polish', message: '⑧ 润色并降低 AI 味…' })
  emit({ type: 'reset' })

  const { combined, geoBlock, reviewBlock } = getStructurePromptBlocks(skillsText)
  let polished = ''

  await streamChatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深文字编辑，擅长让文章更自然、更有原创感。',
          articleLang.lock,
          getWritingPromptBlocks(getUserContextPromptBlocks(userContext), topic),
          skillsText ? `Skills：\n${skillsText}` : '',
          combined
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `对以下关于「${topic}」的文章进行「降 AI 味」润色重写：`,
          `- 全文必须保持${articleLang.label}，与主题语言一致`,
          userContext.productName
            ? reviewBlock
              ? `- 必须保留并强化产品「${userContext.productName}」的提及、对比表格及推荐结论，润色时不得删除对比表或改成泛称`
              : `- 必须保留并强化产品「${userContext.productName}」的提及与 How-to，润色时不得删除或改成泛称`
            : userContext.raw
              ? '- 润色时必须保留用户补充要求中的关键信息（含产品/工具名称）'
              : '',
          userContext.briefForPrompt,
          '- 保留事实与结构，但改写句式与过渡',
          '- 增强作者独特语气与判断',
          '- 删除模板化开头/空洞总结',
          '- 正文中禁止出现 "Target audience"、"for US reader"、"目标读者" 等来自写作 brief 的标签或元信息',
          '- 保持段落连贯自然，勿为凑字数而机械拆段、重复或堆砌空话',
          '- 若草稿混入了其它语言，润色时全部改为主题语言',
          geoBlock
            ? '- 保留 Quick Answer、Introduction（≤150 词、≤3 段）、通用 Part（无产品硬广）+ **单一产品 Part**（推广与教程合一，禁止拆成两个 Part）、FAQ（≥5 问）、[Image: …]；Conclusion ≤150 词、≤3 段；移除 <thinking>'
            : reviewBlock
              ? '- 保留对被测评产品的充分描述（Overview、Pros & Cons、Features、How to Use、Value/Experience 各 Part 不可删减合并）；保留对比表格与 FAQ；移除任何 <thinking> 标签'
              : '',
          `- 终稿英文词数须在 ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} 之间；不足时补充与主题相关、对读者有帮助的实质内容，禁止水字数`,
          getIntroConclusionPolishHint(),
          getPrimaryKeywordPolishHint(topic),
          '- 直接输出最终 Markdown 正文，不要解释修改过程',
          '',
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
    { temperature: 0.55, maxTokens: maxTokens }
  )

  return polished.trim()
}

export async function generateArticle(
  options: GenerateArticleOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const appConfig = await getEffectiveConfig()
  const llm = appConfig.llm
  const research = appConfig.research
  const globalMaxTokens = appConfig.llmMaxTokens
  const stepTokens = {
    intentExpand: resolveStepMaxTokens('intentExpand', globalMaxTokens),
    eeatExtract: resolveStepMaxTokens('eeatExtract', globalMaxTokens),
    writingBrief: resolveStepMaxTokens('writingBrief', globalMaxTokens),
    plan: resolveStepMaxTokens('plan', globalMaxTokens),
    outline: resolveStepMaxTokens('outline', globalMaxTokens),
    polish: resolveStepMaxTokens('polish', globalMaxTokens),
    lengthAdjust: resolveStepMaxTokens('lengthAdjust', globalMaxTokens),
    seoMeta: resolveStepMaxTokens('seoMeta', globalMaxTokens)
  }

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const topic = options.topic?.trim()
  if (!topic) {
    return { ok: false, message: '请输入文章主题。' }
  }

  return runWithTokenContext(createTokenRunContext('create', topic), async () => {
  const articleLang = buildArticleLanguageContext(normalizeOutputLanguage(options.outputLanguage))
  const userContext = parseUserWritingContext(options.extraInstructions)

  const emit = (event: GenerateProgressEvent): void => {
    if (event.step) {
      updateTokenUsageContext({ step: event.step, stepLabel: event.message })
    }
    sender.send('article:progress', event)
  }

  try {
    emit({
      type: 'status',
      step: 'skills',
      message: `① 加载 Skills…（成文语言：${articleLang.label}${userContext.productName ? ` · 产品：${userContext.productName}` : ''}）`
    })
    const skillsText = await getEnabledSkillsText('create')

    let searchQueries = [topic]
    let searchIntentSummary = ''
    let sources: ResearchSource[] = []
    let extracted =
      articleLang.code === 'en'
        ? '(Research disabled; writing from topic and Skills.)'
        : '（未启用竞品调研，将基于主题与 Skills 创作。）'

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
        skillsText,
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
    }

    emit({ type: 'status', step: 'extract', message: '④b 生成写作简报…' })
    const writingBrief = await generateWritingBrief(
      llm,
      topic,
      extracted,
      articleLang.label,
      userContext,
      globalMaxTokens,
      searchIntentSummary || undefined
    )

    emit({
      type: 'status',
      step: 'plan',
      message: '⑤ 分析与规划（搜索意图 / FAQ / 大纲构思）…'
    })
    const plan = await generateArticlePlan(
      llm,
      topic,
      writingBrief,
      skillsText,
      articleLang,
      userContext,
      stepTokens.plan
    )
    emit({
      type: 'planning',
      step: 'plan',
      message: '创作规划完成',
      planningSummary: plan
    })

    emit({
      type: 'status',
      step: 'outline',
      message: `⑥ 生成差异化大纲（${articleLang.label}）…`
    })
    const outline = await generateDifferentiatedOutline(
      llm,
      topic,
      writingBrief,
      plan,
      skillsText,
      userContext,
      articleLang,
      stepTokens.outline
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

    emit({
      type: 'status',
      step: 'draft',
      message: `⑦ 分段撰写正文（${articleLang.label}）…`
    })
    const draft = await draftBySections(
      llm,
      topic,
      outline,
      writingBrief,
      skillsText,
      userContext,
      articleLang,
      globalMaxTokens,
      emit
    )

    const polished = await polishDraft(
      llm,
      draft,
      topic,
      skillsText,
      userContext,
      articleLang,
      stepTokens.polish,
      emit,
      (text) => {
        emit({ type: 'chunk', text, step: 'polish' })
      }
    )

    const lengthAdjusted = await enforceArticleWordCount(
      llm,
      polished,
      topic,
      articleLang,
      stepTokens.lengthAdjust,
      emit,
      (text) => emit({ type: 'chunk', text, step: 'length' })
    )

    emit({ type: 'status', step: 'meta', message: '⑩ 生成 SEO Meta Title & Description…' })
    const seoMeta = await generateSeoMeta(
      llm,
      topic,
      lengthAdjusted,
      articleLang,
      userContext,
      stepTokens.seoMeta
    )
    emit({ type: 'prepend', text: formatSeoMetaBlock(seoMeta), step: 'meta' })

    emit({ type: 'done' })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    emit({ type: 'error', message })
    return { ok: false, message }
  }
  })
}

export async function testLlmConnection(): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const appConfig = await getEffectiveConfig()
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
