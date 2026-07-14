/** Shared rules for polish / length steps — do not rewrite section headings. */
export const PRESERVE_MARKDOWN_HEADINGS_RULE = `
【标题与章节保留 — 硬性】
- 保留文章中所有 Markdown 标题（# / ## / ###）的**现有文字、编号与顺序**，逐字不变。
- 仅润色或微调标题**下方正文**的句式、过渡与语气。
- 禁止：按 GEO/Skill 模板重命名 H2、合并/拆分章节、重排 Part 顺序、用示例骨架替换真实标题。
`.trim()

export const POLISH_EDIT_SCOPE_RULE = `
【润色范围】
- 这是**就地编辑**，不是重写新文。事实、数据、步骤顺序、对比表维度须与草稿一致。
- 删除 AI 套话与空洞总结；增强自然语气与具体判断；不要替换整节内容。
`.trim()

export const LENGTH_EDIT_SCOPE_RULE = `
【词数校准范围】
- 仅在**现有章节内**增删句子以满足词数区间；禁止重命名标题或重排章节。
- 增字：补充与主题相关的实质信息；减字：删重复与空话，保留关键事实与步骤。
`.trim()

export const MULTI_METHOD_STRUCTURE_PRESERVE_RULE = `
【multi-method 结构保留】
- 若某 ## Part 下已有多个 \`###\` 方法小节，润色/校准时须**逐节保留**各 \`###\` 标题与分节布局。
- 禁止：把多种方法合并成一段、删除方法小节、将 multi-method Part 改成产品教程模板（### Why / ### Step-by-Step）。
`.trim()
