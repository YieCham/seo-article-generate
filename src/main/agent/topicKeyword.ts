const MODULE_HEADING_PATTERN = /^introduction$|^conclusion$|^faq$|quick answer|key takeaways/i

export function getPrimaryKeywordPromptBlock(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `
【Primary Keyword — User Topic】
The user's **Topic** is the article's **primary keyword / main focus**: 「${keyword}」

Writing must revolve around this topic end-to-end:
- **H1**: include the primary keyword or its core phrase naturally (not a generic title alone).
- **Body H2 / ## Part headings** (excluding Quick Answer, Introduction, FAQ, Conclusion): titles must **serve search intent and read naturally for humans**. Use the primary keyword, core nouns, or **semantic variants** (LSI / paraphrase) where they fit — **do not force the exact Topic string into every H2**. Spread topic relevance across headings and body; **never keyword-stuff** titles (avoid repeating the same phrase in back-to-back H2s).
- **H3 / ### subheadings**: use clear, scannable phrasing; topic-related terms only when they improve clarity — optional, not mandatory in every Part.
- **Body copy**: tie each major section to the topic in the opening; mention the keyword naturally in prose (readable SEO density — never stuffing).
- **Do not drift** to unrelated angles; examples, steps, and FAQ must serve the primary topic/search intent.
`.trim()
}

export function getPrimaryKeywordOutlineHint(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `大纲中 Part 的 ## 标题须**语义上**围绕主关键词「${keyword}」与搜索意图，优先可读、自然的标题；**不必**逐字复现 Topic，可用同义表达或核心名词（Introduction / Quick Answer / FAQ / Conclusion 等模块名除外）。忌 H2 关键词堆砌。`
}

export function getPrimaryKeywordSectionHint(topic: string, sectionTitle: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  if (MODULE_HEADING_PATTERN.test(sectionTitle.trim())) {
    return `主关键词「${keyword}」：本节正文须与主题直接相关；首段自然出现主关键词或核心短语；若有 ### 小标题，至少 1 个与「${keyword}」相关。`
  }

  return `主关键词「${keyword}」：本节须围绕该主题撰写（勿跑题）。H2/Part 标题与 ### 小标题以**自然、可读**为先，可含核心词或语义变体，**勿为 SEO 强行塞入完整 Topic 字符串**；正文自然出现主题相关表述即可（忌堆砌）。`
}

export function getPrimaryKeywordPolishHint(topic: string): string {
  const keyword = topic.trim()
  if (!keyword) return ''

  return `- 润色时保留主题「${keyword}」的搜索意图：H1、Part H2 与正文须语义相关，**勿**为凑关键词把各级标题改成重复、生硬的 Topic 原文；避免关键词堆砌`
}

export function getWritingPromptBlocks(userContextBlocks: string, topic: string): string {
  return [userContextBlocks, getPrimaryKeywordPromptBlock(topic)].filter(Boolean).join('\n\n')
}
