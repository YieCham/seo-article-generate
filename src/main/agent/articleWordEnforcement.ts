import { streamChatCompletion, type LlmConfig } from './llmClient'
import {
  getArticleLengthBounds,
  countArticleWords,
  getArticleLengthPromptBlock
} from './articleLength'
import type { GenerateProgressEvent } from './articleAgent'

import { getOptimizePromptBlocks } from './optimizeStructure'

interface ArticleLanguageContext {
  lock: string
  label: string
}

interface WordCountBounds {
  min: number
  max: number
  label: string
}

async function runWordCountAdjustment(
  llm: LlmConfig,
  article: string,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  bounds: WordCountBounds,
  maxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void,
  options?: { optimizeMode?: boolean; sourcePreview?: string; skillsText?: string }
): Promise<string> {
  let result = article.trim()
  let count = countArticleWords(result)

  if (count >= bounds.min && count <= bounds.max) {
    return result
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    count = countArticleWords(result)
    if (count >= bounds.min && count <= bounds.max) break

    const expand = count < bounds.min
    emit({
      type: 'status',
      step: 'length',
      message: `⑨ 词数校准：程序计数 ${count} 词 → 目标 ${bounds.label}…`
    })
    emit({ type: 'reset' })

    let adjusted = ''
    await streamChatCompletion(
      llm,
      [
        {
          role: 'system',
          content: [
            options?.optimizeMode
              ? '你是文章长度编辑。在**保守优化**前提下微调词数：保留原有结构与绝大部分原句，禁止整篇重写。'
              : '你是文章长度编辑。根据程序测定的词数，将 Markdown 文章调整到指定区间。',
            articleLang.lock,
            options?.optimizeMode ? getOptimizePromptBlocks() : getArticleLengthPromptBlock(options?.skillsText)
          ].join('\n\n')
        },
        {
          role: 'user',
          content: [
            `主题/页面：${topicLabel}`,
            `程序计词结果：**${count}** English words（系统会再次程序计数，输出须落在区间内）`,
            `目标区间：**${bounds.min}–${bounds.max}** words（${bounds.label}）`,
            expand
              ? options?.optimizeMode
                ? `- 当前过短：在**不改变章节结构**的前提下，于相关章节**插入**诊断/竞品中的缺失要点；禁止整节重写`
                : `- 当前过短：在保留结构与关键信息的前提下，补充**与主题相关且对读者有帮助**的实质内容（实用示例、操作细节、常见误区、使用场景等），至少达到 ${bounds.min} 词；**禁止**用重复句、同义反复、空话套话等方式水字数`
              : `- 当前过长：删减重复与低价值表述，保留结构与关键信息，不超过 ${bounds.max} 词`,
            '- 保留 Markdown 结构（H1/H2/FAQ/表格/[Image: …] 占位符）',
            '- 不要输出词数说明或修改过程，直接输出完整 Markdown 正文',
            options?.sourcePreview
              ? ['', '--- 原页面参考（勿偏离核心信息与结构）---', options.sourcePreview.slice(0, 3500)].join('\n')
              : '',
            '',
            result
          ]
            .filter(Boolean)
            .join('\n')
        }
      ],
      (text) => {
        adjusted += text
        onChunk(text)
      },
      { temperature: options?.optimizeMode ? 0.2 : 0.35, maxTokens }
    )

    result = adjusted.trim()
  }

  return result
}

export async function enforceArticleWordCount(
  llm: LlmConfig,
  article: string,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  maxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void,
  skillsText?: string
): Promise<string> {
  const bounds = getArticleLengthBounds(skillsText)
  return runWordCountAdjustment(
    llm,
    article,
    topicLabel,
    articleLang,
    { min: bounds.min, max: bounds.max, label: bounds.label },
    maxTokens,
    emit,
    onChunk,
    { skillsText }
  )
}

export async function enforceOptimizeArticleWordCount(
  llm: LlmConfig,
  article: string,
  topicLabel: string,
  articleLang: ArticleLanguageContext,
  bounds: WordCountBounds,
  sourceMarkdown: string,
  maxTokens: number,
  emit: (event: GenerateProgressEvent) => void,
  onChunk: (text: string) => void
): Promise<string> {
  return runWordCountAdjustment(llm, article, topicLabel, articleLang, bounds, maxTokens, emit, onChunk, {
    optimizeMode: true,
    sourcePreview: sourceMarkdown
  })
}
