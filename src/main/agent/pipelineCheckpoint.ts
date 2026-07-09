import type { PipelineStep } from './articleAgent'
export type {
  CreatePipelineCheckpoint,
  DraftSectionResume,
  OptimizePipelineCheckpoint,
  OptimizeWordRangeCheckpoint,
  PipelineCheckpoint,
  WritingBriefCheckpoint
} from '../../shared/pipelineCheckpoint'

const CREATE_STEPS: PipelineStep[] = [
  'skills',
  'extract',
  'plan',
  'outline',
  'draft',
  'polish',
  'length',
  'meta'
]

const OPTIMIZE_STEPS: PipelineStep[] = [
  'skills',
  'scrape',
  'extract',
  'outline',
  'draft',
  'polish',
  'length',
  'meta'
]

export function shouldRunPipelineStep(
  nextStep: PipelineStep,
  step: PipelineStep,
  mode: 'create' | 'optimize'
): boolean {
  const order = mode === 'create' ? CREATE_STEPS : OPTIMIZE_STEPS
  const nextIdx = order.indexOf(nextStep)
  const stepIdx = order.indexOf(step)
  if (nextIdx < 0 || stepIdx < 0) return true
  return stepIdx >= nextIdx
}
