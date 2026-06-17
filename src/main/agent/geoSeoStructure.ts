import { MIN_ARTICLE_WORDS, MAX_ARTICLE_WORDS } from './articleLength'

const GEO_SKILL_PATTERN =
  /GEO|Quick Answer|Key Takeaways|seo-geo-streaming|流媒体音频|Spotify|Tidal|Apple Music|Audible|format limitations/i

export function shouldApplyGeoSeoStructure(skillsText: string): boolean {
  return GEO_SKILL_PATTERN.test(skillsText)
}

export const GEO_BANNED_TERMS_GUIDANCE = [
  'Never use: DRM, remove DRM, crack, bypass DRM, strip DRM.',
  'Use instead: format limitations, playback restrictions, unlock full access, convert for personal offline listening.'
].join('\n')

export const GEO_PART_STRUCTURE = `
【Multi-Part Structure — flexible layout】

Use ## Part 1., ## Part 2., … for major body sections (Quick Answer, Introduction, FAQ, Conclusion are NOT Parts).

Content flow (important):
1. **Front-load generic value** — Early Part(s) build the article framework using research/competitor insights: pain points, technical context, common approaches, generic selection criteria, compliance boundaries. **No product name** in these Parts.
2. **Introduce the product naturally later** — After the reader understands the topic, transition into **one dedicated product Part** (may be Part 2, 3, or 4 — **not fixed**). Use a bridging paragraph; do not hard-sell in Part 2 by default.
3. **Single product Part** — Product recommendation (pitch, optional comparison table) AND step-by-step tutorial **must live in the same Part**, split with ### subsections only — never two separate Parts.

Rules:
- Quick Answer / Key Takeaways → H2 without "Part" prefix
- Introduction → ## Introduction (**max 150 English words, max 3 paragraphs**); no product pitch
- Generic body Parts → topic-driven titles from outline + research; no product name; **H2 titles must read naturally** — semantic match to Topic is enough; do not paste the exact Topic into every Part heading; no keyword-stuffed H2s
- Product Part → one Part containing ### Why [Product]… + ### Step-by-Step Tutorial (≥4 steps, [Image: …])
- FAQ → ## FAQ (**at least 5** Q&A)
- Conclusion → ## Conclusion (**max 150 words, max 3 paragraphs**)

Example skeleton (product in Part 3 — illustrative only):
## Quick Answer
## Introduction
## Part 1. [Generic topic depth from research]
## Part 2. [Generic selection / methods — still no product name]
## Part 3. How to [Topic] with [Product Name]
### Why [Product Name] Fits This Workflow
### Step-by-Step Tutorial
## FAQ
## Conclusion
`.trim()

export const GEO_ARTICLE_STRUCTURE = `
【GEO/SEO Article Structure — MANDATORY when this Skill is active】

1. H1 — compelling title; include core topic words or a natural phrase (**exact Topic string not required**)
2. ## Quick Answer (or ## Key Takeaways) — 3–4 bullets immediately after H1
3. ## Introduction — empathize + roadmap (**max 150 English words, max 3 paragraphs**); no product pitch
4. Main body — **2–4 flexible Parts**: prioritize generic/research-backed sections first; **one** product Part (position not fixed) combining pitch + tutorial in a single Part with ### subsections
5. [Image: …] placeholders at key tutorial steps inside the product Part
6. ## FAQ — **at least 5** questions (legality, safety, quality, use cases, compatibility)
7. ## Conclusion — max 150 words, max 3 paragraphs, natural CTA

${GEO_PART_STRUCTURE}

Style: match user's output language; US English when English is selected. Geek-friend tone; empathy + technical terms (320kbps, lossless, ID3 tags, metadata, batch conversion).
Length: **${MIN_ARTICLE_WORDS}–${MAX_ARTICLE_WORDS} English words** (programmatically verified).
Do NOT mention AI identity or "As an expert…" in the final article.
`.trim()

export function getGeoSeoPromptBlock(skillsText: string): string {
  if (!shouldApplyGeoSeoStructure(skillsText)) return ''
  return `${GEO_ARTICLE_STRUCTURE}\n\n${GEO_BANNED_TERMS_GUIDANCE}`
}
