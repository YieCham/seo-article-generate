export const DEFAULT_LLM_MAX_TOKENS = 32768

/** Mirrors main process; set false to use global llmMaxTokens only. */
export const USE_STEP_TOKEN_CAPS = false

/** Per-step output caps (mirrors main process); each request uses min(stepCap, global llmMaxTokens). */
export const STEP_TOKEN_CAPS: Record<string, number> = {
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

