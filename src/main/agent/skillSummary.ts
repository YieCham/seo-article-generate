export type SkillSummaryMode = 'draft' | 'polish' | 'default'

const SKILL_SUMMARY_CHAR_LIMITS: Record<SkillSummaryMode, number> = {
  draft: 800,
  polish: 500,
  default: 1400
}

export interface TruncateSkillOptions {
  preferSection?: RegExp
}

export function truncateSkillText(
  text: string,
  limit: number,
  options?: TruncateSkillOptions
): string {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length <= limit) return trimmed

  if (options?.preferSection) {
    const sections = trimmed.split(/\n(?=## )/g)
    const preferred = sections.find((section) => options.preferSection!.test(section))
    if (preferred) {
      const rest = sections.filter((section) => section !== preferred).join('\n')
      const preferredText = preferred.trim()
      if (preferredText.length >= limit) {
        return `${preferredText.slice(0, limit).trim()}\n\n…（节选）`
      }
      const remaining = limit - preferredText.length - 20
      if (remaining > 80 && rest.trim()) {
        return `${preferredText}\n\n${rest.trim().slice(0, remaining).trim()}\n\n…（节选）`
      }
      return `${preferredText}\n\n…（节选）`
    }
  }

  return `${trimmed.slice(0, limit).trim()}\n\n…（节选）`
}

export function pickSkillFragmentForSection(sectionTitle: string, skillsText: string): string {
  const title = sectionTitle.trim().toLowerCase()
  const skill = skillsText.trim()
  if (!skill) return ''

  if (/^faq|常见问题/.test(title)) {
    const faqBlock = skill.match(/(?:^|\n)##[^\n]*faq[^\n]*[\s\S]*?(?=\n## |\n---|$)/i)?.[0]
    const complianceBlock = skill.match(/(?:^|\n)##[^\n]*(?:合规|敏感词|禁止)[^\n]*[\s\S]*?(?=\n## |\n---|$)/i)?.[0]
    const picked = [complianceBlock, faqBlock].filter(Boolean).join('\n\n')
    if (picked) return picked
  }

  if (/quick answer|key takeaways/.test(title)) {
    const complianceBlock = skill.match(/(?:^|\n)##[^\n]*(?:合规|敏感词|禁止)[^\n]*[\s\S]*?(?=\n## |\n---|$)/i)?.[0]
    if (complianceBlock) return complianceBlock
  }

  if (/compliance|legal|disclaimer|合法性|免责/.test(title)) {
    const complianceBlock = skill.match(/(?:^|\n)##[^\n]*(?:合规|敏感词|禁止|免责)[^\n]*[\s\S]*?(?=\n## |\n---|$)/i)?.[0]
    if (complianceBlock) return complianceBlock
  }

  return skill
}

export function buildSkillSummaryForDraft(
  skillsText: string,
  structureBlock: string,
  mode: SkillSummaryMode = 'draft'
): string {
  const structure = structureBlock.trim()
  const skill = skillsText.trim()
  const limit = SKILL_SUMMARY_CHAR_LIMITS[mode]

  if (!skill) return structure

  const skillSummary =
    skill.length > limit
      ? truncateSkillText(skill, limit, { preferSection: /合规|敏感词|禁止|E-E-A-T|关键词/i })
      : skill

  if (!structure) return skillSummary

  return ['【结构规范 — 必须遵守】', structure, '', '【Skill 写作要点】', skillSummary].join('\n')
}

export function buildSkillSummaryForPolish(
  skillsText: string,
  structureBlock: string,
  mode: SkillSummaryMode = 'polish'
): string {
  return buildSkillSummaryForDraft(skillsText, structureBlock, mode)
}
