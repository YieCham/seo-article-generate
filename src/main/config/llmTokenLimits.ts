export const DEFAULT_LLM_MAX_TOKENS = 32768
export const MIN_LLM_MAX_TOKENS = 1024
export const MAX_LLM_MAX_TOKENS = 128000

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
  | 'optimizeAudit'
  | 'optimizeDraft'
  | 'optimizeSectionDraft'
  | 'optimizePolish'
  | 'optimizeLengthAdjust'

export const STEP_TOKEN_CAPS: Record<PipelineTokenStep, number> = {
  intentExpand: 4096,
  eeatExtract: 8192,
  writingBrief: 4096,
  plan: 16384,
  outline: 16384,
  sectionDraft: 4096,
  polish: 8192,
  lengthAdjust: 8192,
  seoMeta: 512,
  sectionEdit: 8192,
  optimizeAudit: 12288,
  optimizeDraft: 16384,
  optimizeSectionDraft: 8192,
  optimizePolish: 16384,
  optimizeLengthAdjust: 12288
}

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

export function resolveStepMaxTokens(
  step: PipelineTokenStep,
  globalMax: number,
  wordBudget?: number
): number {
  const global = clampMaxTokens(globalMax)
  const stepCap = STEP_TOKEN_CAPS[step]

  if (wordBudget != null && Number.isFinite(wordBudget)) {
    const wordBasedSteps: Partial<Record<PipelineTokenStep, { multiplier: number; floor: number }>> = {
      sectionDraft: { multiplier: 2.5, floor: 512 },
      optimizeDraft: { multiplier: 2.8, floor: 2048 },
      optimizeSectionDraft: { multiplier: 2.8, floor: 1024 },
      optimizePolish: { multiplier: 2.6, floor: 2048 },
      optimizeLengthAdjust: { multiplier: 2.6, floor: 2048 }
    }
    const rule = wordBasedSteps[step]
    if (rule) {
      const estimated = Math.ceil(wordBudget * rule.multiplier)
      return Math.min(global, stepCap, Math.max(rule.floor, estimated))
    }
  }

  return Math.min(global, stepCap)
}

export function maxTokensForSectionDraft(words: number, globalMax: number): number {
  return resolveStepMaxTokens('sectionDraft', globalMax, words)
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
