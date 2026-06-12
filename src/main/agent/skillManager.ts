import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { loadConfig, saveConfig } from '../config/configStore'
import type { SkillItem } from '../config/types'
import { parseSkillMarkdown, serializeSkillMarkdown } from '../agent/skillLoader'

interface SkillLocation {
  id: string
  root: string
  bundled: boolean
}

function getUserSkillsRoot(): string {
  return join(app.getPath('userData'), 'skills')
}

function resolveBundledSkillsRoot(): string | null {
  const candidates = [
    join(__dirname, 'bundled-skills'),
    join(app.getAppPath(), 'src/main/bundled-skills'),
    join(app.getAppPath(), '.cursor', 'skills')
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

async function readSkillFolderIds(root: string): Promise<string[]> {
  try {
    return await readdir(root, { withFileTypes: true }).then((items) =>
      items.filter((item) => item.isDirectory()).map((item) => item.name)
    )
  } catch {
    return []
  }
}

async function collectSkillLocations(): Promise<SkillLocation[]> {
  const map = new Map<string, SkillLocation>()

  const bundledRoot = resolveBundledSkillsRoot()
  if (bundledRoot) {
    for (const id of await readSkillFolderIds(bundledRoot)) {
      map.set(id, { id, root: bundledRoot, bundled: true })
    }
  }

  const userRoot = getUserSkillsRoot()
  for (const id of await readSkillFolderIds(userRoot)) {
    map.set(id, { id, root: userRoot, bundled: false })
  }

  return [...map.values()]
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `skill-${Date.now()}`
}

async function resolveEnabledSkillIds(allIds: string[]): Promise<string[]> {
  const config = await loadConfig()

  if (allIds.length === 0) {
    return config.enabledSkills
  }

  if (!config.skillEnablementInitialized) {
    await saveConfig({ enabledSkills: [...allIds], skillEnablementInitialized: true })
    return [...allIds]
  }

  const valid = config.enabledSkills.filter((id) => allIds.includes(id))
  const missing = allIds.filter((id) => !valid.includes(id))

  if (missing.length > 0) {
    const next = [...valid, ...missing]
    await saveConfig({ enabledSkills: next })
    return next
  }

  return valid
}

export async function listSkills(): Promise<SkillItem[]> {
  const locations = await collectSkillLocations()
  const enabledSkills = await resolveEnabledSkillIds(locations.map((item) => item.id))
  const enabledSet = new Set(enabledSkills)
  const skills: SkillItem[] = []

  for (const location of locations) {
    try {
      const raw = await readFile(join(location.root, location.id, 'SKILL.md'), 'utf-8')
      const parsed = parseSkillMarkdown(raw, location.id)
      skills.push({
        id: location.id,
        name: parsed.name,
        description: parsed.description,
        content: parsed.body,
        enabled: enabledSet.has(location.id),
        bundled: location.bundled
      })
    } catch {
      // skip invalid skill folders
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function saveSkillItem(skill: SkillItem): Promise<SkillItem> {
  const userRoot = getUserSkillsRoot()
  const id = skill.id.trim() || slugify(skill.name)
  const dir = join(userRoot, id)

  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    serializeSkillMarkdown({ name: skill.name, description: skill.description, body: skill.content }),
    'utf-8'
  )

  const enabledSkills = new Set(await resolveEnabledSkillIds((await collectSkillLocations()).map((item) => item.id)))
  if (skill.enabled) enabledSkills.add(id)
  else enabledSkills.delete(id)
  await saveConfig({ enabledSkills: [...enabledSkills], skillEnablementInitialized: true })

  return { ...skill, id, enabled: skill.enabled, bundled: false }
}

export async function deleteSkillItem(id: string): Promise<void> {
  const location = (await collectSkillLocations()).find((item) => item.id === id)
  if (!location) return
  if (location.bundled) {
    throw new Error('内置 Skill 不可删除，可在列表中禁用。')
  }

  await rm(join(location.root, id), { recursive: true, force: true })

  const enabledSkills = (await resolveEnabledSkillIds((await collectSkillLocations()).map((item) => item.id))).filter(
    (item) => item !== id
  )
  await saveConfig({ enabledSkills })
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  const enabledSkills = new Set(
    await resolveEnabledSkillIds((await collectSkillLocations()).map((item) => item.id))
  )

  if (enabled) {
    enabledSkills.add(id)
  } else {
    enabledSkills.delete(id)
  }

  await saveConfig({ enabledSkills: [...enabledSkills], skillEnablementInitialized: true })
}

export async function getEnabledSkillsText(): Promise<string> {
  const skills = await listSkills()
  const enabled = skills.filter((item) => item.enabled)
  if (enabled.length === 0) return '（未启用任何 Skill，请使用通用写作规范。）'

  return enabled
    .map(
      (skill) =>
        `### Skill: ${skill.name}\n${skill.description ? `> ${skill.description}\n\n` : ''}${skill.content}`
    )
    .join('\n\n---\n\n')
}
