export type PipelineStep =
  | 'skills'
  | 'expand'
  | 'search'
  | 'scrape'
  | 'extract'
  | 'plan'
  | 'outline'
  | 'draft'
  | 'polish'
  | 'length'
  | 'meta'

export interface WritingBriefCheckpoint {
  intentOneLiner: string
  keyFacts: string[]
  competitorGaps: string[]
  faqSeeds: string[]
  toneNotes: string
  mustAvoid: string[]
}

export interface CreatePipelineCheckpoint {
  kind: 'create'
  assistantMessageId: string
  nextStep: PipelineStep
  options: {
    topic: string
    extraInstructions?: string
    outputLanguage?: string
  }
  statusLabel?: string
  outline?: string
  writingBrief?: WritingBriefCheckpoint
  plan?: string
  extracted?: string
  partialDraft?: string
  draftSectionIndex?: number
  draftSectionCount?: number
  workText?: string
  searchIntentSummary?: string
}

export interface OptimizeWordRangeCheckpoint {
  min: number
  max: number
  label: string
}

export interface OptimizePipelineCheckpoint {
  kind: 'optimize'
  assistantMessageId: string
  nextStep: PipelineStep
  options: {
    sourceUrl: string
    extraInstructions?: string
    outputLanguage?: string
  }
  statusLabel?: string
  sourceTitle?: string
  sourceMarkdown?: string
  audit?: string
  outline?: string
  competitorInsights?: string
  wordRange?: OptimizeWordRangeCheckpoint
  useSinglePass?: boolean
  partialDraft?: string
  draftSectionIndex?: number
  draftSectionCount?: number
  workText?: string
}

export type PipelineCheckpoint = CreatePipelineCheckpoint | OptimizePipelineCheckpoint

export interface DraftSectionResume {
  startIndex?: number
  initialDraft?: string
  onSectionComplete?: (sectionIndex: number, sectionCount: number, draft: string) => void
}
