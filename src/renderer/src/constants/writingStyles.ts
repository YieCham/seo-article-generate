/** Empty value = AI default (no writing-style Skill). */
export type WritingStyleId = '' | 'explainer-voice'

export interface WritingStyleOption {
  value: WritingStyleId
  label: string
  hint: string
}

export const DEFAULT_WRITING_STYLE_ID: WritingStyleId = ''

export const EXPLAINER_VOICE_STYLE_ID = 'explainer-voice' as const

export const WRITING_STYLE_OPTIONS: WritingStyleOption[] = [
  {
    value: '',
    label: 'AI 默认',
    hint: '不套用文风 Skill，由模型自行发挥'
  },
  {
    value: EXPLAINER_VOICE_STYLE_ID,
    label: '解释性博主',
    hint: 'explainer-voice：长短句节奏、动词驱动、具象隐喻'
  }
]

export function isWritingStyleId(value: unknown): value is WritingStyleId {
  return value === '' || value === EXPLAINER_VOICE_STYLE_ID
}

export function normalizeWritingStyleId(value: unknown): WritingStyleId {
  return isWritingStyleId(value) ? value : DEFAULT_WRITING_STYLE_ID
}
