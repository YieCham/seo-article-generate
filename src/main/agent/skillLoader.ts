import { readFile, readdir } from 'fs/promises'
import { join } from 'path'

export interface LoadedSkill {
  name: string
  description: string
  body: string
}

export function parseSkillMarkdown(raw: string, folderName: string): LoadedSkill {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    return { name: folderName, description: '', body: raw.trim() }
  }

  const frontmatter = match[1]
  const body = match[2].trim()
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? folderName
  const description = frontmatter.match(/^description:\s*>?-?\s*([\s\S]*?)(?:\n[a-z]|$)/m)?.[1]?.trim() ?? ''

  return { name, description, body }
}

export function serializeSkillMarkdown(skill: LoadedSkill): string {
  const descriptionLines = skill.description
    .split('\n')
    .map((line) => (line ? `  ${line}` : ''))
    .join('\n')

  return `---
name: ${skill.name}
description: >-
${descriptionLines || '  '}
---
${skill.body.trim()}
`
}

export async function loadSkills(skillsRoot: string): Promise<LoadedSkill[]> {
  let entries: string[] = []
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true }).then((items) =>
      items.filter((item) => item.isDirectory()).map((item) => item.name)
    )
  } catch {
    return []
  }

  const skills: LoadedSkill[] = []
  for (const folder of entries) {
    try {
      const raw = await readFile(join(skillsRoot, folder, 'SKILL.md'), 'utf-8')
      skills.push(parseSkillMarkdown(raw, folder))
    } catch {
      // skip folders without SKILL.md
    }
  }
  return skills
}

export function formatSkillsForPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) return '（未找到 skills，请使用通用写作规范。）'

  return skills
    .map(
      (skill) =>
        `### Skill: ${skill.name}\n${skill.description ? `> ${skill.description}\n\n` : ''}${skill.body}`
    )
    .join('\n\n---\n\n')
}

/** Optional `<!-- phase: extract -->` sections inside SKILL.md bodies. */
export function parseSkillPhases(body: string): Record<string, string> {
  const phases: Record<string, string> = { all: body.trim() }
  const pattern = /<!--\s*phase:\s*([a-z-]+)\s*-->/gi
  const matches = [...body.matchAll(pattern)]
  if (matches.length === 0) return phases

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const phase = match[1].trim()
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length
    phases[phase] = body.slice(start, end).trim()
  }

  return phases
}
