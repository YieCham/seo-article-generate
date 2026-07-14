/** Broad style guidance — injected once via getWritingPromptBlocks. */
export const PLAIN_PROSE_STYLE_GUIDANCE = `
【Writing style — general】
- Be clear and helpful: lead with facts, steps, and scenarios readers can act on.
- Keep figurative language light; do not lean on metaphors or rhetorical flair as the main voice.
- Build trust with specifics — what works, what does not, limits, examples — rather than emphasis alone.
- Headings and paragraphs should stay scannable; natural variation in tone is welcome.
`.trim()

/** Word-choice guidance — headings & verbs; kept broad to avoid homogenized output. */
export const VOCABULARY_STYLE_GUIDANCE = `
【Word choice — general】
- **Headings (H1–H3)**: name the task, setting, or outcome in plain words — e.g. how to fix bad recommendations, use "Don't play this artist", listen offline without changing your feed. Avoid repackaging the topic as a abstract "program" (Detox, Retrain, Reset Journey, Cleanse) unless the user's Topic already uses that exact phrase.
- **Verbs**: favor everyday action verbs tied to real UI or behavior (skip, hide, create, connect, switch, exclude, save, play) over abstract or hype verbs (weaponize, leverage, supercharge, purge, retrain).
- **Concepts → actions**: when the Topic is abstract, ground it in what the reader actually does or sees — not a metaphorical wellness-style rewrite of the same idea.
`.trim()

/** Short Chinese hint for draft / polish user prompts. */
export const PLAIN_PROSE_STYLE_HINT_ZH = '文风：说清为准，事实与场景为主；语气自然，修辞适度。'

export const VOCABULARY_STYLE_HINT_ZH =
  '用词：标题与步骤用读者能直接做的动作表述；少用 Detox/Retrain 等概念包装词，动词宜平实可执行（如 skip、hide、create），不宜抽象夸张。'
