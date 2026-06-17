import { chatCompletion, type LlmConfig } from './llmClient'
import { getUserContextPromptBlocks, type UserWritingContext } from './userContext'

export const META_TITLE_MAX_CHARS = 60
export const META_DESCRIPTION_MAX_CHARS = 160

export interface SeoMetaFields {
  metaTitle: string
  metaDescription: string
}

export const SEO_META_GUIDANCE = `
【SEO Meta — output separate from article body】
- Meta Title: 50–${META_TITLE_MAX_CHARS} characters; primary keyword near the start; compelling and unique; no clickbait.
- Meta Description: 140–${META_DESCRIPTION_MAX_CHARS} characters; summarize core value, include primary keyword once, end with subtle CTA; no HTML tags.
- Language must match the article (same as topic/article body).
- Do NOT repeat the Meta Title verbatim inside the Meta Description.
`.trim()

export function enforceSeoMetaLimits(meta: SeoMetaFields): SeoMetaFields {
  const trimAtWord = (text: string, max: number): string => {
    const trimmed = text.trim()
    if (trimmed.length <= max) return trimmed
    const slice = trimmed.slice(0, max)
    const lastSpace = slice.lastIndexOf(' ')
    return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim()
  }

  return {
    metaTitle: trimAtWord(meta.metaTitle, META_TITLE_MAX_CHARS),
    metaDescription: trimAtWord(meta.metaDescription, META_DESCRIPTION_MAX_CHARS)
  }
}

export function parseSeoMetaResponse(raw: string): SeoMetaFields | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      metaTitle?: string
      metaDescription?: string
      title?: string
      description?: string
    }
    const metaTitle = (parsed.metaTitle ?? parsed.title)?.trim()
    const metaDescription = (parsed.metaDescription ?? parsed.description)?.trim()
    if (!metaTitle || !metaDescription) return null
    return enforceSeoMetaLimits({ metaTitle, metaDescription })
  } catch {
    return null
  }
}

export function formatSeoMetaBlock(meta: SeoMetaFields): string {
  return [
    '## SEO Meta',
    '',
    `- **Meta Title:** ${meta.metaTitle}`,
    `- **Meta Description:** ${meta.metaDescription}`,
    '',
    '---',
    ''
  ].join('\n')
}

interface ArticleLanguageContext {
  label: string
  lock: string
}

export async function generateSeoMeta(
  llm: LlmConfig,
  topic: string,
  articleBody: string,
  articleLang: ArticleLanguageContext,
  userContext: UserWritingContext,
  maxTokens: number
): Promise<SeoMetaFields> {
  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          'You are an SEO specialist writing page meta tags for search engines (Google).',
          articleLang.lock,
          getUserContextPromptBlocks(userContext),
          SEO_META_GUIDANCE
        ]
          .filter(Boolean)
          .join('\n\n')
      },
      {
        role: 'user',
        content: [
          `Topic / primary keyword context: ${topic}`,
          userContext.productName ? `Product to reflect when relevant: ${userContext.productName}` : '',
          userContext.briefForPrompt,
          '',
          'Based on the finished article below, write ONE Meta Title and ONE Meta Description.',
          `Output language: ${articleLang.label}`,
          `Meta Title ≤ ${META_TITLE_MAX_CHARS} characters; Meta Description ≤ ${META_DESCRIPTION_MAX_CHARS} characters.`,
          'Return ONLY valid JSON:',
          '{"metaTitle":"...","metaDescription":"..."}',
          '',
          '--- Article ---',
          articleBody.slice(0, 12000)
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.4, maxTokens }
  )

  const parsed = parseSeoMetaResponse(raw)
  if (parsed) return parsed

  return enforceSeoMetaLimits({
    metaTitle: topic.slice(0, META_TITLE_MAX_CHARS),
    metaDescription: `Learn about ${topic}. Read our guide for practical tips and expert insights.`.slice(
      0,
      META_DESCRIPTION_MAX_CHARS
    )
  })
}
