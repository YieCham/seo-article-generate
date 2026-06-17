const SKILL_SUMMARY_CHAR_LIMIT = 1400

export function buildSkillSummaryForDraft(skillsText: string, structureBlock: string): string {
  const structure = structureBlock.trim()
  const skill = skillsText.trim()

  if (!skill) return structure

  const skillSummary =
    skill.length > SKILL_SUMMARY_CHAR_LIMIT
      ? `${skill.slice(0, SKILL_SUMMARY_CHAR_LIMIT).trim()}\n\n…（完整 Skill 规范已提炼为上方结构块；写作时遵守结构与禁忌。）`
      : skill

  return ['【结构规范 — 必须遵守】', structure, '', '【Skill 写作要点】', skillSummary].join('\n')
}

export function buildSkillSummaryForPolish(skillsText: string, structureBlock: string): string {
  return buildSkillSummaryForDraft(skillsText, structureBlock)
}
