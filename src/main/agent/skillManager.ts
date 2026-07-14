import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { loadConfig, saveConfig } from '../config/configStore'
import type { PipelineMode, SkillItem, ModeEnabledSkillsConfig } from '../config/types'
import { parseSkillMarkdown, serializeSkillMarkdown } from '../agent/skillLoader'

export interface EnabledSkillBundle {
  id: string
  name: string
  description: string
  content: string
}

export const REVIEW_SKILL_ID = 'product-review'
export const OPTIMIZER_SKILL_ID = 'article-optimizer'
export const BATCH_OPTIMIZER_SKILL_ID = 'page-batch-optimizer'
/** @deprecated Split into STREAMING_DOMAIN_SKILL_ID + STREAMING_COMPLIANCE_SKILL_ID */
export const SEO_GEO_SKILL_ID = 'seo-geo-streaming-audio'
export const STREAMING_DOMAIN_SKILL_ID = 'streaming-audio-domain'
export const STREAMING_COMPLIANCE_SKILL_ID = 'streaming-audio-compliance'
export const IOS_GEO_SKILL_ID = 'seo-geo-ios-security'
export const STREAMING_TOP_SKILL_ID = 'seo-geo-streaming-top'

export const BUNDLED_SKILL_IDS = new Set([
  SEO_GEO_SKILL_ID,
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  IOS_GEO_SKILL_ID,
  STREAMING_TOP_SKILL_ID,
  REVIEW_SKILL_ID,
  OPTIMIZER_SKILL_ID,
  BATCH_OPTIMIZER_SKILL_ID
])

/** Disabled until the user explicitly enables them in settings (create mode). */
const SKILLS_DISABLED_BY_DEFAULT = new Set([
  REVIEW_SKILL_ID,
  OPTIMIZER_SKILL_ID,
  BATCH_OPTIMIZER_SKILL_ID,
  SEO_GEO_SKILL_ID,
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  IOS_GEO_SKILL_ID,
  STREAMING_TOP_SKILL_ID
])

/** Map legacy seo-geo-streaming-audio → domain + compliance on config read. */
export function migrateLegacyStreamingSkillIds(ids: string[]): string[] {
  if (!ids.includes(SEO_GEO_SKILL_ID)) return ids
  const next = ids.filter((id) => id !== SEO_GEO_SKILL_ID)
  if (!next.includes(STREAMING_DOMAIN_SKILL_ID)) next.push(STREAMING_DOMAIN_SKILL_ID)
  if (!next.includes(STREAMING_COMPLIANCE_SKILL_ID)) next.push(STREAMING_COMPLIANCE_SKILL_ID)
  return next
}

function skillIdSetsEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const id of sa) {
    if (!sb.has(id)) return false
  }
  return true
}

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
    if (BUNDLED_SKILL_IDS.has(id)) continue
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

function enabledSkillsConfigKey(mode: PipelineMode): keyof ModeEnabledSkillsConfig {
  if (mode === 'batch-optimize') return 'batchOptimize'
  return mode
}

function filterSkillIdsForMode(ids: string[], mode: PipelineMode): string[] {
  if (mode === 'optimize') {
    return ids.filter((id) => id === OPTIMIZER_SKILL_ID)
  }
  if (mode === 'batch-optimize') {
    return ids.filter((id) => id === BATCH_OPTIMIZER_SKILL_ID)
  }
  return ids.filter((id) => id !== OPTIMIZER_SKILL_ID && id !== BATCH_OPTIMIZER_SKILL_ID)
}

function filterLocationsForMode(locations: SkillLocation[], mode: PipelineMode): SkillLocation[] {
  if (mode === 'optimize') {
    return locations.filter((item) => item.id === OPTIMIZER_SKILL_ID)
  }
  if (mode === 'batch-optimize') {
    return locations.filter((item) => item.id === BATCH_OPTIMIZER_SKILL_ID)
  }
  return locations.filter(
    (item) => item.id !== OPTIMIZER_SKILL_ID && item.id !== BATCH_OPTIMIZER_SKILL_ID
  )
}

function defaultEnabledSkillsForMode(mode: PipelineMode, allIds: string[]): string[] {
  if (mode === 'optimize') {
    return allIds.includes(OPTIMIZER_SKILL_ID) ? [OPTIMIZER_SKILL_ID] : []
  }
  if (mode === 'batch-optimize') {
    return allIds.includes(BATCH_OPTIMIZER_SKILL_ID) ? [BATCH_OPTIMIZER_SKILL_ID] : []
  }

  return filterSkillIdsForMode(
    allIds.filter((id) => !SKILLS_DISABLED_BY_DEFAULT.has(id)),
    'create'
  )
}

async function ensureEnabledSkillsInitialized(allIds: string[]): Promise<void> {
  const config = await loadConfig()
  if (config.skillEnablementInitialized) return

  await saveConfig({
    enabledSkills: {
      create: defaultEnabledSkillsForMode('create', allIds),
      optimize: defaultEnabledSkillsForMode('optimize', allIds),
      batchOptimize: defaultEnabledSkillsForMode('batch-optimize', allIds)
    },
    skillEnablementInitialized: true
  })
}

async function persistCreateSkillMigrationIfNeeded(current: string[]): Promise<string[]> {
  const migrated = migrateLegacyStreamingSkillIds(current)
  if (skillIdSetsEqual(current, migrated)) return migrated

  const config = await loadConfig()
  await saveConfig({
    enabledSkills: {
      ...config.enabledSkills,
      create: migrated
    }
  })
  return migrated
}

async function getEnabledSkillIds(mode: PipelineMode, allIds: string[]): Promise<string[]> {
  await ensureEnabledSkillsInitialized(allIds)
  const config = await loadConfig()
  let enabled = config.enabledSkills[enabledSkillsConfigKey(mode)] ?? []
  if (mode === 'create') {
    enabled = await persistCreateSkillMigrationIfNeeded(enabled)
  }
  const filtered = filterSkillIdsForMode(
    enabled.filter((id) => allIds.includes(id)),
    mode
  )
  if (mode === 'batch-optimize' && filtered.length === 0) {
    return defaultEnabledSkillsForMode('batch-optimize', allIds)
  }
  return filtered
}

async function updateEnabledSkillIds(
  mode: PipelineMode,
  updater: (current: Set<string>) => void
): Promise<void> {
  const allIds = (await collectSkillLocations()).map((item) => item.id)
  await ensureEnabledSkillsInitialized(allIds)
  const config = await loadConfig()
  const next: Record<keyof ModeEnabledSkillsConfig, Set<string>> = {
    create: new Set(config.enabledSkills.create),
    optimize: new Set(config.enabledSkills.optimize),
    batchOptimize: new Set(config.enabledSkills.batchOptimize)
  }
  updater(next[enabledSkillsConfigKey(mode)])
  await saveConfig({
    enabledSkills: {
      create: filterSkillIdsForMode([...next.create], 'create'),
      optimize: filterSkillIdsForMode([...next.optimize], 'optimize'),
      batchOptimize: filterSkillIdsForMode([...next.batchOptimize], 'batch-optimize')
    },
    skillEnablementInitialized: true
  })
}

export async function listSkills(mode: PipelineMode = 'create'): Promise<SkillItem[]> {
  const locations = filterLocationsForMode(await collectSkillLocations(), mode)
  const allIds = locations.map((item) => item.id)
  const enabledSkills = await getEnabledSkillIds(mode, allIds)
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

export async function saveSkillItem(skill: SkillItem, mode: PipelineMode = 'create'): Promise<SkillItem> {
  const userRoot = getUserSkillsRoot()
  const id = skill.id.trim() || slugify(skill.name)
  if (BUNDLED_SKILL_IDS.has(id)) {
    throw new Error('内置 Skill 不可编辑，请在列表中查看或切换启用状态。')
  }
  const dir = join(userRoot, id)

  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    serializeSkillMarkdown({ name: skill.name, description: skill.description, body: skill.content }),
    'utf-8'
  )

  await updateEnabledSkillIds(mode, (enabledSkills) => {
    if (skill.enabled) enabledSkills.add(id)
    else enabledSkills.delete(id)
  })

  return { ...skill, id, enabled: skill.enabled, bundled: false }
}

export async function deleteSkillItem(id: string): Promise<void> {
  if (BUNDLED_SKILL_IDS.has(id)) {
    throw new Error('内置 Skill 不可删除，可在列表中禁用。')
  }

  const location = (await collectSkillLocations()).find((item) => item.id === id)
  if (!location) return
  if (location.bundled) {
    throw new Error('内置 Skill 不可删除，可在列表中禁用。')
  }

  await rm(join(location.root, id), { recursive: true, force: true })

  const config = await loadConfig()
  await saveConfig({
    enabledSkills: {
      create: config.enabledSkills.create.filter((item) => item !== id),
      optimize: config.enabledSkills.optimize.filter((item) => item !== id),
      batchOptimize: config.enabledSkills.batchOptimize.filter((item) => item !== id)
    }
  })
}

export async function setSkillEnabled(
  id: string,
  enabled: boolean,
  mode: PipelineMode = 'create'
): Promise<void> {
  if (mode === 'optimize' && id !== OPTIMIZER_SKILL_ID) return
  if (mode === 'batch-optimize' && id !== BATCH_OPTIMIZER_SKILL_ID) return
  if (mode === 'create' && (id === OPTIMIZER_SKILL_ID || id === BATCH_OPTIMIZER_SKILL_ID)) return

  await updateEnabledSkillIds(mode, (enabledSkills) => {
    if (enabled) enabledSkills.add(id)
    else enabledSkills.delete(id)
  })
}

export type ArticleTypeSkillSync = 'how-to' | 'review' | 'top-rank'

/** Atomically toggle create-mode skills tied to composer article type. */
export async function syncCreateSkillsForArticleType(articleType: ArticleTypeSkillSync): Promise<void> {
  await updateEnabledSkillIds('create', (enabledSkills) => {
    enabledSkills.delete(REVIEW_SKILL_ID)
    enabledSkills.delete(SEO_GEO_SKILL_ID)
    enabledSkills.delete(STREAMING_DOMAIN_SKILL_ID)
    enabledSkills.delete(STREAMING_COMPLIANCE_SKILL_ID)
    enabledSkills.delete(STREAMING_TOP_SKILL_ID)

    if (articleType === 'review') {
      enabledSkills.add(REVIEW_SKILL_ID)
    } else if (articleType === 'how-to') {
      enabledSkills.add(STREAMING_DOMAIN_SKILL_ID)
      enabledSkills.add(STREAMING_COMPLIANCE_SKILL_ID)
    } else if (articleType === 'top-rank') {
      enabledSkills.add(STREAMING_DOMAIN_SKILL_ID)
      enabledSkills.add(STREAMING_COMPLIANCE_SKILL_ID)
      enabledSkills.add(STREAMING_TOP_SKILL_ID)
    }
  })
}

async function buildEnabledSkillBundles(mode: PipelineMode): Promise<EnabledSkillBundle[]> {
  const skills = await listSkills(mode)
  return skills
    .filter((item) => item.enabled)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      content: skill.content
    }))
}

async function buildEnabledSkillsText(mode: PipelineMode): Promise<string> {
  const bundles = await buildEnabledSkillBundles(mode)
  if (bundles.length === 0) return '（未启用任何 Skill，请使用通用写作规范。）'

  return bundles
    .map(
      (skill) =>
        `### Skill: ${skill.name}\n${skill.description ? `> ${skill.description}\n\n` : ''}${skill.content}`
    )
    .join('\n\n---\n\n')
}

export async function getEnabledSkillBundles(mode: PipelineMode = 'create'): Promise<EnabledSkillBundle[]> {
  return buildEnabledSkillBundles(mode)
}

export async function getEnabledSkillsText(mode: PipelineMode = 'create'): Promise<string> {
  return buildEnabledSkillsText(mode)
}

export async function getEnabledSkillsTextForOptimize(): Promise<string> {
  return buildEnabledSkillsText('optimize')
}
