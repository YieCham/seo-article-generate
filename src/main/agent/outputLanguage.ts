import type { TopicLanguageCode } from './topicLanguage'

export type OutputLanguageCode = TopicLanguageCode

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguageCode = 'en'

const OUTPUT_LANGUAGE_CODES = new Set<OutputLanguageCode>(['en', 'zh', 'es', 'fr', 'de', 'ja'])

export function normalizeOutputLanguage(code?: string): OutputLanguageCode {
  if (code && OUTPUT_LANGUAGE_CODES.has(code as OutputLanguageCode)) {
    return code as OutputLanguageCode
  }
  return DEFAULT_OUTPUT_LANGUAGE
}
