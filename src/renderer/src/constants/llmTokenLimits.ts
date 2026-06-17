export const DEFAULT_LLM_MAX_TOKENS = 32768

/** Per-step output caps (mirrors main process); each request uses min(stepCap, global llmMaxTokens). */
export const STEP_TOKEN_CAPS: Record<string, number> = {
  intentExpand: 6144,
  eeatExtract: 12288,
  writingBrief: 6144,
  plan: 24576,
  outline: 24576,
  sectionDraft: 12288,
  polish: 12288,
  lengthAdjust: 12288,
  seoMeta: 2460,
  sectionEdit: 12288,
  optimizeAudit: 16384,
  optimizeDraft: 24576,
  optimizeSectionDraft: 12288,
  optimizePolish: 24576,
  optimizeLengthAdjust: 16384
}

