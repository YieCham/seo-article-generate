import type { LlmPreset } from '../env.d'

export const LLM_MODEL_STORAGE_KEY = 'composer.llmModel'

const OPTION_ID_SEP = '::'

export interface LlmModelOption {
  id: string
  model: string
  presetId: string
  presetName: string
}

export function encodeLlmModelOptionId(presetId: string, model: string): string {
  return `${presetId}${OPTION_ID_SEP}${model}`
}

export function decodeLlmModelOptionId(optionId: string): { presetId: string; model: string } | null {
  const separatorIndex = optionId.indexOf(OPTION_ID_SEP)
  if (separatorIndex <= 0) return null
  const presetId = optionId.slice(0, separatorIndex)
  const model = optionId.slice(separatorIndex + OPTION_ID_SEP.length).trim()
  if (!presetId || !model) return null
  return { presetId, model }
}

export function formatLlmModelOptionLabel(option: LlmModelOption): string {
  return `${option.model} (${option.presetName})`
}

export function listUnionLlmModels(presets: LlmPreset[]): LlmModelOption[] {
  const options: LlmModelOption[] = []

  for (const preset of presets) {
    for (const model of preset.models) {
      const trimmed = model.trim()
      if (!trimmed) continue
      options.push({
        id: encodeLlmModelOptionId(preset.id, trimmed),
        model: trimmed,
        presetId: preset.id,
        presetName: preset.name
      })
    }
  }

  return options
}

export function resolveLlmModelSelection(
  presets: LlmPreset[],
  optionId: string
): LlmModelOption | null {
  return listUnionLlmModels(presets).find((item) => item.id === optionId) ?? null
}

export function pickDefaultLlmModelOptionId(
  presets: LlmPreset[],
  storedValue?: string | null
): string {
  const options = listUnionLlmModels(presets)
  if (!storedValue) return options[0]?.id ?? ''

  if (options.some((item) => item.id === storedValue)) {
    return storedValue
  }

  const legacyMatch = options.find((item) => item.model === storedValue)
  return legacyMatch?.id ?? options[0]?.id ?? ''
}
