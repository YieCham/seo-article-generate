import type { WebContents } from 'electron'
import { getEffectiveConfig } from '../config/configStore'
import { maxTokensForOptimizeFullDraft } from '../config/llmTokenLimits'
import {
  createTokenRunContext,
  runWithTokenContext,
  updateTokenUsageContext
} from '../token/tokenUsageContext'
import { scrapeToMarkdown, OPTIMIZE_MAX_MARKDOWN_CHARS } from '../research/firecrawl'
import { getLanguageLabel } from '../research/localeOptions'
import { throwIfAborted } from './abortContext'
import { isAbortError } from './articleRunRegistry'
import { mapSources, type GenerateProgressEvent } from './articleAgent'
import { getEnabledSkillBundles } from './skillManager'
import { buildFullSkillsText } from './skillPipeline'
import { chatCompletion, type LlmConfig } from './llmClient'
import {
  getArticleLanguageLock,
  type TopicLanguageCode
} from './topicLanguage'
import { normalizeOutputLanguage, type OutputLanguageCode } from './outputLanguage'
import {
  countWords,
  extractSourceH1,
  validateSourceMarkdown
} from './optimizeStructure'
import { CONTENT_READABILITY_GUIDANCE } from './articleLength'
import { getUserContextPromptBlocks, parseUserWritingContext } from './userContext'
import { normalizeArticleMarkdown } from '../../shared/normalizeArticleMarkdown'

export interface BatchOptimizePageOptions {
  sourceUrl: string
  extraInstructions?: string
  outputLanguage?: OutputLanguageCode | string
  llmPresetId?: string
  llmModel?: string
}

function normalizeSourceUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('请输入页面 URL。')

  try {
    const url = new URL(
      trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`
    )
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
    return url.toString()
  } catch {
    throw new Error('请输入有效的 URL（需为 http:// 或 https:// 链接）。')
  }
}

function buildSourcePreviewMarkdown(sourceUrl: string, title: string, markdown: string): string {
  return [
    '## 页面抓取结果',
    '',
    `- **URL：** ${sourceUrl}`,
    `- **标题：** ${title}`,
    `- **词数：** ${countWords(markdown)}`,
    `- **正文预览：**`,
    '',
    markdown.slice(0, 2400),
    markdown.length > 2400 ? '\n\n…（预览已截断，优化将使用完整抓取正文）' : ''
  ].join('\n')
}

async function optimizeScrapedPage(
  llm: LlmConfig,
  sourceUrl: string,
  title: string,
  sourceMarkdown: string,
  skillsText: string,
  articleLang: { code: TopicLanguageCode; lock: string; label: string },
  userContext: ReturnType<typeof parseUserWritingContext>,
  maxTokens: number
): Promise<string> {
  return chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是资深 SEO/GEO 编辑。请严格遵循以下 Skills 中的页面批量优化规范。',
          '本流程仅使用 Firecrawl 抓取的正文，不进行 Tavily 竞品调研。',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          skillsText ? `Skills：\n${skillsText}` : '',
          CONTENT_READABILITY_GUIDANCE
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `原文 URL：${sourceUrl}`,
          `页面标题：${title}`,
          userContext.briefForPrompt,
          '',
          '请基于下方抓取正文，**直接输出完整优化后的 Markdown 文章**：',
          '- 在原文骨架上就地优化：优质处保留并增强，问题处删减或替换',
          '- 保留原文 H2/H3 顺序与语言',
          '- 直接输出正文，不要解释过程',
          '- 不要用 ```markdown 代码围栏包裹正文',
          '',
          '--- 抓取正文 ---',
          sourceMarkdown
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.35, maxTokens, step: 'draft', label: '页面批量优化' }
  )
}

export async function batchOptimizePage(
  options: BatchOptimizePageOptions,
  sender: WebContents
): Promise<{ ok: boolean; message?: string }> {
  const llmSelection = {
    presetId: options.llmPresetId ?? '',
    model: options.llmModel ?? ''
  }
  const appConfig = await getEffectiveConfig(
    llmSelection.presetId && llmSelection.model ? llmSelection : null
  )
  const llm = appConfig.llm
  const firecrawlKey = appConfig.research.firecrawlApiKey
  const globalMaxTokens = appConfig.llmMaxTokens

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

  return runWithTokenContext(createTokenRunContext('batch-optimize', sourceUrl), async () => {
    const emit = (event: GenerateProgressEvent): void => {
      if (event.step) {
        updateTokenUsageContext({ step: event.step, stepLabel: event.message })
      }
      sender.send('article:progress', event)
    }

    try {
      emit({ type: 'status', step: 'skills', message: '① 加载页面批量优化 Skills…' })
      throwIfAborted()
      const skillBundles = await getEnabledSkillBundles('batch-optimize')
      const skillsText = buildFullSkillsText(skillBundles)

      emit({ type: 'status', step: 'scrape', message: '② Firecrawl 抓取页面正文…' })
      throwIfAborted()
      const scraped = await scrapeToMarkdown(sourceUrl, firecrawlKey, OPTIMIZE_MAX_MARKDOWN_CHARS)
      validateSourceMarkdown(scraped.markdown)

      emit({
        type: 'research',
        step: 'scrape',
        message: '页面抓取完成',
        researchSummary: buildSourcePreviewMarkdown(scraped.url, scraped.title, scraped.markdown),
        sources: mapSources([])
      })

      const articleLang = {
        code: normalizeOutputLanguage(options.outputLanguage),
        lock: getArticleLanguageLock(normalizeOutputLanguage(options.outputLanguage), 'user'),
        label: getLanguageLabel(normalizeOutputLanguage(options.outputLanguage))
      }

      emit({
        type: 'status',
        step: 'draft',
        message: `③ 生成优化全文（${articleLang.label}）…`
      })
      throwIfAborted()

      const optimized = normalizeArticleMarkdown(
        await optimizeScrapedPage(
          llm,
          scraped.url,
          scraped.title,
          scraped.markdown,
          skillsText,
          articleLang,
          userContext,
          maxTokensForOptimizeFullDraft(countWords(scraped.markdown), globalMaxTokens)
        )
      )

      const draft = optimized.startsWith('#')
        ? optimized
        : `# ${extractSourceH1(scraped.markdown, scraped.title)}\n\n${optimized}`

      emit({ type: 'chunk', text: draft, step: 'draft' })
      emit({ type: 'done' })
      return { ok: true }
    } catch (error) {
      if (isAbortError(error)) {
        emit({ type: 'cancelled', message: '已中止生成' })
        return { ok: false, message: '已中止生成' }
      }
      const message = error instanceof Error ? error.message : '页面批量优化失败'
      emit({ type: 'error', message })
      return { ok: false, message }
    }
  })
}
