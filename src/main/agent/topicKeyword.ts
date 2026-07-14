import { PLAIN_PROSE_STYLE_GUIDANCE, VOCABULARY_STYLE_GUIDANCE } from './writingStyle'

const MODULE_HEADING_PATTERN =
  /^introduction$|^conclusion$|^faqs?\b|frequently asked questions|常见问题|quick answer|key takeaways/i

export function extractOutlineH1(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m)
  const title = match?.[1]?.trim()
  return title || undefined
}

/** Prefer SEO H1 from outline; keep resumed draft H1 if already expanded. */
export function resolveArticleH1(outline: string, topic: string, existingDraft?: string): string {
  const keyword = topic.trim()
  const fromOutline = extractOutlineH1(outline)
  if (fromOutline && fromOutline !== keyword) return fromOutline

  if (existingDraft) {
    const fromDraft = extractOutlineH1(existingDraft)
    if (fromDraft && fromDraft !== keyword) return fromDraft
  }

  return fromOutline ?? keyword
}

export function getPrimaryKeywordH1Hint(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return [
    '【H1 文章标题 — 大纲首行】',
    `第一行单独输出：\`# SEO 文章标题\`（Markdown H1）。`,
    `- 须包含主关键词「${keyword}」的核心词或自然短语`,
    `- **禁止**与 Topic 字符串逐字完全相同`,
    `- 优先 How to / Fix / Set Up / Use 等**可操作、可想象**的表述；少用 Detox、Retrain、Journey 等概念包装词（除非 Topic 原文即如此）`,
    `- 可扩展搜索意图修饰：年份、Best/Top、Guide/Compared 等`,
    `- 英文宜 8–14 词；中文宜 15–28 字；可读、有点击价值，忌标题党`
  ].join('\n')
}

export function getPrimaryKeywordPromptBlock(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `
【Primary Keyword — User Topic】
The user's **Topic** is the article's **primary keyword / main focus**: 「${keyword}」

Writing must revolve around this topic end-to-end:
- **H1**: include the primary keyword or its core phrase naturally; **do NOT copy the Topic string verbatim** — expand with search-intent modifiers (year, Best, How to, guide hook, etc.) while staying concise.
- **Body H2 / ## Part headings** (excluding Quick Answer, Introduction, FAQ, Conclusion): titles must **serve search intent and read naturally for humans**. Use the primary keyword, core nouns, or **semantic variants** (LSI / paraphrase) where they fit — **do not force the exact Topic string into every H2**. Spread topic relevance across headings and body; **never keyword-stuff** titles (avoid repeating the same phrase in back-to-back H2s).
- **H3 / ### subheadings**: use clear, scannable phrasing; topic-related terms only when they improve clarity — optional, not mandatory in every Part.
- **Body copy**: tie each major section to the topic in the opening; mention the keyword naturally in prose (readable SEO density — never stuffing).
- **Do not drift** to unrelated angles; examples, steps, and FAQ must serve the primary topic/search intent.
`.trim()
}

export function getPrimaryKeywordOutlineHint(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `大纲中 Part 的 ## 标题须**语义上**围绕主关键词「${keyword}」与搜索意图；用**任务、步骤或场景**表述（如 How to Fix… / Steps to…），少用 Detox、Retrain 等概念化包装；Introduction / Quick Answer / Conclusion 除外。FAQ 节 H2 应与主题相关（可含 FAQ/FAQs + 主题词），勿只写孤立 FAQ。忌 H2 关键词堆砌。`
}

export function getPrimaryKeywordSectionHint(topic: string, sectionTitle: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  if (MODULE_HEADING_PATTERN.test(sectionTitle.trim())) {
    return `主关键词「${keyword}」：本节正文须与主题直接相关；首段自然出现主关键词或核心短语；若有 ### 小标题，至少 1 个与「${keyword}」相关。`
  }

  return `主关键词「${keyword}」：本节须围绕该主题撰写（勿跑题）。H2/### 标题用**读者能做的事或本节讲什么**来命名，少用概念包装词；正文动词宜平实可执行（skip、hide、create 等），忌堆砌抽象营销动词。`
}

export function getPrimaryKeywordPolishHint(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `- 润色时保留主题「${keyword}」的搜索意图；若标题或动词过度概念化，可改为更直白的任务/动作表述，但勿为凑关键词把各级标题改成重复、生硬的 Topic 原文`
}

export function getWritingPromptBlocks(userContextBlocks: string, topic: string): string {
  return [
    userContextBlocks,
    PLAIN_PROSE_STYLE_GUIDANCE,
    VOCABULARY_STYLE_GUIDANCE,
    getPrimaryKeywordPromptBlock(topic)
  ]
    .filter(Boolean)
    .join('\n\n')
}
