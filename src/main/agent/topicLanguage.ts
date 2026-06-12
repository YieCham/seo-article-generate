import { getLanguageLabel } from '../research/localeOptions'

export type TopicLanguageCode = 'en' | 'zh' | 'ja' | 'de' | 'fr' | 'es'

const LATIN_WORD_PATTERNS: Record<Exclude<TopicLanguageCode, 'zh' | 'ja'>, RegExp> = {
  en: /\b(the|and|how|what|why|best|guide|tips|for|with|to|of|in|on)\b/i,
  de: /\b(der|die|das|und|wie|für|nicht|mit|von|zum|zur)\b/i,
  fr: /\b(le|la|les|des|comment|pour|avec|dans|une|est|pas)\b/i,
  es: /\b(el|la|los|las|como|para|con|una|qué|por|más)\b/i
}

export function detectTopicLanguage(text: string): TopicLanguageCode {
  const trimmed = text.trim()
  if (!trimmed) return 'en'

  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(trimmed)) return 'ja'
  if (/[\u4E00-\u9FFF]/.test(trimmed)) return 'zh'

  const lower = trimmed.toLowerCase()

  if (/[ñáéíóúü¿¡]/.test(lower) || LATIN_WORD_PATTERNS.es.test(lower)) return 'es'
  if (/[àâçéèêëïîôùûü]/.test(lower) || LATIN_WORD_PATTERNS.fr.test(lower)) return 'fr'
  if (/[äöüß]/.test(lower) || LATIN_WORD_PATTERNS.de.test(lower)) return 'de'

  if (/[a-zA-Z]/.test(trimmed)) return 'en'

  return 'zh'
}

export function getArticleLanguageLock(code: TopicLanguageCode): string {
  const label = getLanguageLabel(code)
  const locks: Record<TopicLanguageCode, string> = {
    en: [
      '【MANDATORY OUTPUT LANGUAGE — ENGLISH】',
      'The final article MUST be written entirely in English.',
      'All headings, paragraphs, lists, and captions must be in English.',
      'Do NOT output Chinese, Japanese, or any other language in the article body.',
      'Proper nouns, brand names, and unavoidable technical terms may stay as-is.',
      'If reference material is in another language, translate ideas into English — do not copy foreign-language sentences.'
    ].join('\n'),
    zh: [
      '【硬性要求 — 输出语言：简体中文】',
      '最终文章必须全部使用简体中文撰写。',
      '标题、小标题、正文、列表项均不得使用英文整句或其它语言（品牌名、必要专有名词除外）。',
      '若参考资料为外文，请将要点改写为中文表达，不要保留大段外文原文。'
    ].join('\n'),
    ja: [
      '【必須 — 出力言語：日本語】',
      '最終記事は全文日本語で執筆すること。',
      '見出し・本文・リストはすべて日本語。中国語や英語の段落を混在させない。',
      '参考資料が他言語でも、内容は日本語に翻訳して記述すること。'
    ].join('\n'),
    de: [
      '【PFLICHT — Ausgabesprache: Deutsch】',
      'Der gesamte Artikel muss auf Deutsch verfasst sein.',
      'Alle Überschriften, Absätze und Listen auf Deutsch — keine chinesischen oder englischen Absätze.',
      'Fremdsprachige Quellen inhaltlich ins Deutsche übertragen.'
    ].join('\n'),
    fr: [
      '【OBLIGATOIRE — Langue de sortie : français】',
      "L'article final doit être entièrement rédigé en français.",
      'Titres, paragraphes et listes en français — pas de paragraphes en chinois ou en anglais.',
      'Traduire le contenu des sources étrangères en français.'
    ].join('\n'),
    es: [
      '【OBLIGATORIO — Idioma de salida: español】',
      'El artículo final debe estar escrito completamente en español.',
      'Títulos, párrafos y listas en español — no mezclar párrafos en chino o inglés.',
      'Traducir al español las ideas de fuentes en otros idiomas.'
    ].join('\n')
  }

  return `${locks[code]}\n（检测到的主题语言：${label}）`
}

export function getSearchQueryLanguageHint(code: TopicLanguageCode): string {
  const label = getLanguageLabel(code)
  return `搜索关键词必须与主题使用相同语言（${label}）。若主题为英文，所有搜索词必须是英文，不得输出中文搜索词。`
}

export function fallbackSearchQueries(topic: string, language: TopicLanguageCode): string[] {
  const templates: Record<TopicLanguageCode, string[]> = {
    en: [
      topic,
      `${topic} expert guide`,
      `${topic} research evidence`,
      `${topic} common mistakes`
    ],
    zh: [topic, `${topic} 深度解析`, `${topic} 专家建议`, `${topic} 常见误区`],
    ja: [topic, `${topic} 専門家`, `${topic} 研究`, `${topic} よくある誤解`],
    de: [topic, `${topic} Ratgeber`, `${topic} Experten`, `${topic} Fehler`],
    fr: [topic, `${topic} guide`, `${topic} experts`, `${topic} erreurs courantes`],
    es: [topic, `${topic} guía`, `${topic} expertos`, `${topic} errores comunes`]
  }
  return templates[language].slice(0, 4)
}
