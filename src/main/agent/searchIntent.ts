import type { ResearchConfig } from '../config/types'
import { DEFAULT_LLM_MAX_TOKENS, resolveStepMaxTokens } from '../config/llmTokenLimits'
import { getRegionLabel, LANGUAGE_PROMPT_HINT } from '../research/localeOptions'
import { chatCompletion, parseJsonArray, type LlmConfig } from './llmClient'
import { fallbackSearchQueries, getSearchQueryLanguageHint, type TopicLanguageCode } from './topicLanguage'
import type { UserWritingContext } from './userContext'

export interface SearchIntentArticleLang {
  code: TopicLanguageCode
  label: string
}

export interface ExpandSearchQueriesOptions {
  topic: string
  research: ResearchConfig
  articleLang: SearchIntentArticleLang
  maxTokens?: number
  /** 全局 llmMaxTokens 上限；未传 maxTokens 时用于 resolveStepMaxTokens('intentExpand', …) */
  globalMaxTokens?: number
  extraInstructions?: string
  userContext?: UserWritingContext
  /** 优化模式：原页摘要，帮助对齐搜索意图 */
  sourceContext?: string
}

export interface SearchIntentResult {
  intentSummary: string
  searchIntentType: string
  primaryKeyword: string
  queries: string[]
}


function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/i)
  return match ? match[1].trim() : trimmed
}

function parseSearchIntentPayload(raw: string): Partial<SearchIntentResult> | null {
  const text = stripJsonFence(raw)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<SearchIntentResult> & {
      queries?: unknown
    }
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
    return {
      intentSummary: typeof parsed.intentSummary === 'string' ? parsed.intentSummary.trim() : '',
      searchIntentType: typeof parsed.searchIntentType === 'string' ? parsed.searchIntentType.trim() : '',
      primaryKeyword: typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword.trim() : '',
      queries
    }
  } catch {
    return null
  }
}

function tokenizeForOverlap(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,，、；;：:/|]+/)
    .map((item) => item.replace(/^[^\w\u4e00-\u9fff]+|[^\w\u4e00-\u9fff]+$/g, ''))
    .filter((item) => item.length >= 3)
}

function queryOverlapsTopic(query: string, topic: string): boolean {
  const topicTokens = tokenizeForOverlap(topic)
  if (topicTokens.length === 0) return true
  const queryLower = query.toLowerCase()
  const hits = topicTokens.filter((token) => queryLower.includes(token))
  return hits.length >= Math.min(2, topicTokens.length) || hits.length / topicTokens.length >= 0.35
}

function sanitizeQueries(queries: string[], topic: string, promoProduct?: string): string[] {
  const promo = promoProduct?.trim().toLowerCase()
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const item of queries) {
    const query = item.trim().replace(/\s+/g, ' ')
    if (!query || query.length < 8) continue
    if (promo && query.toLowerCase().includes(promo)) continue

    const key = query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(query)
  }

  const anchored = cleaned.filter((query) => queryOverlapsTopic(query, topic))
  return (anchored.length >= 3 ? anchored : cleaned).slice(0, 5)
}

function buildUserBriefBlock(options: ExpandSearchQueriesOptions): string {
  const parts: string[] = []
  if (options.userContext?.briefForPrompt) {
    parts.push(options.userContext.briefForPrompt)
  } else if (options.extraInstructions?.trim()) {
    parts.push(`用户补充要求：\n${options.extraInstructions.trim()}`)
  }
  if (options.sourceContext?.trim()) {
    parts.push(`原页面语境（优化模式）：\n${options.sourceContext.trim().slice(0, 1200)}`)
  }
  return parts.join('\n\n')
}

export function buildResearchTopicFromSource(title: string, markdown: string, sourceUrl: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const intro = markdown
    .replace(/^#.+$/m, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*#>\s]+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)

  const host = (() => {
    try {
      return new URL(sourceUrl).hostname
    } catch {
      return sourceUrl
    }
  })()

  return [h1 || title.trim() || host, intro].filter(Boolean).join('\n\n').slice(0, 900)
}

export async function analyzeAndExpandSearchQueries(
  llm: LlmConfig,
  options: ExpandSearchQueriesOptions
): Promise<SearchIntentResult> {
  const { topic, research, articleLang } = options
  const userBrief = buildUserBriefBlock(options)
  const promoProduct = options.userContext?.productName

  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深 SEO 研究员，擅长从用户输入中还原真实 Google 搜索意图，并生成用于竞品博客调研的搜索词。',
          '',
          '工作流程：',
          '1. 先判断搜索意图类型（informational / how-to / comparison / transactional / review 等）',
          '2. 提炼 primaryKeyword、用户目标、必须覆盖的概念、应避免的跑题方向',
          '3. 再生成 4-5 条互不重复、能命中「博客/教程/指南类长文」的搜索词',
          '',
          '规则：',
          '- 搜索词语言必须与主题语言一致',
          '- 主题中出现的平台/服务/场景名（如 Spotify、Apple Music、World Cup、MP3）应保留，这是用户真实搜索词的一部分',
          '- 用户「指定推广产品名」仅用于成文，**不得**出现在搜索词中（避免调研变成自家产品页）',
          '- 搜索词须紧密围绕 primaryKeyword，禁止漂移到相邻但不同的主题（例：主题是世界杯歌曲下载，不要搜成世界杯赛程或球员介绍）',
          '- 每条 query 应像真实用户在 Google 输入的长尾词，可含 how to / guide / tutorial / blog / step by step / best way 等',
          '- 避免搜单曲、歌单、官方公告、纯新闻快讯',
          '',
          '只输出 JSON，不要 markdown 说明：',
          '{',
          '  "intentSummary": "1-3 句意图摘要",',
          '  "searchIntentType": "how-to|informational|comparison|...",',
          '  "primaryKeyword": "核心关键词短语",',
          '  "mustInclude": ["..."],',
          '  "mustAvoid": ["..."],',
          '  "queries": ["query1", "query2", "query3", "query4"]',
          '}'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `主题 / 待调研方向：${topic}`,
          `输出语言：${articleLang.label}`,
          getSearchQueryLanguageHint(articleLang.code),
          `目标市场：${getRegionLabel(research.searchRegion)}`,
          LANGUAGE_PROMPT_HINT[articleLang.code] ?? LANGUAGE_PROMPT_HINT.en,
          promoProduct ? `指定推广产品（禁止出现在 queries 中）：${promoProduct}` : '',
          userBrief,
          '',
          '请先分析搜索意图，再输出 JSON。'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    {
      temperature: 0.25,
      maxTokens:
        options.maxTokens ??
        resolveStepMaxTokens('intentExpand', options.globalMaxTokens ?? DEFAULT_LLM_MAX_TOKENS)
    }
  )

  const parsed = parseSearchIntentPayload(raw)
  let queries = sanitizeQueries(parsed?.queries ?? [], topic, promoProduct)

  if (queries.length < 3) {
    const fallbackFromArray = sanitizeQueries(parseJsonArray(raw), topic, promoProduct)
    if (fallbackFromArray.length >= 3) {
      queries = fallbackFromArray
    }
  }

  if (queries.length < 3) {
    queries = sanitizeQueries(fallbackSearchQueries(topic, articleLang.code), topic, promoProduct)
  }

  return {
    intentSummary: parsed?.intentSummary || `围绕「${topic}」的 ${articleLang.label} 竞品教程调研`,
    searchIntentType: parsed?.searchIntentType || 'informational',
    primaryKeyword: parsed?.primaryKeyword || topic.slice(0, 120),
    queries
  }
}

export async function expandSearchQueries(
  llm: LlmConfig,
  topic: string,
  research: ResearchConfig,
  articleLang: SearchIntentArticleLang,
  maxTokens?: number,
  context?: Omit<ExpandSearchQueriesOptions, 'topic' | 'research' | 'articleLang' | 'maxTokens'>
): Promise<string[]> {
  const result = await analyzeAndExpandSearchQueries(llm, {
    topic,
    research,
    articleLang,
    maxTokens,
    ...context
  })
  return result.queries
}
