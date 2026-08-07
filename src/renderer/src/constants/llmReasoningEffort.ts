import type { LlmReasoningEffort } from '../env.d'

export type LlmReasoningEffortChoice = LlmReasoningEffort | 'default'

export const LLM_REASONING_EFFORT_OPTIONS: Array<{
  value: LlmReasoningEffortChoice
  label: string
  hint: string
}> = [
  { value: 'default', label: '默认', hint: '不传参，使用接口默认' },
  { value: 'none', label: '关闭', hint: '尽量不推理（部分模型支持）' },
  { value: 'low', label: '低', hint: '轻度推理' },
  { value: 'medium', label: '中', hint: '均衡（多数推理模型默认）' },
  { value: 'high', label: '高', hint: '更强推理，更慢更费' },
  { value: 'max', label: '最大', hint: '最强推理（DeepSeek 等支持）' }
]

export function labelForReasoningEffort(value: LlmReasoningEffortChoice): string {
  return LLM_REASONING_EFFORT_OPTIONS.find((item) => item.value === value)?.label ?? '默认'
}
