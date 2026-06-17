export type OutputLanguageCode = 'en' | 'zh' | 'es' | 'fr' | 'de' | 'ja'

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguageCode = 'en'

export const OUTPUT_LANGUAGE_STORAGE_KEY = 'composer.outputLanguage'

export const OUTPUT_LANGUAGE_OPTIONS: { value: OutputLanguageCode; label: string }[] = [
  { value: 'en', label: '英语' },
  { value: 'zh', label: '中文' },
  { value: 'es', label: '西班牙语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'ja', label: '日语' }
]

export function isOutputLanguageCode(value: string | null | undefined): value is OutputLanguageCode {
  return OUTPUT_LANGUAGE_OPTIONS.some((item) => item.value === value)
}

export function getOutputLanguageLabel(code: OutputLanguageCode): string {
  return OUTPUT_LANGUAGE_OPTIONS.find((item) => item.value === code)?.label ?? code
}
