import { resolveStepMaxTokens } from '../config/llmTokenLimits'
import { chatCompletion, type LlmConfig } from './llmClient'
import type { UserWritingContext } from './userContext'

export interface WritingBrief {
  intentOneLiner: string
  keyFacts: string[]
  competitorGaps: string[]
  faqSeeds: string[]
  toneNotes: string
  mustAvoid: string[]
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/i)
  return match ? match[1].trim() : trimmed
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems)
}

function parseWritingBriefPayload(raw: string, topic: string, searchIntentSummary?: string): WritingBrief {
  const text = stripJsonFence(raw)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<WritingBrief>
      return {
        intentOneLiner:
          typeof parsed.intentOneLiner === 'string' && parsed.intentOneLiner.trim()
            ? parsed.intentOneLiner.trim()
            : searchIntentSummary?.split('\n')[0]?.trim() || topic,
        keyFacts: normalizeStringList(parsed.keyFacts, 12),
        competitorGaps: normalizeStringList(parsed.competitorGaps, 6),
        faqSeeds: normalizeStringList(parsed.faqSeeds, 8),
        toneNotes: typeof parsed.toneNotes === 'string' ? parsed.toneNotes.trim() : '',
        mustAvoid: normalizeStringList(parsed.mustAvoid, 8)
      }
    } catch {
      // fall through
    }
  }

  return fallbackWritingBrief(topic, raw, searchIntentSummary)
}

function fallbackWritingBrief(topic: string, extracted: string, searchIntentSummary?: string): WritingBrief {
  const lines = extracted
    .split('\n')
    .map((line) => line.replace(/^[-*#\d.]+\s*/, '').trim())
    .filter((line) => line.length > 12)

  return {
    intentOneLiner: searchIntentSummary?.split('\n')[0]?.trim() || topic,
    keyFacts: lines.slice(0, 10),
    competitorGaps: lines.slice(10, 15),
    faqSeeds: lines.filter((line) => /\?|？|faq|question/i.test(line)).slice(0, 5),
    toneNotes: 'Expert, helpful, compliance-aware; match article output language.',
    mustAvoid: ['keyword stuffing', 'off-topic news', 'hard-sell in generic Parts']
  }
}

export function formatWritingBriefForPrompt(brief: WritingBrief): string {
  const sections = [
    `意图：${brief.intentOneLiner}`,
    brief.toneNotes ? `语气：${brief.toneNotes}` : '',
    brief.keyFacts.length ? `关键事实（8–12）：\n${brief.keyFacts.map((item) => `- ${item}`).join('\n')}` : '',
    brief.competitorGaps.length
      ? `竞品缺口 / 差异化机会：\n${brief.competitorGaps.map((item) => `- ${item}`).join('\n')}`
      : '',
    brief.faqSeeds.length ? `FAQ 种子：\n${brief.faqSeeds.map((item) => `- ${item}`).join('\n')}` : '',
    brief.mustAvoid.length ? `须避免：${brief.mustAvoid.join('；')}` : ''
  ].filter(Boolean)

  return sections.join('\n\n')
}

export function formatWritingBriefForSection(brief: WritingBrief): string {
  return [
    `写作意图：${brief.intentOneLiner}`,
    brief.keyFacts.length
      ? `可用事实/洞察：\n${brief.keyFacts.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
      : '',
    brief.competitorGaps.length
      ? `差异化要点：\n${brief.competitorGaps.slice(0, 4).map((item) => `- ${item}`).join('\n')}`
      : '',
    brief.mustAvoid.length ? `本节须避免：${brief.mustAvoid.slice(0, 4).join('；')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function generateWritingBrief(
  llm: LlmConfig,
  topic: string,
  extracted: string,
  articleLangLabel: string,
  userContext: UserWritingContext,
  globalMaxTokens: number,
  searchIntentSummary?: string
): Promise<WritingBrief> {
  if (!extracted.trim() || extracted.startsWith('（未') || extracted.startsWith('(Research')) {
    return fallbackWritingBrief(topic, '', searchIntentSummary)
  }

  const raw = await chatCompletion(
    llm,
    [
      {
        role: 'system',
        content: [
          '你是内容策略编辑。将 E-E-A-T 竞品萃取笔记压缩为「写作简报」，供后续规划与分段撰写复用。',
          '只输出 JSON，不要 markdown 说明。',
          '字段：intentOneLiner, keyFacts(8-12), competitorGaps(3-5), faqSeeds(3-5), toneNotes, mustAvoid(3-6)',
          '保留可写进正文的事实与差异化角度；删除导航残留与水词。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          `主题：${topic}`,
          `成文语言：${articleLangLabel}`,
          searchIntentSummary ? `搜索意图分析：\n${searchIntentSummary}` : '',
          userContext.briefForPrompt,
          '',
          '--- E-E-A-T 萃取原文 ---',
          extracted.slice(0, 8000),
          '',
          '输出 JSON。'
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    { temperature: 0.25, maxTokens: resolveStepMaxTokens('writingBrief', globalMaxTokens) }
  )

  return parseWritingBriefPayload(raw, topic, searchIntentSummary)
}
