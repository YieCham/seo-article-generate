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

/** Side-by-side comparison table Part (after our-product Alternative Part). */
export function isReviewComparisonSection(title: string, body = ''): boolean {
  const text = `${title} ${body}`.toLowerCase()
  return /comparison|对比|side[- ]?by[- ]?side|vs\.?|versus|compare\b|对照表|对比表/i.test(text)
}

/**
 * Dedicated our-product pitch Part, e.g. "The Best {Topic} Alternative: {Product}".
 * Checked after comparison so "X vs Y Comparison" does not match here.
 */
export function isReviewOurProductPartSection(title: string, body = ''): boolean {
  if (isReviewComparisonSection(title, body)) return false
  const text = `${title} ${body}`.toLowerCase()
  return /alternative|better choice|our recommendation|our pick|why choose|switch to|best .* alternative|推荐替代|更好的选择/i.test(
    text
  )
}

/** @deprecated Prefer isReviewComparisonSection / isReviewOurProductPartSection */
export function isReviewAlternativeSection(title: string, body = ''): boolean {
  return isReviewComparisonSection(title, body) || isReviewOurProductPartSection(title, body)
}

export function isReviewedProductBodySection(title: string, body = ''): boolean {
  const normalized = title.trim().toLowerCase()
  if (/^introduction$|^conclusion$/i.test(normalized) || isFaqSection(normalized)) return false
  if (/quick answer|key takeaways/i.test(normalized)) return false
  if (isReviewComparisonSection(title, body) || isReviewOurProductPartSection(title, body)) {
    return false
  }
  return true
}

/** Word budget for review-mode sections; returns 0 to fall back to generic budget. */
export function getReviewSectionWordBudget(title: string, body = ''): number {
  const text = `${title} ${body}`.toLowerCase()

  if (isReviewOurProductPartSection(title, body)) return 180
  if (isReviewComparisonSection(title, body)) return 140
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
  if (isReviewOurProductPartSection(title, body)) {
    return ourProductName
      ? [
          `本节为我方产品专属推荐 Part：标题语义应类似 **The Best ${topic} Alternative: ${ourProductName}**。`,
          `以「${ourProductName}」为主角：定位、核心优势、适合谁、为何比「${topic}」更值得考虑（可诚实承认被测评产品仍适合某些场景）。`,
          '写实质段落 + 少量 bullet；**不要**输出完整对比表（表格留给下一节）；可用 1 句自然过渡到后文对比。'
        ].join('\n')
      : '本节为我方产品推荐 Part：介绍更优替代方案的定位与优势；不要写完整对比表。'
  }

  if (isReviewComparisonSection(title, body)) {
    return ourProductName
      ? `本节为对比表格：用 Markdown 表格对比「${topic}」与「${ourProductName}」（≥5 维度）；表格后 1–2 段总结。不要重复上一节专属 Part 已写过的长篇介绍。`
      : `本节为对比表格：Markdown 对比表格 + 简短总结。`
  }

  const focus = `本节只深入写作为文章主题的「${topic}」（被测评产品）。不要提前大段写 Alternative、Better Option${ourProductName ? ` 或「${ourProductName}」` : ''}——我方产品专属 Part 与对比表放在被测评产品正文 Part **之后**。`
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

function buildReviewArticleStructure(productName?: string): string {
  const ourProductLine = productName
    ? `**The Best [Reviewed Product] Alternative: ${productName}** (Part) — dedicated pitch for our product (positioning, key strengths, who it fits); **immediately before** the comparison table; do NOT put the full table here`
    : `**The Best [Reviewed Product] Alternative: [Our Product]** (Part) — when Product name is provided; dedicated pitch **immediately before** the comparison table`

  const comparisonLine = productName
    ? `**Comparison Table** (Part) — Markdown table: reviewed product vs **${productName}** (≥5 dimensions); brief wrap-up after the table`
    : `**Comparison Table** (Part) — reviewed product vs user's product (from Product name in brief); then brief recommendation`

  return [
    '【Product Review Structure — MANDATORY when this Skill is active】',
    '',
    'The **reviewed product (article topic)** is the PRIMARY subject. Do NOT rush to "Alternative" or our product after a thin Overview + Pros/Cons.',
    '',
    `**Content balance (within ${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} word range):**`,
    '- ~**60–70% of body words** on the reviewed product BEFORE our-product Alternative Part and comparison table',
    '- Our-product Alternative Part + Comparison Table: compact sections near the end (FAQ/Conclusion still after)',
    '',
    '**Reviewed-product body Parts:**',
    '- **Required:** one **Overview** Part (positioning, what it is, target users, core use cases — substantial, not 2 sentences).',
    '- **Optional:** add **2–5** more Parts based on product nature + research (merge/split/drop as needed; do not force filler).',
    '- Optional angle menu (none required except Overview):',
    '  · Pros & Cons · Standout features · How to use (reviewed product) · Value & experience · Pricing · Compatibility / platforms · Limitations / risks · Ideal users',
    '',
    '**Fixed tail order (after reviewed-product Parts):**',
    `1. ${ourProductLine}`,
    `2. ${comparisonLine}`,
    '3. FAQ → Conclusion',
    '',
    'Only AFTER reviewed-product coverage introduce our product (Alternative Part, then comparison table).',
    '',
    'Use clear H2 / ## Part N. labels (compatible with GEO Skill).',
    'Order hard rule: reviewed-product Parts → **Alternative Part** → **Comparison Table** → FAQ → Conclusion.',
    '',
    'Tone: credible reviewer who has deeply used the reviewed product, then fairly recommends the user\'s product.',
    `Full article length: **${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} English words** (programmatically verified) — prioritize depth on the reviewed product, not filler on alternatives.`,
    'Paragraphs: write **naturally flowing prose** — no per-paragraph word cap; use bullets or ### subheadings when they add clarity.'
  ].join('\n')
}

export function getReviewPromptBlock(
  skillsText: string,
  enabledSkillIds?: string[],
  productName?: string
): string {
  if (!shouldApplyReviewStructure(skillsText, enabledSkillIds)) return ''
  return buildReviewArticleStructure(productName)
}

export function getReviewOutlineSkeleton(productName?: string): string {
  const altPart = productName
    ? `→ ## Part: The Best [Reviewed] Alternative: ${productName}（3–4 bullets：定位/优势/适合谁）`
    : '→ （有产品名时）## Part: The Best [Reviewed] Alternative: [Product]（3–4 bullets）'

  return [
    'Review 大纲骨架：首行 `# …` SEO H1（含被测评产品/主题核心词，**不得**与 Topic 逐字相同）',
    '→ Quick Answer → Introduction → **Overview Part（必选）** + 按产品性质与调研增补的可选 ## Part（各 3–4 bullets；勿硬凑）',
    `${altPart} → 对比表 Part（1 bullet 列维度）→ 与主题相关的 FAQ 节（仅问题）→ Conclusion（2–3 bullets）。`,
    '禁止写段落与表格内容；**Alternative Part 必须紧挨在对比表上方**。'
  ].join(' ')
}

/** @deprecated Use getReviewOutlineSkeleton(productName) */
export const REVIEW_OUTLINE_SKELETON = getReviewOutlineSkeleton()

export const REVIEW_OUTLINE_GUIDANCE = `
Review 大纲：被测评产品须有 **Overview Part（必选）**；其余 Part 按产品性质与调研灵活增补（如 Pros & Cons / Features / How to Use / Value 等，均可选、可合并或省略）。
有用户产品时：在 FAQ 之前依次安排 **The Best {被测评产品} Alternative: {用户产品}** 专属 Part，再安排 **对比表 Part**；专属 Part 在对比表**上方**，不得对调或合并。
不得在前几节就大篇幅写我方产品或 Alternative。
`.trim()

export const REVIEW_PLAN_GUIDANCE = `
Review 规划须为被测评产品分配主要篇幅（正文约 60–70%）；**Overview 必选**，其余 Part 按产品性质与调研灵活确定；有用户产品时再规划「Best Alternative」专属 Part + 对比表 + FAQ；禁止 Overview 过薄就直接跳 Alternative。
`.trim()
