import {
  IOS_GEO_SKILL_ID,
  REVIEW_SKILL_ID,
  SEO_GEO_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_TOP_SKILL_ID,
  type EnabledSkillBundle
} from './skillManager'
import {
  buildSkillSummaryForDraft,
  pickSkillFragmentForSection,
  truncateSkillText
} from './skillSummary'
import type { DraftSectionProductKind } from './productMention'
import { sectionOutlineIsMultiMethod } from './outlineSkeleton'

export type PipelineSkillStep =
  | 'extract'
  | 'plan'
  | 'outline'
  | 'draft'
  | 'polish'
  | 'length'
  | 'optimize'

export interface SkillPipelineContext {
  bundles: EnabledSkillBundle[]
  structureBlock?: string
  sectionTitle?: string
  sectionProductKind?: DraftSectionProductKind
  sectionOutlineBody?: string
}

const STREAMING_SKILL_IDS = new Set([
  SEO_GEO_SKILL_ID,
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  STREAMING_TOP_SKILL_ID
])

function bundleById(bundles: EnabledSkillBundle[], id: string): EnabledSkillBundle | undefined {
  return bundles.find((item) => item.id === id)
}

function bundleContent(bundles: EnabledSkillBundle[], id: string): string {
  return bundleById(bundles, id)?.content ?? ''
}

function formatBundle(bundle: EnabledSkillBundle): string {
  return `### Skill: ${bundle.name}\n${bundle.description ? `> ${bundle.description}\n\n` : ''}${bundle.content}`
}

function formatBundles(bundles: EnabledSkillBundle[]): string {
  return bundles.map(formatBundle).join('\n\n---\n\n')
}

function isStreamingPack(bundles: EnabledSkillBundle[]): boolean {
  return bundles.some((item) => STREAMING_SKILL_IDS.has(item.id))
}

function streamingDomainText(bundles: EnabledSkillBundle[]): string {
  return bundleContent(bundles, STREAMING_DOMAIN_SKILL_ID) || bundleContent(bundles, SEO_GEO_SKILL_ID)
}

function streamingDraftBase(bundles: EnabledSkillBundle[]): string {
  const domain = streamingDomainText(bundles)
  const compliance = bundleContent(bundles, STREAMING_COMPLIANCE_SKILL_ID)
  const top = bundleContent(bundles, STREAMING_TOP_SKILL_ID)
  return [domain, compliance, top].filter(Boolean).join('\n\n---\n\n')
}

/** Polish/length: compliance & style only — no GEO structure skeleton (avoids H2 rewrites). */
function polishSkillText(bundles: EnabledSkillBundle[]): string {
  const compliance = bundleContent(bundles, STREAMING_COMPLIANCE_SKILL_ID)
  if (compliance) {
    return truncateSkillText(compliance, 500, { preferSection: /合规|敏感词|禁止|免责/i })
  }
  if (bundles.length === 1) {
    return truncateSkillText(formatBundles(bundles), 500)
  }
  return truncateSkillText(formatBundles(bundles), 500, { preferSection: /合规|禁止|敏感词/i })
}

function isReviewPack(bundles: EnabledSkillBundle[]): boolean {
  return bundles.some((item) => item.id === REVIEW_SKILL_ID) && !isStreamingPack(bundles)
}

function isTopListMode(bundles: EnabledSkillBundle[]): boolean {
  return bundles.some((item) => item.id === STREAMING_TOP_SKILL_ID)
}

function reviewSkillText(bundles: EnabledSkillBundle[]): string {
  const bundle = bundleById(bundles, REVIEW_SKILL_ID)
  return bundle ? formatBundle(bundle) : ''
}

function draftStructureBlock(
  structureBlock: string,
  sectionProductKind?: DraftSectionProductKind,
  sectionTitle?: string,
  sectionOutlineBody?: string
): string {
  const title = sectionTitle?.trim() ?? ''
  if (title && /how we picked|选型|selection criteria|how we (?:chose|evaluated)/i.test(title)) {
    return '本节为 Top 榜单选型标准：写通用评估维度，禁止产品硬推销，禁止写榜单 ### 条目正文。'
  }
  if (title && /top\s*\d+|best\s+\d+|downloaders?|converters?|榜单/i.test(title)) {
    return '本节为 Top N 榜单：按大纲为每个 ### 条目写 Pros/Cons/Best for；用户产品符合 Topic 时为 ### 1。'
  }
  if (title && /also worth considering|补充推荐/i.test(title)) {
    return '本节为榜单外补充推荐：说明适用场景与未进主榜原因，勿硬塞进 Top 列表。'
  }
  if (sectionProductKind === 'generic-part') {
    if (sectionOutlineBody && sectionOutlineIsMultiMethod(sectionOutlineBody)) {
      return [
        '【本节结构约束】',
        '本节为通用 Part（multi-method）：大纲中每个 `###` 对应一种独立方法，须保留为三级标题。',
        '撰写时**严格按各 ### 下的 mode**（procedural / explanatory / checklist / caution）展开，不得一律写成段落或一律写成步骤。',
        'procedural：H3 后**先 1 段方法介绍**，再编号步骤；checklist：H3 后**先短段讲解**，再 bullet 清单。',
        '禁止写成产品推广或套用 ### Why / ### Step-by-Step 产品教程模板；禁止合并多种方法为一段。'
      ].join('\n')
    }
    return [
      '【本节结构约束】',
      '本节为通用/调研 Part：严格按大纲 bullets 展开行业内容。',
      '禁止写成产品推广、功能罗列或**产品**分步教程（### Why / ### Step-by-Step）；narrative Part 勿滥用 `###`。'
    ].join('\n')
  }
  if (sectionProductKind === 'product-part') {
    return structureBlock
  }
  if (sectionProductKind === 'intro' || sectionProductKind === 'conclusion') {
    return '本节为开篇/结尾模块：控制篇幅，禁止产品硬推销。'
  }
  if (sectionProductKind === 'faq') {
    return '本节为 FAQ：3–5 个问答，整节总计 ≤250 英文词；答案简洁，禁止长段展开。H2 标题可与主题相关（含 FAQ/FAQs 等即可），不必写成孤立的 FAQ。'
  }
  return structureBlock
}

export function getEnabledSkillIdsFromBundles(bundles: EnabledSkillBundle[]): string[] {
  return bundles.map((item) => item.id)
}

export function buildFullSkillsText(bundles: EnabledSkillBundle[]): string {
  if (bundles.length === 0) return '（未启用任何 Skill，请使用通用写作规范。）'
  return formatBundles(bundles)
}

export function getSkillsTextForStep(step: PipelineSkillStep, ctx: SkillPipelineContext): string {
  const { bundles, structureBlock = '', sectionTitle, sectionProductKind, sectionOutlineBody } = ctx
  if (bundles.length === 0) return ''

  if (step === 'outline' || step === 'length') return ''

  if (step === 'polish') {
    return polishSkillText(bundles)
  }

  if (bundles.length === 1 && bundles[0].id === 'article-optimizer') {
    const optimizer = formatBundle(bundles[0])
    if (step === 'optimize' || step === 'draft') {
      return truncateSkillText(optimizer, 900)
    }
    return truncateSkillText(optimizer, 600)
  }

  if (isStreamingPack(bundles)) {
    const domain = streamingDomainText(bundles)
    const compliance = bundleContent(bundles, STREAMING_COMPLIANCE_SKILL_ID)
    const top = bundleContent(bundles, STREAMING_TOP_SKILL_ID)

    switch (step) {
      case 'extract': {
        const parts = [
          compliance ? truncateSkillText(compliance, 450, { preferSection: /合规|敏感词|禁止/i }) : '',
          domain ? truncateSkillText(domain, 650, { preferSection: /E-E-A-T|竞品|关键词/i }) : '',
          top ? truncateSkillText(top, 400) : ''
        ].filter(Boolean)
        return parts.join('\n\n')
      }
      case 'plan':
        return truncateSkillText(
          isTopListMode(bundles) && top
            ? [top, domain].filter(Boolean).join('\n\n')
            : [domain, top].filter(Boolean).join('\n\n'),
          1000,
          { preferSection: /规划|FAQ|关键词|榜单|条目/i }
        )
      case 'draft': {
        const base = pickSkillFragmentForSection(
          sectionTitle ?? '',
          isTopListMode(bundles) && top
            ? [top, domain, compliance].filter(Boolean).join('\n\n---\n\n')
            : streamingDraftBase(bundles)
        )
        return buildSkillSummaryForDraft(
          base,
          draftStructureBlock(structureBlock, sectionProductKind, sectionTitle, sectionOutlineBody),
          'draft'
        )
      }
      case 'optimize':
        return truncateSkillText(streamingDraftBase(bundles), 800)
      default:
        return ''
    }
  }

  if (isReviewPack(bundles)) {
    const review = reviewSkillText(bundles)
    switch (step) {
      case 'extract':
        return truncateSkillText(review, 500, { preferSection: /原则|角度|E-E-A-T/i })
      case 'plan':
        return truncateSkillText(review, 800, { preferSection: /规划|角度|禁止/i })
      case 'draft': {
        const base = pickSkillFragmentForSection(sectionTitle ?? '', review)
        return buildSkillSummaryForDraft(
          base,
          draftStructureBlock(structureBlock, sectionProductKind, sectionTitle, sectionOutlineBody),
          'draft'
        )
      }
      case 'optimize':
        return truncateSkillText(review, 700)
      default:
        return ''
    }
  }

  const full = formatBundles(bundles)
  switch (step) {
    case 'extract':
      return truncateSkillText(full, 1000)
    case 'plan':
      return truncateSkillText(full, 1200)
    case 'draft': {
      const base = pickSkillFragmentForSection(sectionTitle ?? '', full)
      return buildSkillSummaryForDraft(
        base,
        draftStructureBlock(structureBlock, sectionProductKind, sectionTitle, sectionOutlineBody),
        'draft'
      )
    }
    case 'optimize':
      return truncateSkillText(full, 900)
    default:
      return ''
  }
}

export function isReviewSkillEnabled(enabledSkillIds: string[]): boolean {
  return enabledSkillIds.includes(REVIEW_SKILL_ID)
}

export function isTopListSkillEnabled(enabledSkillIds: string[]): boolean {
  return enabledSkillIds.includes(STREAMING_TOP_SKILL_ID)
}

export function isGeoSeoSkillEnabled(enabledSkillIds: string[]): boolean {
  if (enabledSkillIds.includes(IOS_GEO_SKILL_ID)) return true
  if (enabledSkillIds.some((id) => STREAMING_SKILL_IDS.has(id))) return true
  return false
}

export function isStreamingGeoSkillEnabled(enabledSkillIds: string[]): boolean {
  return enabledSkillIds.some(
    (id) =>
      id === SEO_GEO_SKILL_ID ||
      id === STREAMING_DOMAIN_SKILL_ID ||
      id === STREAMING_COMPLIANCE_SKILL_ID ||
      id === STREAMING_TOP_SKILL_ID
  )
}

export function isIosGeoSkillEnabled(enabledSkillIds: string[]): boolean {
  return enabledSkillIds.includes(IOS_GEO_SKILL_ID)
}
