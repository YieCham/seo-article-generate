export const DEFAULT_LLM_MAX_TOKENS = 32768
export const MIN_LLM_MAX_TOKENS = 1024
export const MAX_LLM_MAX_TOKENS = 128000

/**
 * When false, every pipeline step uses global llmMaxTokens only.
 * Set to true to re-enable per-step caps (STEP_TOKEN_CAPS) and word-budget estimates.
 */
export const USE_STEP_TOKEN_CAPS = false

/** Per-step output caps; each request uses min(stepCap, global llmMaxTokens). */
export type PipelineTokenStep =
  | 'intentExpand'
  | 'eeatExtract'
  | 'writingBrief'
  | 'plan'
  | 'outline'
  | 'sectionDraft'
  | 'polish'
  | 'lengthAdjust'
  | 'seoMeta'
  | 'sectionEdit'
  | 'articleRevise'
  | 'optimizeAudit'
  | 'optimizeDraft'
  | 'optimizeSectionDraft'
  | 'optimizePolish'
  | 'optimizeLengthAdjust'

export const STEP_TOKEN_CAPS: Record<PipelineTokenStep, number> = {
  intentExpand: 6144,
  eeatExtract: 12288,
  writingBrief: 6144,
  plan: 8192,
  outline: 6144,
  sectionDraft: 12288,
  polish: 49152,
  lengthAdjust: 49152,
  seoMeta: 3000,
  sectionEdit: 12288,
  articleRevise: 49152,
  optimizeAudit: 16384,
  optimizeDraft: 24576,
  optimizeSectionDraft: 12288,
  optimizePolish: 24576,
  optimizeLengthAdjust: 16384
}

const SECTION_DRAFT_RULES = {
  /** Short sections: Quick Answer, Intro, Conclusion */
  light: { multiplier: 3.6, floor: 1230 },
  /** Standard Part / flex sections */
  default: { multiplier: 5.0, floor: 4096 },
  /** Step-by-step tutorials, product Part, workaround sections */
  heavy: { multiplier: 5.5, floor: 6144 }
} as const

export type SectionDraftTier = keyof typeof SECTION_DRAFT_RULES

/** @deprecated legacy multi-field token config */
interface LegacyLlmTokenLimits {
  light?: number
  analysis?: number
  planning?: number
  outline?: number
  sectionDraft?: number
  polish?: number
}

function clampMaxTokens(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LLM_MAX_TOKENS
  return Math.min(MAX_LLM_MAX_TOKENS, Math.max(MIN_LLM_MAX_TOKENS, Math.round(value)))
}

export function normalizeLlmMaxTokens(partial?: unknown): number {
  if (typeof partial === 'number') return clampMaxTokens(partial)

  if (partial && typeof partial === 'object') {
    const legacy = partial as LegacyLlmTokenLimits
    const values = [
      legacy.light,
      legacy.analysis,
      legacy.planning,
      legacy.outline,
      legacy.sectionDraft,
      legacy.polish
    ].filter((item): item is number => typeof item === 'number' && Number.isFinite(item))

    if (values.length > 0) return clampMaxTokens(Math.max(...values))
  }

  return DEFAULT_LLM_MAX_TOKENS
}

/** Normalized global max_tokens for a single LLM request. */
export function resolveLlmMaxTokens(globalMax: number): number {
  return clampMaxTokens(globalMax)
}

export function resolveStepMaxTokens(
  step: PipelineTokenStep,
  globalMax: number,
  wordBudget?: number
): number {
  const global = clampMaxTokens(globalMax)
  if (!USE_STEP_TOKEN_CAPS) return global
  const stepCap = STEP_TOKEN_CAPS[step]

  if (wordBudget != null && Number.isFinite(wordBudget)) {
    const wordBasedSteps: Partial<Record<PipelineTokenStep, { multiplier: number; floor: number }>> = {
      optimizeDraft: { multiplier: 3.5, floor: 4096 },
      optimizeSectionDraft: { multiplier: 3.5, floor: 2048 },
      optimizePolish: { multiplier: 3.2, floor: 4096 },
      optimizeLengthAdjust: { multiplier: 3.2, floor: 4096 },
      articleRevise: { multiplier: 4.0, floor: 8192 },
      polish: { multiplier: 4.0, floor: 8192 },
      lengthAdjust: { multiplier: 4.0, floor: 8192 }
    }
    const rule = wordBasedSteps[step]
    if (rule) {
      const estimated = Math.ceil(wordBudget * rule.multiplier)
      return Math.min(global, stepCap, Math.max(rule.floor, estimated))
    }
  }

  return Math.min(global, stepCap)
}

export function maxTokensForSectionDraft(
  words: number,
  globalMax: number,
  tier: SectionDraftTier = 'default'
): number {
  const global = clampMaxTokens(globalMax)
  if (!USE_STEP_TOKEN_CAPS) return global
  const stepCap = STEP_TOKEN_CAPS.sectionDraft
  const rule = SECTION_DRAFT_RULES[tier]
  const estimated = Math.ceil(words * rule.multiplier)
  return Math.min(global, stepCap, Math.max(rule.floor, estimated))
}

export function maxTokensForOptimizeSection(originalWords: number, globalMax: number): number {
  return resolveStepMaxTokens('optimizeSectionDraft', globalMax, Math.max(originalWords, 200))
}

export function maxTokensForOptimizeFullDraft(sourceWords: number, globalMax: number): number {
  return resolveStepMaxTokens('optimizeDraft', globalMax, Math.max(sourceWords, 800))
}

export function maxTokensForOptimizePolish(draftWords: number, globalMax: number): number {
  return resolveStepMaxTokens('optimizePolish', globalMax, Math.max(draftWords, 800))
}

export function maxTokensForOptimizeLengthAdjust(articleWords: number, globalMax: number): number {
  return resolveStepMaxTokens('optimizeLengthAdjust', globalMax, Math.max(articleWords, 600))
}

/** Full-article rewrite steps (polish / length / revise) need higher output headroom for Top-N listicles. */
export function maxTokensForFullArticleOutput(
  articleWords: number,
  globalMax: number,
  step: 'polish' | 'lengthAdjust' | 'articleRevise'
): number {
  const global = clampMaxTokens(globalMax)
  if (!USE_STEP_TOKEN_CAPS) return global
  const words = Math.max(articleWords, 600)
  const estimated = Math.ceil(words * 6.5) + 2048
  const stepCap = STEP_TOKEN_CAPS[step]
  return Math.min(global, stepCap, Math.max(12288, estimated))
}

export function maxTokensForPlanning(globalMax: number): number {
  if (!USE_STEP_TOKEN_CAPS) return clampMaxTokens(globalMax)
  return Math.min(clampMaxTokens(globalMax), STEP_TOKEN_CAPS.plan, 4096)
}

export function maxTokensForOutlineSkeleton(globalMax: number, sectionEstimate = 8): number {
  if (!USE_STEP_TOKEN_CAPS) return clampMaxTokens(globalMax)
  const estimated = Math.ceil(sectionEstimate * 90) + 700
  return Math.min(clampMaxTokens(globalMax), STEP_TOKEN_CAPS.outline, Math.max(2048, estimated))
}
