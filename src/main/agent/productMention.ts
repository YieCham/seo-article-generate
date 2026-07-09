export interface ProductMentionMode {
  review?: boolean
  topList?: boolean
  geo?: boolean
}

export function isQuickAnswerSection(title: string): boolean {
  return /quick answer|key takeaways/i.test(title.trim())
}

export function buildProductMentionLock(productName: string): string {
  return [
    `【用户推广产品 — ${productName}】`,
    '提及须克制、精准，避免过度推广感：',
    `1. 全名「${productName}」**主要**出现在：Quick Answer（可点名首推）、产品专属 Part、对比表、Top 榜单中该产品的 ### 条目、Conclusion 的 1 句自然回扣。`,
    `2. ## Quick Answer：可自然点名「${productName}」作为首推/解决方案（1–2 条 bullet 即可），勿让每条 bullet 都成为产品广告。`,
    '3. Introduction：共情痛点、概述结构，首段避免硬推销产品。',
    `4. 通用/调研 Part：以行业知识与读者价值为主；**若内容与产品自然联动**（举例、场景、对比维度），可合理轻量提及「${productName}」（每 Part 至多 1–2 处），勿让产品名成为段落主线或硬广推销。`,
    '5. FAQ：至多 1 个问题可自然涉及该产品；不要在每个答案里重复产品名。',
    `6. 产品 Part / 教程：在章节开篇、### 小节标题与关键步骤处使用全名即可（每节约 3–5 次），**禁止**同一段落连续重复或每句都带产品名。`,
    `7. 该用全名时勿换成 "the tool"、"this converter" 等泛称；无自然关联处则不要强行插入产品名。`,
    '8. 润色/改写：保留应有位置的提及，**不要**为推广而追加重复产品名或额外推销句。'
  ].join('\n')
}

export function getProductMentionSupplement(productName: string | undefined, mode: ProductMentionMode): string {
  if (!productName) return ''

  if (mode.review) {
    return [
      `【Review 产品提及】`,
      `我方产品「${productName}」全名集中在**对比表 Part** 与 **Conclusion**；被测评产品的前几个 Part 不要提前大段写我方产品，必要时整篇至多轻量提及 1 次。`
    ].join('\n')
  }

  if (mode.topList) {
    return [
      `【Top List 产品提及】`,
      `「${productName}」只在其榜单 ### 条目（或 Also Worth Considering Part）内充分描述；其他产品条目与选型标准 Part 不要夹带我方产品名。`
    ].join('\n')
  }

  if (mode.geo) {
    return [
      `【GEO How-to 产品提及】`,
      `Quick Answer 可轻量点名「${productName}」；通用 Part 在内容自然联动时可合理轻量提及；主打推广仍放在产品 Part，避免逐步骤重复堆砌全名。`
    ].join('\n')
  }

  return ''
}

export function getExtractProductHint(productName: string): string {
  return `- 萃取时可记录「${productName}」适合植入的 Quick Answer 要点、产品 Part 切入点，以及通用章节中**自然联动**时的举例位置；勿规划全文反复提及。`
}

export function getDraftQuickAnswerHint(productName?: string): string {
  if (!productName) {
    return '本节为 Quick Answer：3–4 条 bullet，直接回答核心问题，可点名推荐方案。'
  }
  return `本节为 Quick Answer：3–4 条 bullet，可直接点名「${productName}」作为首推/解决方案（1–2 条即可），勿让每条 bullet 都成为产品广告。`
}

export function getDraftProductPartHint(productName: string): string {
  return `本节为产品 Part：先 1–2 段过渡承接前文，再 ### 推荐 + ### Step-by-Step Tutorial（≥4 步）。在章节开头、步骤标题与关键操作处使用「${productName}」全名，避免同段反复堆砌；插入 [Image: …]。`
}

export function getDraftGenericPartHint(productName: string): string {
  return `本节为通用/调研内容：优先行业洞察与读者价值。若与「${productName}」自然相关（举例、场景、对比），可合理轻量提及（每 Part 至多 1–2 处），勿写成产品推销段。`
}

/** @deprecated use getDraftGenericPartHint */
export function getDraftGenericProductHint(productName: string): string {
  return getDraftGenericPartHint(productName)
}

export function getPolishProductHint(productName: string, mode: ProductMentionMode): string {
  if (mode.review) {
    return `- 保留对比表与 Conclusion 中对「${productName}」的必要提及；润色时**不要**在被测评产品章节追加我方产品名`
  }
  if (mode.topList) {
    return `- 保留 Top 榜单中「${productName}」的条目与排位；润色时**不要**在其他章节追加该产品名`
  }
  return `- 保留 Quick Answer、产品 Part、通用 Part 中合理提及与 Conclusion 中对「${productName}」的必要表述；润色时**不要**在无关章节追加产品名或改成泛称`
}
