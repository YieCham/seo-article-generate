import { parseTopListCount, shouldApplyTopListStructure } from './topListStructure'
import { shouldApplyReviewStructure } from './reviewStructure'
import type { ArticleLengthBounds } from './articleLength'

import { parseOutlineSections } from './llmClient'

export function buildOutlineSectionLayoutRules(): string {
  return [
    '【Section Layout — 生成每个 ## Part 前必须先判断】',
    '对每个正文 Part（非 Quick Answer / Introduction / FAQ / Conclusion），在输出前自问：',
    '- **multi-method（多方法并列）**：读者能否只读其中一小节就完成一个**独立操作**？各要点能否**打乱顺序**仍成立？规划/简报是否列出 ≥2 种不同 tactic？',
    '  → **必须用 `###` 展开**：每个独立方法一个 `###` 标题；其下首条 `- mode: procedural|explanatory|checklist|caution`，再 **1–2 条** stub bullet（不写段落）。',
    '  → 常见信号：标题含 strategies / methods / ways / tips / approaches / fixes / solutions / 方法 / 策略 / 技巧；或并列多种设置/功能/操作。',
    '- **narrative（单主题论述）**：解释原理、背景、因果、单一论点；要点必须**顺序阅读**才通顺。',
    '  → 只用 `##` + **3–4 条** bullet，**不要** `###`。',
    '  → 常见信号：Understanding / Why / How … Works / Background / What Is / 原理 / 背景。',
    '- **product-tutorial**：产品推荐 + 操作教程（仅一个产品 Part）。',
    '  → `### Why [Product]…` + `### Step-by-Step Tutorial`（步骤用 bullet stub，≥4 条）。',
    '',
    '**multi-method 示例（正确）：**',
    '## Part 2. Steps to Fix Bad Spotify Recommendations',
    '### Use "Don\'t Play This Artist"',
    '- mode: procedural',
    '- Skip or hide unwanted tracks; apply to Discover Weekly',
    '### Why Short Skips Hurt Your Feed',
    '- mode: explanatory',
    '- Sub-30-second skips send strong negative signals',
    '### Turn On Private Session for Guest Listening',
    '- mode: checklist',
    '- Enable before ambient playback; note 6-hour expiry',
    '',
    '**multi-method 反例（错误 — 禁止）：**',
    '## Part 2. Proven Strategies…',
    '- Exclude from taste profile…',
    '- Private session…',
    '- Audit likes…',
    '（多种方法挤在同一 ## 下的 bullet 列表 — 后续撰写会合并成一段，禁止）'
  ].join('\n')
}

export function buildOutlineSkeletonRules(wordBounds: ArticleLengthBounds): string {
  return [
    '【大纲输出格式 — 必须遵守】',
    '- 这是**结构骨架**，不是正文；后续 Pipeline 会按 ## 章节逐节撰写全文。',
    '- **第一行必须是 SEO 文章标题**：单独一行 `# …`（含主关键词核心词，但不得与 Topic 逐字相同）；其后才是 `##` 章节。',
    '- 只允许：## / ### 标题 + bullet 要点（每条 ≤20 英文词或 ≤35 中文字）。',
    '- **multi-method 的 Part**：每个 `###` 下首行 **必须** `- mode: procedural|explanatory|checklist|caution`，其后 **1–2 条** bullet stub；**narrative 的 Part**：`##` 下 **3–4 条** bullet。',
    '- **禁止**：完整段落、Pros/Cons 正文、分步教程细节、FAQ 答案、对比表单元格、引言/结论正文。',
    '- FAQ：## 标题应与主题相关（可含 FAQ/FAQs/常见问题 等，勿只写孤立的 FAQ）；其下只写 **3–5** 个问题句（以 ? 结尾），不写答案。',
    '- Quick Answer / Introduction / Conclusion：各 **2–3 条** bullet 即可，不要写段落。',
    `- 全文终稿目标 ${wordBounds.min}–${wordBounds.max} 词；**本大纲本身**控制在约 600 英文词以内。`,
    '- 不要复述 Skills 全文，不要输出 <thinking> 标签。',
    '',
    buildOutlineSectionLayoutRules(),
    '',
    buildOutlineMethodModeRules(),
    '',
    '若用户消息提供「规划 Part layout」列表，**以规划标签为准**（见下方规则）。',
    buildOutlineFollowPlanLayoutRules()
  ].join('\n')
}

export type SectionLayout = 'multi-method' | 'narrative' | 'product-tutorial' | 'comparison'

export type MethodInstructionMode = 'procedural' | 'explanatory' | 'checklist' | 'caution'

const SECTION_LAYOUT_PATTERN =
  /layout:\s*(multi-method|narrative|product-tutorial|comparison)/i

const METHOD_MODE_LINE_PATTERN =
  /^[-*+]?\s*mode:\s*(procedural|explanatory|checklist|caution)\b/i

export interface OutlineMethodBlock {
  heading: string
  mode: MethodInstructionMode
  stubs: string[]
  modeExplicit: boolean
}

export function buildOutlineMethodModeRules(): string {
  return [
    '【Method mode — multi-method 的每个 ### 必填】',
    '在 **multi-method** Part 的每个 `###` 标题下，**首条 bullet 必须是** `- mode: <type>`。',
    '取值仅允许：',
    '- **procedural** — 读者要跟着完成一次操作（设置、清理、开关、导出）；stub 可含菜单路径；成稿时 **先 1 段方法介绍，再编号步骤**',
    '- **explanatory** — 讲原理/机制/背景（Why、How … Works）；**不要**写点击步骤',
    '- **checklist** — 2–3 个轻量动作或注意点；成稿时 **先 1 短段讲解，再 bullet 清单**（不编号）',
    '- **caution** — 合规边界、风险、不适用场景',
    '',
    '判断问句：读者读完这一小节能否立刻动手做一件事？能 → **procedural**；只是理解概念 → **explanatory**。',
    '**禁止**在通用 multi-method 方法小节使用 `mode: product-tutorial` 或 Why/Step-by-Step 模板。'
  ].join('\n')
}

export function buildPlanSectionLayoutRules(): string {
  return [
    '【Part layout 标注 — 规划第 4 节必填】',
    '每个正文 Part（Quick Answer / Introduction / FAQ / Conclusion 除外）除名称与目的外，**必须**标注 `layout:`。',
    '取值**仅允许**以下四种：',
    '- **multi-method** — ≥2 种可独立执行、可打乱顺序的 tactic / 设置 / 操作',
    '- **narrative** — 原理、背景、因果或单一论点；须顺序阅读',
    '- **product-tutorial** — 唯一的「产品推荐 + 分步教程」Part（全文仅一个）',
    '- **comparison** — 工具/方案维度对比（表格或并列维度 bullet）',
    '',
    '**固定输出格式**（逐行一条，便于大纲步骤读取）：',
    '- Part 1 · [标题意图] · layout: narrative · [1 句目的]',
    '- Part 2 · [标题意图] · layout: multi-method · [1 句目的，注明含几种方法]',
    '- Part 3 · [标题意图] · layout: product-tutorial · [1 句目的]',
    '',
    '判断问句：读者能否只读其中一种方法就完成一个独立操作？能且 ≥2 种 → **multi-method**。',
    '反例：把 4 种 Spotify 清理技巧标成 narrative 或挤在一条 bullet 里 — 禁止。'
  ].join('\n')
}

export function buildOutlineFollowPlanLayoutRules(): string {
  return [
    '【严格执行规划中的 layout 标签 — 优先级高于自行判断】',
    '若上方「规划 Part layout」已标注某 Part 的 layout，**必须**按标签展开，不得改写类型：',
    '- `layout: multi-method` → 该 ## 下**必须**为每个方法写一个 `###`；其下首条 `- mode: …`，再 1–2 条 stub bullet',
    '- `layout: narrative` → 该 ## 下**仅** 3–4 bullets，**禁止** `###`',
    '- `layout: product-tutorial` → `### Why [Product]…` + `### Step-by-Step Tutorial`（≥4 step bullets）',
    '- `layout: comparison` → bullet 列出对比维度名，或 `| 维度 | A | B |` 表头 stub',
    'Part 标题可与规划措辞微调，但 **layout 类型不可更改**。'
  ].join('\n')
}

/** Extract plan lines that declare a Part layout (for outline step). */
export function extractPlanLayoutDirectives(plan: string): string {
  const inner = plan.replace(/<\/?thinking>/gi, '')
  const lines = inner
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && SECTION_LAYOUT_PATTERN.test(line))

  if (lines.length === 0) return ''

  return lines.join('\n')
}

export function buildPlanSkeletonRules(includeSectionLayout = true): string {
  return [
    '【规划输出格式 — 必须遵守】',
    '- 在 <thinking> 与 </thinking> 内输出**战略层规划**，不要写正文、不要写 ## 章节大纲。',
    '- 用 bullet 列表；每点简洁；总篇幅约 **400–600 英文词**。',
    '- FAQ 只列 **3–5** 个问题句，不写答案。',
    includeSectionLayout
      ? '- 第 4 节各 Part **必须**带 `layout:` 标签（见下方 Part layout 规则），不要展开成稿。'
      : '- 章节只写 Part 名称 + 1 句目的，不要展开成稿。',
    includeSectionLayout ? '' : '',
    includeSectionLayout ? buildPlanSectionLayoutRules() : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function compactInternalPlan(plan: string, maxChars = 2400): string {
  const inner = plan.replace(/<\/?thinking>/gi, '').trim()
  if (inner.length <= maxChars) return inner
  return `${inner.slice(0, maxChars)}\n…（规划已截断，细节见写作简报）`
}

export function estimateOutlineSectionCount(
  topic: string,
  skillsText: string,
  enabledSkillIds?: string[]
): number {
  if (shouldApplyTopListStructure(skillsText, enabledSkillIds)) {
    return Math.min(12, parseTopListCount(topic) + 5)
  }
  if (shouldApplyReviewStructure(skillsText, enabledSkillIds)) return 10
  return 6
}

/** Strip prose leaked into outline; keep headers, short bullets, ### stubs. */
export function enforceOutlineSkeleton(outline: string): string {
  const lines = outline.split('\n')
  const out: string[] = []
  let bulletsUnderSection = 0
  let underH3 = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      out.push('')
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      bulletsUnderSection = 0
      underH3 = /^###\s/.test(trimmed) && !/^####/.test(trimmed)
      out.push(line)
      continue
    }

    if (/^\[Image:/i.test(trimmed)) {
      out.push(line)
      continue
    }

    if (underH3 && METHOD_MODE_LINE_PATTERN.test(trimmed)) {
      out.push(trimmed.startsWith('-') ? trimmed : `- ${trimmed.replace(/^[-*+]?\s*/, '')}`)
      continue
    }

    const bulletCap = underH3 ? 3 : 5

    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const capped = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed
      if (bulletsUnderSection < bulletCap) {
        out.push(capped)
        bulletsUnderSection += 1
      }
      continue
    }

    if (trimmed.length > 90) {
      if (bulletsUnderSection < bulletCap) {
        out.push(`- ${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}`)
        bulletsUnderSection += 1
      }
      continue
    }

    if (bulletsUnderSection < bulletCap) {
      out.push(trimmed.startsWith('-') ? trimmed : `- ${trimmed}`)
      bulletsUnderSection += 1
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** True when outline body already defines ### method stubs under a ## Part. */
export function sectionOutlineHasMethodStubs(body: string): boolean {
  return /^###\s/m.test(body.trim())
}

/** True for generic multi-method Parts — excludes product-tutorial and Top-N ### N. stubs. */
export function sectionOutlineIsMultiMethod(body: string): boolean {
  const trimmed = body.trim()
  if (!sectionOutlineHasMethodStubs(trimmed)) return false
  if (/^###\s*(why\b|step[\s-]?by[\s-]?step)/im.test(trimmed)) return false
  if (/^###\s*\d+\./im.test(trimmed)) return false
  return true
}

export const MULTI_METHOD_DRAFT_HINT =
  '本节为 multi-method 结构：大纲中每个 `###` 必须保留为三级标题并分别展开；禁止把多个方法合并成一段。procedural / checklist 须先有引导段，再写步骤或清单。'

export const MULTI_METHOD_POLISH_PRESERVATION_HINT =
  '- 若某 ## Part 为 multi-method（含多个 `###` 方法小节），须逐节保留各 `###` 标题与分节；禁止合并为一段、删除方法小节，或改成产品教程模板（### Why / ### Step-by-Step）。'

export function getDraftMultiMethodHint(outlineBody: string): string {
  return sectionOutlineIsMultiMethod(outlineBody) ? MULTI_METHOD_DRAFT_HINT : ''
}

export function inferMethodMode(heading: string, stubs: string[]): MethodInstructionMode {
  const text = `${heading} ${stubs.join(' ')}`.toLowerCase()

  if (/caution|risk|legal|warning|compliance|disclaimer|注意|风险|合规|禁止|avoid\b|do not\b|never\b/.test(text)) {
    return 'caution'
  }
  if (
    /why\b|how .+ works|understanding|what is|mechanism|background|原理|背景|机制|算法|works\b|explained/.test(
      text
    )
  ) {
    return 'explanatory'
  }
  if (
    /settings?\s*→|tap |click |open |navigate|disable|enable|clear|delete|reset|export|download|remove|turn off|turn on|unlike|unfollow|步骤|设置|点击|清理|关闭|开启/.test(
      text
    )
  ) {
    return 'procedural'
  }
  if (/tip|check|ensure|remember|note|verify|建议|检查|确保/.test(text)) {
    return 'checklist'
  }
  return 'explanatory'
}

export function parseOutlineMethodBlocks(sectionBody: string): OutlineMethodBlock[] {
  const lines = sectionBody.split('\n')
  const blocks: OutlineMethodBlock[] = []
  let current: OutlineMethodBlock | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^###\s/.test(trimmed) && !/^####/.test(trimmed)) {
      if (current) blocks.push(current)
      current = {
        heading: trimmed.replace(/^###\s+/, '').trim(),
        mode: 'explanatory',
        stubs: [],
        modeExplicit: false
      }
      continue
    }

    if (!current) continue

    const modeMatch = trimmed.match(METHOD_MODE_LINE_PATTERN)
    if (modeMatch) {
      current.mode = modeMatch[1].toLowerCase() as MethodInstructionMode
      current.modeExplicit = true
      continue
    }

    if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      current.stubs.push(trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    }
  }

  if (current) blocks.push(current)

  return blocks.map((block) =>
    block.modeExplicit
      ? block
      : { ...block, mode: inferMethodMode(block.heading, block.stubs) }
  )
}

export function buildSingleMethodDraftHint(
  heading: string,
  mode: MethodInstructionMode,
  productName?: string
): string {
  const productNote = productName ? `禁止出现「${productName}」全名或产品推销。` : ''

  switch (mode) {
    case 'procedural':
      return `### ${heading}（mode: procedural）：**先写 1 段**（约 2–4 句）介绍该方法适用场景与作用，**禁止**在 \`###\` 标题后直接接编号步骤；再写 **3–6 步**编号列表；每步一句动作，必要时子 bullet；UI/菜单名用 **bold**；${productNote}`
    case 'explanatory':
      return `### ${heading}（mode: explanatory）：写 **1–2 段**解释；**禁止**编号操作步骤。${productNote}`
    case 'checklist':
      return `### ${heading}（mode: checklist）：**先写 1 短段**说明为何要用这份清单、能覆盖什么问题；再写 **3–5 条** bullet（不编号）；每条一个轻量可执行点。**禁止**标题后直接列 bullet。${productNote}`
    case 'caution':
      return `### ${heading}（mode: caution）：1 短段说明边界/风险 + **1–3 条**注意项；不写操作教程。${productNote}`
    default:
      return `### ${heading}：按大纲要点展开。`
  }
}

export function buildMethodDraftHints(sectionBody: string, productName?: string): string {
  if (!sectionOutlineIsMultiMethod(sectionBody)) return ''

  const blocks = parseOutlineMethodBlocks(sectionBody)
  if (blocks.length === 0) return MULTI_METHOD_DRAFT_HINT

  return [
    '【各 ### 方法小节撰写模式 — 严格按大纲 mode 执行】',
    MULTI_METHOD_DRAFT_HINT,
    ...blocks.map((block) => buildSingleMethodDraftHint(block.heading, block.mode, productName))
  ].join('\n')
}

export function enrichSectionMethodModes(sectionBody: string): string {
  if (!sectionOutlineIsMultiMethod(sectionBody)) return sectionBody

  const lines = sectionBody.split('\n')
  const out: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (/^###\s/.test(trimmed) && !/^####/.test(trimmed)) {
      const heading = trimmed.replace(/^###\s+/, '').trim()
      out.push(line)
      index += 1

      const childLines: string[] = []
      while (index < lines.length) {
        const next = lines[index].trim()
        if (!next) {
          childLines.push(lines[index])
          index += 1
          continue
        }
        if (/^###\s/.test(next) || /^##\s/.test(next)) break
        childLines.push(lines[index])
        index += 1
      }

      const hasMode = childLines.some((item) => METHOD_MODE_LINE_PATTERN.test(item.trim()))
      if (!hasMode) {
        const stubTexts = childLines
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && !METHOD_MODE_LINE_PATTERN.test(item))
          .map((item) => item.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, ''))
        out.push(`- mode: ${inferMethodMode(heading, stubTexts)}`)
      }
      out.push(...childLines)
      continue
    }

    out.push(line)
    index += 1
  }

  return out.join('\n').trim()
}

export function enrichOutlineMethodModes(outline: string): string {
  const firstH2 = outline.split('\n').findIndex((line) => /^##\s/.test(line.trim()))
  if (firstH2 < 0) return outline

  const prefix = outline
    .split('\n')
    .slice(0, firstH2)
    .join('\n')
    .trim()
  const sections = parseOutlineSections(outline)

  const rebuilt = sections
    .map((section) => {
      const body = enrichSectionMethodModes(section.body)
      return body.trim() ? `## ${section.title}\n${body.trim()}` : `## ${section.title}`
    })
    .join('\n\n')

  return prefix ? `${prefix}\n\n${rebuilt}` : rebuilt
}
