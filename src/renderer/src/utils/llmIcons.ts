export const LLM_VENDOR_ICONS: Record<string, string> = {
  Google: '/llm/google.svg',
  Anthropic: '/llm/anthropic.svg'
}

/** 无独立厂商图标时，分组标题可回退使用的大模型代表图标 */
export const LLM_BRAND_MODEL_ICONS: Record<string, string> = {
  OpenAI: '/llm/chatgpt.svg',
  Anthropic: '/llm/claude.svg',
  Google: '/llm/gemini.svg',
  DeepSeek: '/llm/deepseek.svg',
  Qwen: '/llm/千问.svg',
  xAI: '/llm/grok.svg'
}

const LLM_MODEL_ICON_RULES: Array<{ pattern: RegExp; icon: string; brand: string }> = [
  { pattern: /^(gpt-|chatgpt-|o[0-9](-|$)|text-davinci)/i, icon: '/llm/chatgpt.svg', brand: 'OpenAI' },
  { pattern: /(^|\/)claude/i, icon: '/llm/claude.svg', brand: 'Anthropic' },
  { pattern: /(^|\/)gemini/i, icon: '/llm/gemini.svg', brand: 'Google' },
  { pattern: /(^|\/)deepseek/i, icon: '/llm/deepseek.svg', brand: 'DeepSeek' },
  { pattern: /(^|\/)grok/i, icon: '/llm/grok.svg', brand: 'xAI' },
  { pattern: /^(qwen|qwq)/i, icon: '/llm/千问.svg', brand: 'Qwen' }
]

export function resolveLlmBrandFromModel(modelId: string): string {
  const id = modelId.trim()
  if (!id) return '其他'
  for (const rule of LLM_MODEL_ICON_RULES) {
    if (rule.pattern.test(id)) return rule.brand
  }
  const prefix = id.split(/[/:@]/)[0]?.trim()
  if (!prefix) return '其他'
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

export function resolveLlmVendorIcon(brand: string): string | null {
  return LLM_VENDOR_ICONS[brand] ?? LLM_BRAND_MODEL_ICONS[brand] ?? null
}

export function resolveLlmModelIcon(modelId: string): string | null {
  const id = modelId.trim()
  if (!id) return null
  for (const rule of LLM_MODEL_ICON_RULES) {
    if (rule.pattern.test(id)) return rule.icon
  }
  return null
}
