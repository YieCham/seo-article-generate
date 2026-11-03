import { getEffectiveConfig } from '../config/configStore'
import { HUMANIZER_SKILL_ID, loadSkillBundleById } from './skillManager'
import { chatCompletion } from './llmClient'
import { createTokenRunContext, runWithTokenContext } from '../token/tokenUsageContext'
import type { AiVoiceFinding } from '../../shared/aiVoice'

const MAX_FINDINGS = 8

function humanizerRubric(content: string): string {
  const lines = content.split('\n').filter((line) => {
    const trimmed = line.trim()
    return (
      /^#{1,3}\s/.test(trimmed) ||
      trimmed.startsWith('**Words to watch:**') ||
      trimmed.startsWith('**Phrases to watch:**') ||
      trimmed.startsWith('**Problem:**')
    )
  })
  return lines.join('\n').trim().slice(0, 2800)
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function keepQuote(article: string, quote: string): boolean {
  const text = quote.trim()
  if (text.length < 24 || text.length > 420) return false
  if (!article.includes(text)) return false
  if (/^#{1,6}\s/.test(text)) return false
  return true
}

export async function scanArticleAiVoice(article: string): Promise<AiVoiceFinding[]> {
  const body = article.trim()
  if (body.length < 80) return []

  const appConfig = await getEffectiveConfig()
  if (!appConfig.llm.apiKey) {
    throw new Error('未配置 API Key，请在「AI 配置」页填写 LLM 设置。')
  }

  const bundle = await loadSkillBundleById(HUMANIZER_SKILL_ID)
  const rubric = bundle ? humanizerRubric(bundle.content) : ''

  const raw = await runWithTokenContext(createTokenRunContext('other', '去 AI 味扫描'), () =>
    chatCompletion(
      appConfig.llm,
      [
        {
          role: 'system',
          content: [
            'You scan finished prose for AI-writing patterns. You do not rewrite the article.',
            'Return ONLY JSON: {"findings":[{"quote":"...","pattern":"...","reason":"..."}]}',
            'quote must be an exact contiguous substring copied from the article (one sentence or clause).',
            `At most ${MAX_FINDINGS} findings. Skip headings, SEO Meta, and ordinary factual sentences.`,
            'Do not invent quotes that are not in the article.',
            rubric ? `Humanizer rubric:\n${rubric}` : ''
          ]
            .filter(Boolean)
            .join('\n\n')
        },
        {
          role: 'user',
          content: ['Scan this article. JSON only.', '', body.slice(0, 14000)].join('\n')
        }
      ],
      {
        temperature: 0.2,
        jsonObject: true,
        maxTokens: 2500,
        step: 'sectionEdit',
        label: '去 AI 味扫描'
      }
    )
  )

  const parsed = parseJsonObject(raw)
  const rows = asRecords(parsed?.findings)
  const findings: AiVoiceFinding[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const quote = textField(row, 'quote')
    if (!keepQuote(body, quote) || seen.has(quote)) continue
    seen.add(quote)
    findings.push({
      id: `ai-${findings.length + 1}`,
      quote,
      pattern: textField(row, 'pattern') || 'AI 腔',
      reason: textField(row, 'reason') || '读起来像模板化 AI 表述'
    })
    if (findings.length >= MAX_FINDINGS) break
  }

  return findings
}

export async function suggestAiVoiceRewrites(
  article: string,
  findings: AiVoiceFinding[]
): Promise<AiVoiceFinding[]> {
  const targets = findings.filter((item) => article.includes(item.quote))
  if (targets.length === 0) return []

  const appConfig = await getEffectiveConfig()
  if (!appConfig.llm.apiKey) {
    throw new Error('未配置 API Key，请在「AI 配置」页填写 LLM 设置。')
  }

  const bundle = await loadSkillBundleById(HUMANIZER_SKILL_ID)
  const rubric = bundle ? humanizerRubric(bundle.content) : ''

  const raw = await runWithTokenContext(createTokenRunContext('other', '去 AI 味建议'), () =>
    chatCompletion(
      appConfig.llm,
      [
        {
          role: 'system',
          content: [
            'Rewrite only the quoted spans so they sound less like AI. Do not rewrite the whole article.',
            'Keep every fact. Do not add names, numbers, citations, or claims that are not in the quote.',
            'Return ONLY JSON: {"rewrites":[{"id":"...","replacement":"..."}]}',
            'replacement replaces the quote in place; similar length; same language.',
            rubric ? `Humanizer rubric:\n${rubric}` : ''
          ]
            .filter(Boolean)
            .join('\n\n')
        },
        {
          role: 'user',
          content: JSON.stringify({
            findings: targets.map((item) => ({
              id: item.id,
              pattern: item.pattern,
              reason: item.reason,
              quote: item.quote
            }))
          })
        }
      ],
      {
        temperature: 0.3,
        jsonObject: true,
        maxTokens: 2500,
        step: 'sectionEdit',
        label: '去 AI 味建议'
      }
    )
  )

  const parsed = parseJsonObject(raw)
  const rows = asRecords(parsed?.rewrites)
  const byId = new Map<string, string>()
  for (const row of rows) {
    const id = textField(row, 'id')
    const replacement = textField(row, 'replacement')
    if (id && replacement) byId.set(id, replacement)
  }

  return targets.map((item) => ({
    ...item,
    replacement: byId.get(item.id) || item.replacement
  }))
}
