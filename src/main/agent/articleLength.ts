import { maxTokensForSectionDraft, type SectionDraftTier } from '../config/llmTokenLimits'

export const MIN_ARTICLE_WORDS = 1000
export const MAX_ARTICLE_WORDS = 1500
export const TARGET_ARTICLE_WORDS = 1250

export const TOP_LIST_MIN_ARTICLE_WORDS = 1200
export const TOP_LIST_MAX_ARTICLE_WORDS = 2000
export const TOP_LIST_TARGET_ARTICLE_WORDS = 1700

export const MAX_INTRO_CONCLUSION_PARAGRAPHS = 3
export const MAX_INTRO_CONCLUSION_WORDS = 150

const TOP_LIST_SKILL_PATTERN = /seo-geo-streaming-top/i

export function isTopListArticle(skillsText: string): boolean {
  return TOP_LIST_SKILL_PATTERN.test(skillsText)
}

export interface ArticleLengthBounds {
  min: number
  max: number
  target: number
  label: string
}

export function getArticleLengthBounds(skillsText?: string): ArticleLengthBounds {
  if (skillsText && isTopListArticle(skillsText)) {
    return {
      min: TOP_LIST_MIN_ARTICLE_WORDS,
      max: TOP_LIST_MAX_ARTICLE_WORDS,
      target: TOP_LIST_TARGET_ARTICLE_WORDS,
      label: `${TOP_LIST_MIN_ARTICLE_WORDS}–${TOP_LIST_MAX_ARTICLE_WORDS}`
    }
  }
  return {
    min: MIN_ARTICLE_WORDS,
    max: MAX_ARTICLE_WORDS,
    target: TARGET_ARTICLE_WORDS,
    label: `${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS}`
  }
}

function buildArticleLengthGuidance(bounds: ArticleLengthBounds): string {
  return `
【Article Length — HARD LIMIT (full article only)】
- The complete final article (excluding bracketed image placeholders and ## SEO Meta) MUST be **${bounds.min}–${bounds.max} English words** (target ~${bounds.target}).
- Length is verified **programmatically** — do not trust your own word estimate.
- **No per-paragraph word/sentence cap** — write naturally flowing paragraphs; only the **full-article** range above is enforced.
- If under ${bounds.min}: expand with **genuinely helpful, topic-related content** (practical examples, product comparison detail, selection criteria, FAQ depth) — **never pad** with repetition, filler phrases, or generic fluff.
- If over ${bounds.max}: cut redundancy and low-value sentences — preserve structure and key facts.
- Introduction ≤${MAX_INTRO_CONCLUSION_WORDS} words, **≤${MAX_INTRO_CONCLUSION_PARAGRAPHS} paragraphs**; Conclusion ≤${MAX_INTRO_CONCLUSION_WORDS} words, **≤${MAX_INTRO_CONCLUSION_PARAGRAPHS} paragraphs**; Quick Answer ≤100 words; keep FAQ answers brief.
`.trim()
}

export function countArticleWords(text: string): number {
  const body = text.replace(/^##\s+SEO Meta[\s\S]*?(?=\n## |\n# |$)/im, '').trim()
  const withoutPlaceholders = body.replace(/\[Image:[^\]]*\]/gi, ' ')
  const plain = withoutPlaceholders
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[|*_`~>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return 0

  const cjk = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  const latin = plain.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return latin + Math.ceil(cjk / 1.5)
}

export function formatArticleWordRangeLabel(): string {
  return `${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS}`
}

export const ARTICLE_LENGTH_GUIDANCE = buildArticleLengthGuidance(getArticleLengthBounds())

export const CONTENT_READABILITY_GUIDANCE = `
【Content Quality & Readability】
- Write **cohesive, readable paragraphs** — vary length naturally; avoid choppy one-sentence-per-line fragmentation.
- One main idea per paragraph is fine, but merge related sentences into flowing prose where it reads better.
- Use bullet lists and ### subheadings when they clarify steps or comparisons — not to artificially split every thought.
- Never quote writing brief labels in the article (e.g. "Target audience", "for US reader", "Product name:", "Article type:").
- **Anti-filler rule:** every added sentence must help the reader — no throat-clearing, no saying the same point twice in different words to hit word count.
- **Anti-promo rule:** when a product name is specified, mention it in designated sections (Quick Answer, product Part, comparison, conclusion) and in generic Parts only when content naturally links; do not repeat the name in every paragraph or FAQ answer.
`.trim()

export function getArticleLengthPromptBlock(skillsText?: string): string {
  const bounds = getArticleLengthBounds(skillsText)
  return `${buildArticleLengthGuidance(bounds)}\n\n${CONTENT_READABILITY_GUIDANCE}`
}

export function isIntroductionSection(title: string): boolean {
  return /^introduction$/i.test(title.trim())
}

export function isConclusionSection(title: string): boolean {
  return /^conclusion$/i.test(title.trim())
}

export function getIntroConclusionSectionHint(title: string): string {
  if (isIntroductionSection(title)) {
    return `本节为 Introduction：严格 ≤${MAX_INTRO_CONCLUSION_WORDS} 英文词，**最多 ${MAX_INTRO_CONCLUSION_PARAGRAPHS} 个段落**（空行分隔）；共情痛点并概述全文，勿写 Part 内容。`
  }
  if (isConclusionSection(title)) {
    return `本节为 Conclusion：严格 ≤${MAX_INTRO_CONCLUSION_WORDS} 英文词，**最多 ${MAX_INTRO_CONCLUSION_PARAGRAPHS} 个段落**（空行分隔）；总结核心观点并自然 CTA，勿引入新论点。`
  }
  return ''
}

export function getIntroConclusionPolishHint(): string {
  return `- Introduction 与 Conclusion 各不超过 ${MAX_INTRO_CONCLUSION_PARAGRAPHS} 个段落（空行分隔）且各 ≤${MAX_INTRO_CONCLUSION_WORDS} 英文词`
}

export function getSectionWordBudget(title: string, allTitles: string[], targetWords = TARGET_ARTICLE_WORDS): number {
  const normalized = title.trim().toLowerCase()

  if (/^introduction$/i.test(normalized)) return 150
  if (/^conclusion$/i.test(normalized)) return 150
  if (/quick answer|key takeaways/i.test(normalized)) return 100
  if (/^faq$/i.test(normalized)) return 220
  if (/comparison|对比|vs\.?|versus|compare/i.test(normalized)) return 180
  if (/top\s*\d+|best\s+\d+|also worth considering|榜单/i.test(normalized)) return 900

  let reserved = 0
  let flexCount = 0

  for (const item of allTitles) {
    const key = item.trim().toLowerCase()
    if (/^introduction$/i.test(key)) reserved += 150
    else if (/^conclusion$/i.test(key)) reserved += 150
    else if (/quick answer|key takeaways/i.test(key)) reserved += 100
    else if (/^faq$/i.test(key)) reserved += 220
    else if (/comparison|对比|vs\.?|versus|compare/i.test(key)) reserved += 180
    else flexCount += 1
  }

  const remaining = targetWords - reserved
  return flexCount > 0 ? Math.max(120, Math.floor(remaining / flexCount)) : 150
}

export type { SectionDraftTier }

export function resolveSectionDraftTokenPlan(
  title: string,
  body: string,
  sectionWordBudget: number,
  flags: {
    isHowToSection: boolean
    isProductPartSection: boolean
    introConclusionHint: string
  }
): { wordBudget: number; tier: SectionDraftTier } {
  const ctx = `${title} ${body}`
  const normalized = title.trim().toLowerCase()

  if (/^seo meta/i.test(normalized)) {
    return { wordBudget: Math.min(sectionWordBudget, 120), tier: 'light' }
  }
  if (flags.introConclusionHint || /^quick answer|key takeaways/i.test(normalized)) {
    return { wordBudget: sectionWordBudget, tier: 'light' }
  }
  if (
    flags.isHowToSection ||
    flags.isProductPartSection ||
    /step[\s-]?by[\s-]?step|tutorial|how to use|official step|workaround|converter|better/i.test(ctx)
  ) {
    return { wordBudget: Math.max(sectionWordBudget, 420), tier: 'heavy' }
  }
  if (/pros|cons|value|experience|worth|feature|standout/i.test(ctx)) {
    return { wordBudget: Math.max(sectionWordBudget, 320), tier: 'default' }
  }
  return { wordBudget: sectionWordBudget, tier: 'default' }
}

export function maxTokensForWordBudget(
  words: number,
  cap = 8192,
  tier: SectionDraftTier = 'default'
): number {
  return maxTokensForSectionDraft(words, cap, tier)
}
