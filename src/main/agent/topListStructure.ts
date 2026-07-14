import {
  TOP_LIST_MAX_ARTICLE_WORDS,
  TOP_LIST_MIN_ARTICLE_WORDS,
  isTopListArticle,
  MIN_FAQ_QUESTIONS,
  MAX_FAQ_QUESTIONS,
  MAX_FAQ_SECTION_WORDS
} from './articleLength'
import { GEO_BANNED_TERMS_GUIDANCE } from './geoSeoStructure'

import { isTopListSkillEnabled } from './skillPipeline'

const TOP_LIST_SKILL_PATTERN = /seo-geo-streaming-top/i

export function shouldApplyTopListStructure(skillsText: string, enabledSkillIds?: string[]): boolean {
  if (enabledSkillIds && enabledSkillIds.length > 0) {
    return isTopListSkillEnabled(enabledSkillIds) || isTopListArticle(skillsText, enabledSkillIds)
  }
  return TOP_LIST_SKILL_PATTERN.test(skillsText) || isTopListArticle(skillsText)
}

export function parseTopListCount(topic: string): number {
  const match = topic.match(/\btop\s*(\d{1,2})\b/i) ?? topic.match(/前\s*(\d{1,2})\s*(?:名|款|个)/i)
  const count = match ? Number.parseInt(match[1], 10) : 10
  return Number.isFinite(count) && count >= 3 && count <= 20 ? count : 10
}

export function getTopListProductPlacementGuidance(productName?: string): string {
  if (!productName) {
    return [
      '【用户产品】未提供产品名：Top 榜单须为真实、可区分的多款工具；勿虚构不存在的软件名称。',
      '若 Pipeline 调研中有竞品名，可改写使用；无调研时选用行业公认工具名并客观描述。'
    ].join('\n')
  }

  return [
    `【用户产品植入 — ${productName}】`,
    `1. 先判断「${productName}」是否**符合 Topic 榜单准入条件**（平台支持、功能匹配、目标场景一致）。`,
    `2. **符合条件** → 列入 Top 榜单，**排名第 1**，H3 标题形如 \`### 1. ${productName} — Best Overall\`（或更贴切副标题）；该条目篇幅可略长于其他项。`,
    `3. **不符合条件**（如 Topic 为 Spotify 下载器但产品不支持 Spotify）→ **不得**强行放入 Top 榜单凑数；在 Top 榜单**之后**单独增加一节，如 \`## Part N. Also Worth Considering: ${productName}\`，说明其适用场景、与用户搜索意图的差异，以及为何作为补充而非主榜入选。`,
    `4. Top List 模式**不要求**独立 Part 写 4 步 How-to；若用户产品位列榜首，可在该条目内用 3–4 个简短要点说明使用流程。`,
    `5. 全名「${productName}」**只**出现在其榜单 ### 条目（或 Also Worth Considering Part）内；其他产品条目与选型 Part 不要重复提及；该用全名时勿用 "this tool" 等泛称。`
  ].join('\n')
}

export const TOP_LIST_PLAN_GUIDANCE = `
【Top List 规划要点】
- 从 Topic 解析榜单数量 N（如 Top 10 → 10）；不足时默认 10。
- 规划：Quick Answer（列出榜首 3 款）→ Introduction → 选型标准 Part → Top N 榜单 Part（每条独立 ### 条目）→ 可选对比表 → FAQ → Conclusion。
- 为 N 个榜单席位各规划 1 条真实工具（调研驱动）；注明用户产品是否符合准入及排位。
`.trim()

export const TOP_LIST_OUTLINE_GUIDANCE = `
【Top List 大纲硬性结构】
1. H1 — 含 Top N + 核心品类词（如 Top 10 Spotify Music Downloaders）
2. ## Quick Answer — 3–4 bullets，直接给出榜首推荐与选型结论
3. ## Introduction — ≤150 词、≤3 段；说明读者痛点与本文如何帮他们选型
4. ## Part 1. How We Picked the Best [Category] — 通用选型维度（音质、格式、平台、速度、合规）；以标准为主，与产品自然相关时可轻量举例
5. ## Part 2. Top N [Category] — **核心榜单 Part**；每条产品一个 ### 小节，格式：
   \`### 1. [Product] — [Short verdict]\`
   每条含：1 段简介 + **Pros**（2–3 条）+ **Cons**（1 条）+ **Best for**（1 句）+ 关键参数（加粗）
6. （可选）## Part 3. Side-by-Side Comparison — Markdown 对比表（≥5 维度 × N 款产品）
7. 若用户产品**不符合**榜单准入 → 在 FAQ 之前增加 \`## Part N. Also Worth Considering: [Product]\`
8. FAQ 节 — H2 与主题相关（可含 FAQ/FAQs + 品类词，勿只写孤立 FAQ）；${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS} 问（合法性、安全、音质、免费 vs 付费、平台兼容）；整节 ≤${MAX_FAQ_SECTION_WORDS} 词
9. ## Conclusion — ≤150 词、≤3 段 + 自然 CTA

榜单 Part 内 ### 编号须连续 1…N；用户符合条件的产品固定为 ### 1。
`.trim()

/** 大纲阶段专用：只列章节与 stub，不写成品文案。 */
export const TOP_LIST_OUTLINE_SKELETON = `
【Top List 大纲骨架 — 仅结构】
首行：\`# …\` SEO H1（含 Top N + 品类核心词，**不得**与 Topic 逐字相同；可加年份/Best/Compared 等）
1. ## Quick Answer — 2–3 bullets（榜首产品名 + 一句定位，无段落）
2. ## Introduction — 2–3 bullets（痛点 + 本文价值）
3. ## Part 1. How We Picked… — 3–5 bullets（选型维度关键词）
4. ## Part 2. Top N … — **仅产品 stub**，每条一行：
   \`### N. [Product] — [≤8 词 verdict]\`
   其下最多 2 条 bullet（覆盖角度：如音质/格式/平台），**禁止**写 Pros/Cons 正文
5. （可选）## Part 3. Comparison — 1 bullet 列出对比维度名
6. （可选）## Also Worth Considering — 1–2 bullets
7. FAQ 节 — H2 与主题相关（FAQ/FAQs + 品类词等，勿只写孤立 FAQ）；${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS} 条**仅问题句**
8. ## Conclusion — 2–3 bullets
`.trim()

export const TOP_LIST_ARTICLE_STRUCTURE = `
【Top List / Best-of Article Structure — MANDATORY when this Skill is active】

This is a **ranked roundup**, NOT a single-product how-to. Do NOT use the generic GEO "one product Part + tutorial" layout.

1. H1 — Top N + category keywords
2. ## Quick Answer — 3–4 bullets naming top picks
3. ## Introduction (≤150 words, ≤3 paragraphs)
4. ## Part 1. — Selection criteria / how we evaluated (no product pitch)
5. ## Part 2. — **The Top N list** — each product as ### 1. … ### N. with Pros/Cons/Best for
6. Optional comparison table Part
7. If user's product does NOT qualify for the list → separate ## Part … Also Worth Considering (after the list, before FAQ)
8. FAQ section — topic-related ## heading (FAQ/FAQs + category cue preferred); ${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS} Q&A; entire section ≤${MAX_FAQ_SECTION_WORDS} words
9. ## Conclusion (≤150 words, ≤3 paragraphs)

Product placement:
- User's product **qualifies** → rank **#1** in the list with slightly more detail
- User's product **does not qualify** → dedicated supplemental Part outside the Top N — never fake its way into the rankings

Length: **${TOP_LIST_MIN_ARTICLE_WORDS}–${TOP_LIST_MAX_ARTICLE_WORDS} English words** (programmatically verified).
Style: US English when English is selected; geek-friendly; accurate audio/streaming terms.
Do NOT mention AI identity or "As an expert…" in the final article.
`.trim()

export function getTopListPromptBlock(
  skillsText: string,
  productName?: string,
  enabledSkillIds?: string[]
): string {
  if (!shouldApplyTopListStructure(skillsText, enabledSkillIds)) return ''

  const count = parseTopListCount(skillsText)
  return [
    TOP_LIST_ARTICLE_STRUCTURE,
    `Parsed list size from context: **Top ${count}** (adjust ### entries to match Topic).`,
    getTopListProductPlacementGuidance(productName),
    'Domain style (streaming audio): use accurate terms (bitrate, lossless, ID3, batch conversion, output formats).',
    GEO_BANNED_TERMS_GUIDANCE
  ].join('\n\n')
}
