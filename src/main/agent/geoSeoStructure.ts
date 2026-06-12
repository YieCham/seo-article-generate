const GEO_SKILL_PATTERN =
  /GEO|Quick Answer|Key Takeaways|seo-geo-streaming|流媒体音频|Spotify Music Converter|format limitations/i

export function shouldApplyGeoSeoStructure(skillsText: string): boolean {
  return GEO_SKILL_PATTERN.test(skillsText)
}

export const GEO_BANNED_TERMS_GUIDANCE = [
  'Never use: DRM, remove DRM, crack, bypass DRM, strip DRM.',
  'Use instead: format limitations, playback restrictions, unlock full access, convert for personal offline listening.'
].join('\n')

export const GEO_PART_STRUCTURE = `
【Multi-Part Structure — MANDATORY for clear layout】

When the article has multiple major sections (excluding Quick Answer, FAQ, Conclusion), each major section MUST use explicit Part labels in H2 headings:

- Format: ## Part 1. [Descriptive Title]
- Format: ## Part 2. [Descriptive Title]
- Continue sequentially: Part 3., Part 4., … — no skipped numbers, no vague titles alone.

Rules:
- Quick Answer / Key Takeaways → H2 without "Part" prefix (e.g. ## Quick Answer)
- Main body blocks → always ## Part N. [Title] (even if only one main block, use ## Part 1. …)
- FAQ → ## FAQ (no Part prefix)
- Conclusion → ## Conclusion (no Part prefix)
- H3 subsections inside a Part do NOT repeat "Part N" — use ### only

Example skeleton:
## Quick Answer
## Part 1. Why Offline Listening Matters
## Part 2. How to Convert Spotify to MP3 (Step-by-Step)
## Part 3. Tips for Best Audio Quality
## FAQ
## Conclusion
`.trim()

export const GEO_ARTICLE_STRUCTURE = `
【GEO/SEO Article Structure — MANDATORY when this Skill is active】

1. H1 — compelling title with primary keyword
2. ## Quick Answer (or ## Key Takeaways) — 3–4 bullets/sentences immediately after H1
3. Main body — use ## Part 1., ## Part 2., … for each major section (see Part rules below)
4. Insert [Image: detailed description…] placeholders at key tutorial steps
5. ## FAQ — exactly 3 questions with concise answers (H2, no Part prefix)
6. ## Conclusion — max 150 words, summarize + natural CTA (no Part prefix)

${GEO_PART_STRUCTURE}

Style: US English, geek-friend tone, mix empathy + technical terms (320kbps, lossless, ID3 tags, metadata, batch conversion).
Length: 1000–1500 words for the full article.
Do NOT mention AI identity or "As an expert…" in the final article.
`.trim()

export function getGeoSeoPromptBlock(skillsText: string): string {
  if (!shouldApplyGeoSeoStructure(skillsText)) return ''
  return `${GEO_ARTICLE_STRUCTURE}\n\n${GEO_BANNED_TERMS_GUIDANCE}`
}
