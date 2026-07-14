import { loadConfig } from '../config/configStore'
import { resolveActiveLlmPreset, type LlmPreset } from '../config/types'

export interface LlmModelBrandGroup {
  brand: string
  models: string[]
}

export type ListLlmModelsResult =
  | { ok: true; groups: LlmModelBrandGroup[]; total: number }
  | { ok: false; message: string }

const BRAND_ORDER = [
  'OpenAI',
  'Anthropic',
  'Google',
  'DeepSeek',
  'Qwen',
  'Meta',
  'Mistral',
  'Moonshot',
  'Zhipu',
  'Baichuan',
  'Yi',
  'ByteDance',
  'Tencent',
  'MiniMax',
  'StepFun',
  'xAI',
  'Cohere',
  'Amazon',
  'Microsoft',
  '其他'
]

const BRAND_RULES: Array<{ brand: string; pattern: RegExp }> = [
  { brand: 'OpenAI', pattern: /^(gpt-|chatgpt-|o[0-9](-|$)|text-davinci)/i },
  { brand: 'Anthropic', pattern: /^claude/i },
  { brand: 'Google', pattern: /^(gemini-|palm-|bison)/i },
  { brand: 'DeepSeek', pattern: /^deepseek/i },
  { brand: 'Qwen', pattern: /^(qwen|qwq)/i },
  { brand: 'Meta', pattern: /^(llama|meta-llama)/i },
  { brand: 'Mistral', pattern: /^(mistral|mixtral|codestral|pixtral)/i },
  { brand: 'Moonshot', pattern: /^(moonshot|kimi)/i },
  { brand: 'Zhipu', pattern: /^(glm-|chatglm|zhipu)/i },
  { brand: 'Baichuan', pattern: /^baichuan/i },
  { brand: 'Yi', pattern: /^yi-/i },
  { brand: 'ByteDance', pattern: /^(doubao|ep-|skylark)/i },
  { brand: 'Tencent', pattern: /^hunyuan/i },
  { brand: 'MiniMax', pattern: /^minimax/i },
  { brand: 'StepFun', pattern: /^step-/i },
  { brand: 'xAI', pattern: /^grok/i },
  { brand: 'Cohere', pattern: /^(command|cohere)/i },
  { brand: 'Amazon', pattern: /^(amazon\.|anthropic\.|us\.anthropic)/i },
  { brand: 'Microsoft', pattern: /^(azure|phi-|microsoft)/i }
]

function resolveApiKey(presetApiKey: string): string {
  return (
    presetApiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.CURSOR_API_KEY ||
    ''
  )
}

function detectModelBrand(modelId: string): string {
  const id = modelId.trim()
  for (const rule of BRAND_RULES) {
    if (rule.pattern.test(id)) return rule.brand
  }

  const prefix = id.split(/[/:@]/)[0]?.trim()
  if (!prefix) return '其他'

  const normalized = prefix.replace(/[_-]+/g, ' ').trim()
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function shouldIncludeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  if (!lower) return false
  if (/(embed|embedding|whisper|tts|dall-e|moderation|transcribe|rerank|davinci-00)/.test(lower)) {
    return false
  }
  return true
}

function sortBrandGroups(groups: LlmModelBrandGroup[]): LlmModelBrandGroup[] {
  const orderMap = new Map(BRAND_ORDER.map((brand, index) => [brand, index]))
  return [...groups].sort((a, b) => {
    const aOrder = orderMap.get(a.brand) ?? BRAND_ORDER.length
    const bOrder = orderMap.get(b.brand) ?? BRAND_ORDER.length
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.brand.localeCompare(b.brand, 'zh-CN')
  })
}

function groupModelsByBrand(modelIds: string[]): LlmModelBrandGroup[] {
  const buckets = new Map<string, Set<string>>()

  for (const modelId of modelIds) {
    const trimmed = modelId.trim()
    if (!trimmed || !shouldIncludeModel(trimmed)) continue
    const brand = detectModelBrand(trimmed)
    const bucket = buckets.get(brand) ?? new Set<string>()
    bucket.add(trimmed)
    buckets.set(brand, bucket)
  }

  const groups = [...buckets.entries()].map(([brand, models]) => ({
    brand,
    models: [...models].sort((a, b) => a.localeCompare(b, 'en'))
  }))

  return sortBrandGroups(groups)
}

function extractModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []

  const record = payload as Record<string, unknown>
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : []

  const ids: string[] = []
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      ids.push(item.trim())
      continue
    }
    if (item && typeof item === 'object') {
      const id = (item as { id?: unknown; name?: unknown }).id ?? (item as { name?: unknown }).name
      if (typeof id === 'string' && id.trim()) ids.push(id.trim())
    }
  }

  return ids
}

export async function listLlmModelsForPreset(presetId: string): Promise<ListLlmModelsResult> {
  const config = await loadConfig()
  const preset =
    config.llmPresets.find((item) => item.id === presetId) ?? resolveActiveLlmPreset(config)
  const baseUrl = preset.baseUrl?.trim() || process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const apiKey = resolveApiKey(preset.apiKey)

  if (!apiKey) {
    return { ok: false, message: '请先填写 API Key，或在 .env 中配置 LLM_API_KEY。' }
  }

  const modelsUrl = `${baseUrl.replace(/\/$/, '')}/models`

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const detail = await response.text()
      return {
        ok: false,
        message: `检索失败 (${response.status})：${detail.slice(0, 200)}`
      }
    }

    const payload = (await response.json()) as unknown
    const modelIds = extractModelIds(payload)
    if (modelIds.length === 0) {
      return { ok: false, message: '接口未返回可用模型列表。' }
    }

    const groups = groupModelsByBrand(modelIds)
    const total = groups.reduce((sum, group) => sum + group.models.length, 0)
    if (total === 0) {
      return { ok: false, message: '未找到可添加的聊天模型。' }
    }

    return { ok: true, groups, total }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    return { ok: false, message: `检索失败：${message}` }
  }
}
