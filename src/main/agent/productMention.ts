import { buildMethodDraftHints, sectionOutlineIsMultiMethod } from './outlineSkeleton'
import { isFaqSection } from './articleLength'

export interface ProductMentionMode {
  review?: boolean
  topList?: boolean
  geo?: boolean
}

export type DraftSectionProductKind =
  | 'quick-answer'
  | 'intro'
  | 'conclusion'
  | 'faq'
  | 'product-part'
  | 'generic-part'

export function isQuickAnswerSection(title: string): boolean {
  return /quick answer|key takeaways/i.test(title.trim())
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Outline-driven: only the dedicated product Part gets heavy promotion hints. */
export function isDesignatedProductPartSection(
  title: string,
  body: string,
  productName: string
): boolean {
  const context = `${title}\n${body}`
  const namePattern = new RegExp(escapeRegExp(productName), 'i')

  if (namePattern.test(title) && /how\s+to|with\b|using\b|workflow|guide|tutorial|实战|教程|步骤|使用/i.test(title)) {
    return true
  }

  if (/how\s+to\b/i.test(title) && namePattern.test(title)) {
    return true
  }

  const hasProductStepStub =
    new RegExp(
      `###\\s*(?:Why\\s+)?${escapeRegExp(productName)}[\\s\\S]*?###\\s*Step[- ]by[- ]Step`,
      'i'
    ).test(context) ||
    (namePattern.test(context) && /###\s*step[- ]by[- ]step\s+tutorial/i.test(context))

  if (hasProductStepStub) {
    return true
  }

  if (namePattern.test(title) && /###\s*(?:Why|Step[- ]by[- ]Step|推荐|tutorial)/i.test(body)) {
    return true
  }

  return false
}

export function classifyDraftSectionProductKind(
  title: string,
  body: string,
  productName?: string,
  options?: { geo?: boolean }
): DraftSectionProductKind {
  const normalizedTitle = title.trim()

  if (isQuickAnswerSection(normalizedTitle)) return 'quick-answer'
  if (/^introduction$/i.test(normalizedTitle)) return 'intro'
  if (/^conclusion$/i.test(normalizedTitle)) return 'conclusion'
  if (isFaqSection(normalizedTitle)) return 'faq'

  if (productName && options?.geo && isDesignatedProductPartSection(title, body, productName)) {
    return 'product-part'
  }

  return 'generic-part'
}

export function getUserContextPromptBlocksForSection(
  productName: string | undefined,
  mentionLock: string,
  sectionKind: DraftSectionProductKind
): string {
  if (!productName) return mentionLock

  switch (sectionKind) {
    case 'product-part':
      return buildProductMentionLock(productName)
    case 'quick-answer':
      return [
        `【本节产品提及 — ${productName}】`,
        `Quick Answer 可自然点名「${productName}」作为首推（1–2 条 bullet），勿让每条都成为广告。`
      ].join('\n')
    case 'intro':
      return [
        `【本节产品提及 — ${productName}】`,
        'Introduction：共情痛点、概述结构，**禁止**硬推销或产品功能罗列。'
      ].join('\n')
    case 'conclusion':
      return [
        `【本节产品提及 — ${productName}】`,
        `Conclusion：可用 1 句自然回扣「${productName}」；勿展开推销。`
      ].join('\n')
    case 'faq':
      return [
        `【本节产品提及 — ${productName}】`,
        `FAQ：至多 1 个答案可轻量提及「${productName}」；不要在每个答案重复产品名。`
      ].join('\n')
    case 'generic-part':
    default:
      return getGenericPartMentionLock(productName)
  }
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

export function getDraftGenericPartHint(productName?: string, outlineBody?: string): string {
  const isMultiMethod = sectionOutlineIsMultiMethod(outlineBody ?? '')
  const outlineNote = outlineBody?.trim()
    ? '**严格按「本节要点」大纲 bullets 展开**，不得擅自改成产品教程或推广章节。'
    : '严格按大纲撰写通用/调研内容。'

  if (isMultiMethod) {
    const productBan = productName
      ? `**禁止**套用产品 Part 模板（### Why … / ### Step-by-Step Tutorial）或在各方法小节中推销「${productName}」。`
      : '**禁止**套用产品 Part 的 ### Why / ### Step-by-Step 推广模板。'
    const methodHints = buildMethodDraftHints(outlineBody ?? '', productName)
    return [
      '本节为通用 Part（multi-method）：每个独立方法用 `###` 三级标题分节撰写。',
      outlineNote,
      productBan,
      methodHints || '各 `###` 下按大纲 mode 展开；禁止把多种方法挤进同一段。'
    ]
      .filter(Boolean)
      .join('\n')
  }

  const productBan = productName
    ? `**禁止**将本节写成「${productName}」的产品介绍、功能罗列或产品分步教程（### Why / ### Step-by-Step）。`
    : '**禁止**写成产品推广、功能罗列或产品分步教程。'

  return [
    '本节为通用/调研章节：优先行业洞察、技术背景、选型标准与读者价值。',
    outlineNote,
    productBan,
    productName ? '除非大纲某一 bullet 明确要求一句客观举例，否则正文**不要出现**产品全名。' : '',
    productName ? '对比工具时用「主流转换器」「部分第三方工具」等泛指，勿突出我方产品。' : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/** @deprecated use getDraftGenericPartHint */
export function getDraftGenericProductHint(productName: string): string {
  return getDraftGenericPartHint(productName)
}

export function getSectionDraftLayoutHint(options: {
  sectionTitle: string
  sectionBody: string
  productName?: string
  geo?: boolean
}): string {
  const { sectionTitle, sectionBody, productName, geo } = options
  const kind = classifyDraftSectionProductKind(sectionTitle, sectionBody, productName, { geo })

  if (isQuickAnswerSection(sectionTitle)) {
    return getDraftQuickAnswerHint(productName)
  }
  if (kind === 'product-part' && productName) {
    return getDraftProductPartHint(productName)
  }
  if (kind === 'generic-part') {
    return getDraftGenericPartHint(productName, sectionBody)
  }
  return ''
}

export function getGenericPartMentionLock(productName: string): string {
  return [
    `【本节产品提及 — ${productName}】`,
    '本节为**通用/调研章节**：以行业知识与大纲要点为主。',
    `**禁止**产品推销、教程步骤或功能堆砌；默认**不要**出现「${productName}」全名。`
  ].join('\n')
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
