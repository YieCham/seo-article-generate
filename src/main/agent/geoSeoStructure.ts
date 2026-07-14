import {
  MIN_ARTICLE_WORDS,
  MAX_ARTICLE_WORDS,
  MAX_FAQ_QUESTIONS,
  MAX_FAQ_SECTION_WORDS,
  MIN_FAQ_QUESTIONS
} from './articleLength'
import {
  isGeoSeoSkillEnabled,
  isIosGeoSkillEnabled,
  isStreamingGeoSkillEnabled
} from './skillPipeline'

const GEO_SKILL_PATTERN =
  /GEO|Quick Answer|Key Takeaways|seo-geo-streaming|streaming-audio-domain|streaming-audio-compliance|seo-geo-ios|流媒体音频|iOS.*安全|iPhone.*fix|iOS security|Spotify|Tidal|Apple Music|Audible|format limitations/i

const STREAMING_GEO_SKILL_PATTERN =
  /seo-geo-streaming|streaming-audio-domain|streaming-audio-compliance|流媒体音频|Spotify|Tidal|Apple Music|Audible|format limitations/i

const IOS_GEO_SKILL_PATTERN =
  /seo-geo-ios|iOS.*安全|iPhone.*fix|iOS security|故障修复|安全管理/i

export function shouldApplyGeoSeoStructure(skillsText: string, enabledSkillIds?: string[]): boolean {
  if (enabledSkillIds && enabledSkillIds.length > 0) {
    return isGeoSeoSkillEnabled(enabledSkillIds) || GEO_SKILL_PATTERN.test(skillsText)
  }
  return GEO_SKILL_PATTERN.test(skillsText)
}

export function shouldApplyStreamingGeoStyle(
  skillsText: string,
  enabledSkillIds?: string[]
): boolean {
  if (enabledSkillIds && enabledSkillIds.length > 0) {
    return isStreamingGeoSkillEnabled(enabledSkillIds) || STREAMING_GEO_SKILL_PATTERN.test(skillsText)
  }
  return STREAMING_GEO_SKILL_PATTERN.test(skillsText)
}

export function shouldApplyIosGeoStyle(skillsText: string, enabledSkillIds?: string[]): boolean {
  if (enabledSkillIds && enabledSkillIds.length > 0) {
    return isIosGeoSkillEnabled(enabledSkillIds) || IOS_GEO_SKILL_PATTERN.test(skillsText)
  }
  return IOS_GEO_SKILL_PATTERN.test(skillsText)
}

export const GEO_BANNED_TERMS_GUIDANCE = [
  'Never use: DRM, remove DRM, crack, bypass DRM, strip DRM.',
  'Use instead: format limitations, playback restrictions, unlock full access, convert for personal offline listening.'
].join('\n')

export const IOS_GEO_BANNED_TERMS_GUIDANCE = [
  'Never use or instruct: jailbreak, jailbreaking, unlock bootloader, remove iCloud lock (on others\' devices), bypass Activation Lock, crack, pirate, stolen iPhone unlock.',
  'Use instead: official restore, authorized repair, devices you own, Activation Lock on your own account, system repair, contact Apple Support.',
  'Never claim the tool can fix stolen devices or remove someone else\'s Apple ID / Find My protection.'
].join('\n')

export const GEO_PART_STRUCTURE = `
【Multi-Part Structure — flexible layout】

Use ## Part 1., ## Part 2., … for major body sections (Quick Answer, Introduction, FAQ, Conclusion are NOT Parts).

Content flow (important):
1. **Front-load generic value** — Early Part(s) build the article framework using research/competitor insights: pain points, technical context, common approaches, generic selection criteria, compliance boundaries. **Product name only when naturally relevant** (light example, not the section focus).
2. **Introduce the product naturally later** — After the reader understands the topic, transition into **one dedicated product Part** (may be Part 2, 3, or 4 — **not fixed**). Use a bridging paragraph; do not hard-sell in Part 2 by default.
3. **Single product Part** — Product recommendation (pitch, optional comparison table) AND step-by-step tutorial **must live in the same Part**, split with ### subsections only — never two separate Parts.

Rules:
- Quick Answer / Key Takeaways → H2 without "Part" prefix
- Introduction → ## Introduction (**max 150 English words, max 3 paragraphs**); no product pitch
- Generic body Parts → topic-driven titles from outline + research; mention product name only when content naturally links to it (light touch, ≤1–2 mentions per Part); **H2/H3 titles name the task, setting, or method in plain words** — avoid abstract "program" rebrands (Detox, Retrain, Journey); semantic match to Topic is enough; do not paste the exact Topic into every Part heading; no keyword-stuffed H2s
- **Multi-method generic Parts** (≥2 parallel tactics/settings/approaches) → under that ##, use **one ### per method**; first bullet "- mode: procedural|explanatory|checklist|caution", then 1–2 stub bullets — do not list multiple methods as sibling bullets under one ##
- Product Part → one Part containing ### Why [Product]… + ### Step-by-Step Tutorial (≥4 steps, [Image: …])
- FAQ → a topic-related ## heading that readers recognize as FAQ (e.g. include FAQ/FAQs + topic cue; do **not** require the bare title "FAQ"); **${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS}** Q&A; **≤${MAX_FAQ_SECTION_WORDS} English words** for the entire FAQ section
- Conclusion → ## Conclusion (**max 150 words, max 3 paragraphs**)

Example skeleton (product in Part 3 — illustrative only):
## Quick Answer
## Introduction
## Part 1. [Generic topic depth from research]
## Part 2. [Generic selection / methods — product only if naturally relevant]
## Part 3. How to [Topic] with [Product Name]
### Why [Product Name] Fits This Workflow
### Step-by-Step Tutorial
## FAQs About [Topic cue]
## Conclusion
`.trim()

export const GEO_ARTICLE_STRUCTURE = `
【GEO/SEO Article Structure — MANDATORY when this Skill is active】

1. H1 — compelling title; include core topic words or a natural phrase (**exact Topic string not required**)
2. ## Quick Answer (or ## Key Takeaways) — 3–4 bullets immediately after H1
3. ## Introduction — empathize + roadmap (**max 150 English words, max 3 paragraphs**); no product pitch
4. Main body — **2–4 flexible Parts**: prioritize generic/research-backed sections first; **one** product Part (position not fixed) combining pitch + tutorial in a single Part with ### subsections
5. [Image: …] placeholders at key tutorial steps inside the product Part
6. FAQ section — topic-related ## heading (FAQ/FAQs + topic cue preferred; bare "FAQ" discouraged); **${MIN_FAQ_QUESTIONS}–${MAX_FAQ_QUESTIONS}** questions (legality, safety, quality, use cases, compatibility); **entire FAQ section ≤${MAX_FAQ_SECTION_WORDS} words**
7. ## Conclusion — max 150 words, max 3 paragraphs, natural CTA

${GEO_PART_STRUCTURE}

Style: match user's output language; US English when English is selected. Clear, helpful tone; empathy + accurate domain-specific technical terms.
Length: **${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} English words** (programmatically verified).
Do NOT mention AI identity or "As an expert…" in the final article.
`.trim()

export function getGeoSeoPromptBlock(skillsText: string, enabledSkillIds?: string[]): string {
  if (!shouldApplyGeoSeoStructure(skillsText, enabledSkillIds)) return ''

  const extras: string[] = []
  if (shouldApplyStreamingGeoStyle(skillsText, enabledSkillIds)) {
    extras.push(
      'Domain style (streaming audio): geek-friendly tone; use accurate audio terms (bitrate, lossless, ID3 tags, metadata, batch conversion).'
    )
    extras.push(GEO_BANNED_TERMS_GUIDANCE)
  }
  if (shouldApplyIosGeoStyle(skillsText, enabledSkillIds)) {
    extras.push(
      'Domain style (iOS repair/security): calm troubleshooting tone; cite Settings paths, iOS versions, and Apple official terms accurately; emphasize backup-first.'
    )
    extras.push(IOS_GEO_BANNED_TERMS_GUIDANCE)
  }

  return extras.length > 0 ? `${GEO_ARTICLE_STRUCTURE}\n\n${extras.join('\n\n')}` : GEO_ARTICLE_STRUCTURE
}
