export interface LocaleOption {
  value: string
  label: string
}

export const REGION_OPTIONS: LocaleOption[] = [
  { value: 'us', label: '美国' },
  { value: 'uk', label: '英国' },
  { value: 'ca', label: '加拿大' },
  { value: 'au', label: '澳大利亚' },
  { value: 'sg', label: '新加坡' },
  { value: 'cn', label: '中国' },
  { value: 'jp', label: '日本' },
  { value: 'de', label: '德国' },
  { value: 'fr', label: '法国' },
  { value: 'global', label: '全球（不限制地区）' }
]

export const LANGUAGE_OPTIONS: LocaleOption[] = [
  { value: 'en', label: 'English（英语）' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'de', label: 'Deutsch（德语）' },
  { value: 'fr', label: 'Français（法语）' },
  { value: 'es', label: 'Español（西班牙语）' }
]

export function getLanguageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((item) => item.value === code)?.label ?? code
}

export function getRegionLabel(code: string): string {
  return REGION_OPTIONS.find((item) => item.value === code)?.label ?? code
}

export const LANGUAGE_PROMPT_HINT: Record<string, string> = {
  en: 'Prefer English-language sources when searching. Internal analysis may use any language.',
  zh: '搜索时优先中文资料。内部分析步骤可使用任意语言。',
  ja: '検索時は日本語ソースを優先。内部処理は任意の言語可。',
  de: 'Bevorzugen Sie deutschsprachige Quellen bei der Suche.',
  fr: 'Privilégier les sources en français lors de la recherche.',
  es: 'Priorizar fuentes en español en la búsqueda.'
}
