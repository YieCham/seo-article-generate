import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import type { ResearchConfig } from '../config/types'
import { getEnabledSkillsText } from './skillManager'
import {
  chatCompletion,
  parseJsonArray,
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
import { getLanguageLabel, getRegionLabel, LANGUAGE_PROMPT_HINT } from '../research/localeOptions'
import {
  detectTopicLanguage,
  fallbackSearchQueries,
  getArticleLanguageLock,
  getSearchQueryLanguageHint,
  type TopicLanguageCode
} from './topicLanguage'
import { getGeoSeoPromptBlock } from './geoSeoStructure'
import { parseUserWritingContext, type UserWritingContext } from './userContext'

export interface GenerateArticleOptions {
  topic: string
  extraInstructions?: string
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

export interface GenerateProgressEvent {
  type: 'chunk' | 'status' | 'error' | 'done' | 'research' | 'reset' | 'planning'
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

function mapSources(sources: ResearchSource[]): ResearchSourcePreview[] {
  return sources.map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    position: item.position,
    scraped: Boolean(item.markdown),
    error: item.scrapeError
  }))
}

function buildArticleLanguageContext(topic: string): ArticleLanguageContext {
  const code = detectTopicLanguage(topic)
  return {
    code,
    lock: getArticleLanguageLock(code),
    label: getLanguageLabel(code)
  }
}

async function expandSearchQueries(
  llm: LlmConfig,
  topic: string,
  research: ResearchConfig,
  articleLang: ArticleLanguageContext
): Promise<string[]> {
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content:
          '你是搜索意图扩展专家。将用户「主题」拆解为 3-5 个不同角度的搜索查询，用于竞品调研。只输出 JSON 字符串数组，不要其他文字。严禁使用产品名、品牌名或用户补充要求中的信息。'
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          `主题语言：${articleLang.label}`,
          getSearchQueryLanguageHint(articleLang.code),
          `目标市场：${getRegionLabel(research.searchRegion)}`,
          LANGUAGE_PROMPT_HINT[articleLang.code] ?? LANGUAGE_PROMPT_HINT.en,
          '重要：搜索词只能围绕上述「主题」展开，不要搜索具体产品、品牌或工具名称。',
          '',
          articleLang.code === 'en'
            ? '示例：主题 "how to lose weight" → ["science of weight loss metabolism", "2026 weight loss expert advice", "weight loss myths debunked"]'
            : '示例：主题「如何减肥」→ ["科学减肥原理 代谢", "2026 减肥 专家建议", "减肥 常见误区 研究"]',
          '请输出 3-5 个搜索词 JSON 数组。'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.4, maxTokens: 400 }
  )

  const queries = parseJsonArray(raw)
  if (queries.length >= 3) return queries.slice(0, 5)
  return fallbackSearchQueries(topic, articleLang.code)
}

async function extractEeatInsights(
  llm: LlmConfig,
  topic: string,
  corpus: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext
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
          userContext.mentionLock,
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
    { temperature: 0.3, maxTokens: 2500 }
  )
}

async function generateArticlePlan(
  llm: LlmConfig,
  topic: string,
  extracted: string,
  skillsText: string,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext
): Promise<string> {
  const geoBlock = getGeoSeoPromptBlock(skillsText)
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是 SEO/GEO 内容策略师。完成内部分析与规划，不要撰写正文。',
          userContext.mentionLock,
          skillsText ? `Skills：\n${skillsText}` : '',
          geoBlock
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          userContext.briefForPrompt,
          userContext.productName
            ? `规划须包含「${userContext.productName}」的分步 How-to 章节位置与 FAQ 是否涉及该产品。`
            : '',
          '',
          '在 <thinking> 与 </thinking> 标签内输出内部规划，包含：',
          '1. 搜索意图分析与读者痛点',
          '2. 竞品/行业高价值知识点如何整合',
          '3. 3–4 个 FAQ 设想',
          '4. 完整大纲结构（含 Quick Answer、FAQ、结论）',
          '',
          'E-E-A-T 萃取参考：',
          extracted.slice(0, 5000),
          '',
          geoBlock
            ? '若 Skill 要求 GEO 结构，大纲须明确 Quick Answer、Part 1./Part 2. 分块、FAQ（3 问）、图片占位位置。'
            : '按 Skills 规范构建差异化结构。',
          `终稿语言：${articleLang.label}`
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.45, maxTokens: 2000 }
  )

  if (raw.includes('<thinking>')) return raw.trim()
  return `<thinking>\n${raw.trim()}\n</thinking>`
}

async function generateDifferentiatedOutline(
  llm: LlmConfig,
  topic: string,
  extracted: string,
  plan: string,
  skillsText: string,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext
): Promise<string> {
  const geoBlock = getGeoSeoPromptBlock(skillsText)
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是内容策略主编，擅长在竞品红海中找差异化切入点。',
          articleLang.lock,
          userContext.mentionLock,
          skillsText ? `Skills 规范：\n${skillsText}` : '',
          geoBlock
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          userContext.briefForPrompt,
          userContext.productName
            ? `大纲必须包含独立章节：分步演示如何使用「${userContext.productName}」（至少 4 步）。`
            : '',
          '',
          '基于以下内部规划与 E-E-A-T 萃取要点，生成正式文章大纲（Markdown，## 为一级节）。',
          '大纲必须全部使用与主题一致的语言。',
          geoBlock
            ? '必须包含：Quick Answer/Key Takeaways、正文 ## Part 1. / Part 2. / …、[Image: …] 占位、FAQ（3 问）、Conclusion。'
            : '',
          '要求：',
          '- 必须包含作者的独立观点与论证路径',
          '- 避免复刻竞品结构',
          '- 每节注明要覆盖的核心论点',
          '',
          '--- 内部规划 ---',
          plan,
          '--- E-E-A-T 萃取 ---',
          extracted
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.5, maxTokens: 2200 }
  )
}

async function draftBySections(
  llm: LlmConfig,
  topic: string,
  outline: string,
  extracted: string,
  skillsText: string,
  userContext: UserWritingContext,
  articleLang: ArticleLanguageContext,
  emit: (event: GenerateProgressEvent) => void
): Promise<string> {
  const sections = parseOutlineSections(outline)
  const geoBlock = getGeoSeoPromptBlock(skillsText)
  let fullDraft = `# ${topic}\n\n`

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]
    const isHowToSection =
      userContext.productName &&
      /how[\s-]?to|step|guide|tutorial|教程|步骤|使用/i.test(`${section.title} ${section.body}`)

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
            userContext.mentionLock,
            skillsText ? `Skills：\n${skillsText}` : '',
            geoBlock,
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
            isHowToSection && userContext.productName
              ? `本节为 How-to：必须逐步演示「${userContext.productName}」，每步写清界面操作，多次使用产品全名。`
              : userContext.productName
                ? `若本节涉及解决方案，须自然提及「${userContext.productName}」，勿用泛称替代。`
                : '',
            '',
            '全文大纲：',
            outline,
            '',
            'E-E-A-T 参考要点：',
            extracted.slice(0, 6000),
            '',
            `请撰写本节「${section.title}」`,
            section.body.trim() ? `本节要点：\n${section.body.trim()}` : '',
            '',
            '要求：融入具体场景/案例、专业术语，避免空泛套话。'
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      { temperature: 0.65, maxTokens: 1400 }
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
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<void> {
  emit({ type: 'status', step: 'polish', message: '正在润色并降低 AI 味…' })
  emit({ type: 'reset' })

  const geoBlock = getGeoSeoPromptBlock(skillsText)
  await streamChatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深文字编辑，擅长让文章更自然、更有原创感。',
          articleLang.lock,
          userContext.mentionLock,
          skillsText ? `Skills：\n${skillsText}` : '',
          geoBlock
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
            ? `- 必须保留并强化产品「${userContext.productName}」的提及与 How-to，润色时不得删除或改成泛称`
            : userContext.raw
              ? '- 润色时必须保留用户补充要求中的关键信息（含产品/工具名称）'
              : '',
          userContext.briefForPrompt,
          '- 保留事实与结构，但改写句式与过渡',
          '- 增强作者独特语气与判断',
          '- 删除模板化开头/空洞总结',
          '- 若草稿混入了其它语言，润色时全部改为主题语言',
          geoBlock
            ? '- 保留 Quick Answer、## Part 1./Part 2. 结构、FAQ（3 问）、[Image: …] 占位符；结论 ≤150 词；总字数 1000–1500；移除任何 <thinking> 标签'
            : '',
          '- 直接输出最终 Markdown 正文，不要解释修改过程',
          '',
          draft
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    onChunk,
    { temperature: 0.55 }
  )
}

export async function generateArticle(
  options: GenerateArticleOptions,
  sender: WebContents
): Promise<{ ok: true } | { ok: false; message: string }> {
  const appConfig = await getEffectiveConfig()
  const llm = appConfig.llm
  const research = appConfig.research

  if (!llm.apiKey) {
    return { ok: false, message: '未配置 API Key，请在「AI 配置」页填写 LLM 设置。' }
  }

  const topic = options.topic?.trim()
  if (!topic) {
    return { ok: false, message: '请输入文章主题。' }
  }

  const articleLang = buildArticleLanguageContext(topic)
  const userContext = parseUserWritingContext(options.extraInstructions)

  const emit = (event: GenerateProgressEvent): void => {
    sender.send('article:progress', event)
  }

  try {
    emit({
      type: 'status',
      step: 'skills',
      message: `① 加载 Skills…（成文语言：${articleLang.label}${userContext.productName ? ` · 产品：${userContext.productName}` : ''}）`
    })
    const skillsText = await getEnabledSkillsText()

    let searchQueries = [topic]
    let sources: ResearchSource[] = []
    let extracted =
      articleLang.code === 'en'
        ? '(Research disabled; writing from topic and Skills.)'
        : '（未启用竞品调研，将基于主题与 Skills 创作。）'

    if (canRunResearch(research)) {
      emit({ type: 'status', step: 'expand', message: '② 意图扩展：拆解搜索词…' })
      searchQueries = await expandSearchQueries(llm, topic, research, articleLang)

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
        researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research),
        sources: mapSources(sources)
      })

      emit({ type: 'status', step: 'extract', message: '④ E-E-A-T 信息萃取…' })
      const corpus = buildScrapedCorpus(sources)
      extracted = await extractEeatInsights(llm, topic, corpus, skillsText, articleLang, userContext)

      emit({
        type: 'research',
        step: 'extract',
        message: 'E-E-A-T 萃取完成',
        researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research, {
          extractedPreview: extracted
        }),
        sources: mapSources(sources)
      })
    } else if (research.enabled) {
      emit({ type: 'status', message: '未配置 Tavily / Firecrawl，跳过调研阶段…' })
    }

    emit({
      type: 'status',
      step: 'plan',
      message: '⑤ 分析与规划（搜索意图 / FAQ / 大纲构思）…'
    })
    const plan = await generateArticlePlan(llm, topic, extracted, skillsText, articleLang, userContext)
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
      extracted,
      plan,
      skillsText,
      userContext,
      articleLang
    )

    if (sources.length > 0) {
      emit({
        type: 'research',
        step: 'outline',
        message: '大纲已生成',
        researchSummary: buildResearchDisplayMarkdown(topic, searchQueries, sources, research, {
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
      extracted,
      skillsText,
      userContext,
      articleLang,
      emit
    )

    await polishDraft(llm, draft, topic, skillsText, userContext, articleLang, emit, (text) => {
      emit({ type: 'chunk', text, step: 'polish' })
    })

    emit({ type: 'done' })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    emit({ type: 'error', message })
    return { ok: false, message }
  }
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
