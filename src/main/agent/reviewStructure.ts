import { MIN_ARTICLE_WORDS, MAX_ARTICLE_WORDS, isFaqSection } from './articleLength'

export const REVIEW_SKILL_ID = 'product-review'

import { isReviewSkillEnabled } from './skillPipeline'

const REVIEW_SKILL_PATTERN =
  /product-review|Review类|测评文章|comparison table|优缺点|product review guide/i

export function shouldApplyReviewStructure(skillsText: string, enabledSkillIds?: string[]): boolean {
  if (enabledSkillIds && enabledSkillIds.length > 0) {
    return isReviewSkillEnabled(enabledSkillIds) || REVIEW_SKILL_PATTERN.test(skillsText)
  }
  return REVIEW_SKILL_PATTERN.test(skillsText)
}

export function isReviewAlternativeSection(title: string, body = ''): boolean {
  const text = `${title} ${body}`.toLowerCase()
  return /comparison|对比|vs\.?|versus|compare|alternative|better choice|our recommendation|our pick|why choose|switch to|best alternative/i.test(
    text
  )
}

export function isReviewedProductBodySection(title: string, body = ''): boolean {
  const normalized = title.trim().toLowerCase()
  if (/^introduction$|^conclusion$/i.test(normalized) || isFaqSection(normalized)) return false
  if (/quick answer|key takeaways/i.test(normalized)) return false
  if (isReviewAlternativeSection(title, body)) return false
  return true
}

/** Word budget for review-mode sections; returns 0 to fall back to generic budget. */
export function getReviewSectionWordBudget(title: string, body = ''): number {
  const text = `${title} ${body}`.toLowerCase()

  if (isReviewAlternativeSection(title, body)) return 140
  if (/overview|what is|about|introduction to|介绍|整体|product review/i.test(text)) return 175
  if (/pros|cons|advantage|disadvantage|优缺点|strength|weakness/i.test(text)) return 165
  if (/feature|highlight|standout|capabilit|功能|亮点/i.test(text)) return 195
  if (/how to|usage|use it|tutorial|step|guide|使用方法|上手|workflow/i.test(text)) return 195
  if (/value|price|pricing|cost|worth|experience|体验|性价比|money|plan/i.test(text)) return 155
  if (isReviewedProductBodySection(title, body)) return 165

  return 0
}

export function getReviewSectionDraftHint(
  title: string,
  body: string,
  topic: string,
  ourProductName?: string
): string {
  if (isReviewAlternativeSection(title, body)) {
    return ourProductName
      ? `本节为对比/推荐：用 Markdown 表格对比「${topic}」与「${ourProductName}」；表格后 1–2 段总结推荐。不要重复前文已写过的产品描述。`
      : `本节为对比/推荐：Markdown 对比表格 + 简短总结。`
  }

  const focus = `本节只深入写作为文章主题的「${topic}」（被测评产品）。不要提前大段写 Alternative、Better Option${ourProductName ? ` 或「${ourProductName}」` : ''}——对比与推荐留给后面的对比章节。`
  const text = `${title} ${body}`.toLowerCase()

  if (/overview|what is|about|介绍|整体|review of/i.test(text)) {
    return `${focus}\n深度要求：至少 3 段 + bullet — 产品定义、解决什么问题、目标用户、市场定位、与同类差异；禁止 1–2 句带过。`
  }
  if (/pros|cons|advantage|disadvantage|优缺点|strength|weakness/i.test(text)) {
    return `${focus}\n深度要求：Pros 至少 4 条、Cons 至少 3 条，每条具体、可验证；本节写完优缺点后不要跳转推荐替代产品。`
  }
  if (/feature|highlight|standout|capabilit|功能|亮点/i.test(text)) {
    return `${focus}\n深度要求：至少 3–5 个功能点，每点写清「做什么 + 适用场景 + 实际体验」；用 ### 或 bullet，勿泛泛而谈。`
  }
  if (/how to|usage|use|tutorial|step|guide|使用方法|上手|workflow/i.test(text)) {
    return `${focus}\n深度要求：分步写「${topic}」的使用流程，至少 4 步；可含 [Image: …] 占位；不要写成我方产品教程。`
  }
  if (/value|price|pricing|cost|worth|experience|体验|性价比|money|plan/i.test(text)) {
    return `${focus}\n深度要求：定价/价值、适合与不适合人群、2–3 个真实使用场景；客观中立，本节仍聚焦被测评产品。`
  }

  if (isReviewedProductBodySection(title, body)) {
    return `${focus}\n深度要求：本节须充实具体（目标约 160+ 词），避免 2–3 段敷衍；被测评产品是读者首要关注对象。`
  }

  return ''
}

export const REVIEW_ARTICLE_STRUCTURE = `
【Product Review Structure — MANDATORY when Review Skill is active】

The **reviewed product (article topic)** is the PRIMARY subject. Do NOT rush to "Alternative" or our product after a thin Overview + Pros/Cons.

**Content balance (within ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} word range):**
- ~**60–70% of body words** on the reviewed product BEFORE any comparison/alternative section
- Comparison / our product recommendation: **one dedicated section near the end** (compact)

**Mandatory separate sections** — do NOT merge into one thin block:
1. **Product Overview** (Part) — positioning, target users, core use cases (substantial, not 2 sentences)
2. **Pros & Cons** (Part) — 4+ pros, 3+ cons, specific and verifiable
3. **Standout Features** (Part) — 3–5 features with scenario + experience detail each
4. **How to Use** (Part) — step-by-step for the **reviewed product** (4+ steps)
5. **Value & User Experience** (Part) — pricing/value, who it fits, realistic scenarios
6. **Comparison Table** (Part) — reviewed product vs user's product (from Product name in brief); then brief recommendation

Only AFTER sections 1–5 should you introduce our product as the better choice (mainly in section 6).

Use clear H2 / ## Part N. labels (compatible with GEO Skill).
Comparison table must appear after thorough reviewed-product coverage, before FAQ/Conclusion.

Tone: credible reviewer who has deeply used the reviewed product, then fairly recommends the user's product.
Full article length: **${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} English words** (programmatically verified) — prioritize depth on the reviewed product, not filler on alternatives.
Paragraphs: write **naturally flowing prose** — no per-paragraph word cap; use bullets or ### subheadings when they add clarity.
`.trim()

export function getReviewPromptBlock(skillsText: string, enabledSkillIds?: string[]): string {
  if (!shouldApplyReviewStructure(skillsText, enabledSkillIds)) return ''
  return REVIEW_ARTICLE_STRUCTURE
}

export const REVIEW_OUTLINE_SKELETON = `
Review 大纲骨架：首行 \`# …\` SEO H1（含被测评产品/主题核心词，**不得**与 Topic 逐字相同）→ Quick Answer → Introduction → 被测评产品 5 个 ## Part（各 3–4 bullets 角度）→ 对比表 Part（1 bullet 列维度）→ 与主题相关的 FAQ 节（仅问题）→ Conclusion（2–3 bullets）。禁止写段落与表格内容。
`.trim()

export const REVIEW_OUTLINE_GUIDANCE = `
Review 大纲必须将被测评产品拆成 **至少 5 个独立 Part**（Overview、Pros & Cons、Features、How to Use、Value/Experience），每个 Part 单独成节并注明要点。
对比表格 / Alternative 必须是 **最后一个正文 Part**（FAQ 之前），不得在前几节就大篇幅写我方产品或 Alternative。
`.trim()

export const REVIEW_PLAN_GUIDANCE = `
Review 规划须为被测评产品分配主要篇幅（正文约 60–70%），按 5 个模块分别规划 Part，再规划对比表与 FAQ；禁止 Overview + Pros 后直接跳 Alternative。
`.trim()
