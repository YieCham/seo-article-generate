export const DEFAULT_LLM_MAX_TOKENS = 32768

/** Per-step output caps (mirrors main process); each request uses min(stepCap, global llmMaxTokens). */
export const STEP_TOKEN_CAPS: Record<string, number> = {
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
