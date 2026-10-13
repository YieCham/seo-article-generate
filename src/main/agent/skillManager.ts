import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { app } from 'electron'
import { join } from 'path'
import { getArticleAgentRoot, getArticleUserDataDir } from '../paths'
import { loadConfig, saveConfig } from '../config/configStore'
import type { PipelineMode, SkillItem, ModeEnabledSkillsConfig, SkillListMode } from '../config/types'
import { parseSkillMarkdown, serializeSkillMarkdown } from '../agent/skillLoader'
import {
  clampFormatForPack,
  isPackOwnedSkillId,
  skillIdsForPack,
  type ArticleType,
  type DomainPackId
} from '../../shared/domainPacks'
import { resolveStoredDomainPack } from '../domainPack/domainPackStore'

export type { SkillListMode }

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
export const EXPLAINER_VOICE_SKILL_ID = 'explainer-voice'
export const HUMANIZER_SKILL_ID = 'humanizer'

/** Writing-style skills: listed under「写作风格」, enabled state stored in create. */
export const WRITING_STYLE_SKILL_IDS = new Set([EXPLAINER_VOICE_SKILL_ID, HUMANIZER_SKILL_ID])

/** Always injected at create-pipeline polish; not selectable as a composer voice. */
export const POLISH_FORCE_SKILL_IDS = new Set([HUMANIZER_SKILL_ID])

export function isWritingStyleSkillId(id: string): boolean {
  return WRITING_STYLE_SKILL_IDS.has(id)
}

export function isPolishForceSkillId(id: string): boolean {
  return POLISH_FORCE_SKILL_IDS.has(id)
}

export const BUNDLED_SKILL_IDS = new Set([
  SEO_GEO_SKILL_ID,
  STREAMING_DOMAIN_SKILL_ID,
  STREAMING_COMPLIANCE_SKILL_ID,
  IOS_GEO_SKILL_ID,
  STREAMING_TOP_SKILL_ID,
  REVIEW_SKILL_ID,
  OPTIMIZER_SKILL_ID,
  BATCH_OPTIMIZER_SKILL_ID,
  EXPLAINER_VOICE_SKILL_ID,
  HUMANIZER_SKILL_ID
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
  STREAMING_TOP_SKILL_ID,
  EXPLAINER_VOICE_SKILL_ID,
  HUMANIZER_SKILL_ID
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
  return join(getArticleUserDataDir(), 'skills')
}

function resolveBundledSkillsRoot(): string | null {
  const articleRoot = getArticleAgentRoot()
  const candidates = [
    articleRoot ? join(articleRoot, 'out/main/bundled-skills') : null,
    articleRoot ? join(articleRoot, 'src/main/bundled-skills') : null,
    articleRoot ? join(articleRoot, '.cursor', 'skills') : null,
    join(__dirname, 'bundled-skills'),
    join(__dirname, '..', 'bundled-skills'),
    join(app.getAppPath(), 'src/main/bundled-skills'),
    join(app.getAppPath(), '.cursor', 'skills')
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
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

function resolveStorageMode(mode: SkillListMode): PipelineMode {
  return mode === 'writing-style' ? 'create' : mode
}

function filterSkillIdsForMode(ids: string[], mode: SkillListMode): string[] {
  if (mode === 'optimize') {
    return ids.filter((id) => id === OPTIMIZER_SKILL_ID)
  }
  if (mode === 'batch-optimize') {
    return ids.filter((id) => id === BATCH_OPTIMIZER_SKILL_ID)
  }
  if (mode === 'writing-style') {
    return ids.filter((id) => isWritingStyleSkillId(id))
  }
  return ids.filter(
    (id) =>
      id !== OPTIMIZER_SKILL_ID &&
      id !== BATCH_OPTIMIZER_SKILL_ID &&
      !isWritingStyleSkillId(id)
  )
}

function filterLocationsForMode(locations: SkillLocation[], mode: SkillListMode): SkillLocation[] {
  if (mode === 'optimize') {
    return locations.filter((item) => item.id === OPTIMIZER_SKILL_ID)
  }
  if (mode === 'batch-optimize') {
    return locations.filter((item) => item.id === BATCH_OPTIMIZER_SKILL_ID)
  }
  if (mode === 'writing-style') {
    return locations.filter((item) => isWritingStyleSkillId(item.id))
  }
  return locations.filter(
    (item) =>
      item.id !== OPTIMIZER_SKILL_ID &&
      item.id !== BATCH_OPTIMIZER_SKILL_ID &&
      !isWritingStyleSkillId(item.id)
  )
}

function defaultEnabledSkillsForMode(mode: PipelineMode, allIds: string[]): string[] {
  if (mode === 'optimize') {
    return allIds.includes(OPTIMIZER_SKILL_ID) ? [OPTIMIZER_SKILL_ID] : []
  }
  if (mode === 'batch-optimize') {
    return allIds.includes(BATCH_OPTIMIZER_SKILL_ID) ? [BATCH_OPTIMIZER_SKILL_ID] : []
  }

  // Create defaults: domain skills only (writing-style stays off until user enables)
  return allIds.filter(
    (id) =>
      !SKILLS_DISABLED_BY_DEFAULT.has(id) &&
      id !== OPTIMIZER_SKILL_ID &&
      id !== BATCH_OPTIMIZER_SKILL_ID
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

async function getEnabledSkillIds(mode: SkillListMode, locationIds: string[]): Promise<string[]> {
  const allIds = (await collectSkillLocations()).map((item) => item.id)
  await ensureEnabledSkillsInitialized(allIds)
  const config = await loadConfig()
  const storageMode = resolveStorageMode(mode)
  let enabled = config.enabledSkills[enabledSkillsConfigKey(storageMode)] ?? []
  if (storageMode === 'create') {
    enabled = await persistCreateSkillMigrationIfNeeded(enabled)
  }
  const filtered = filterSkillIdsForMode(
    enabled.filter((id) => locationIds.includes(id)),
    mode
  )
  if (mode === 'batch-optimize' && filtered.length === 0) {
    return defaultEnabledSkillsForMode('batch-optimize', allIds)
  }
  return filtered
}

function sanitizePersistedCreateIds(ids: string[]): string[] {
  return ids.filter((id) => id !== OPTIMIZER_SKILL_ID && id !== BATCH_OPTIMIZER_SKILL_ID)
}

async function updateEnabledSkillIds(
  mode: SkillListMode,
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
  updater(next[enabledSkillsConfigKey(resolveStorageMode(mode))])
  await saveConfig({
    enabledSkills: {
      create: sanitizePersistedCreateIds([...next.create]),
      optimize: filterSkillIdsForMode([...next.optimize], 'optimize'),
      batchOptimize: filterSkillIdsForMode([...next.batchOptimize], 'batch-optimize')
    },
    skillEnablementInitialized: true
  })
}

export async function listSkills(mode: SkillListMode = 'create'): Promise<SkillItem[]> {
  const locations = filterLocationsForMode(await collectSkillLocations(), mode)
  const locationIds = locations.map((item) => item.id)
  const enabledSkills = await getEnabledSkillIds(mode, locationIds)
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
        enabled: isPolishForceSkillId(location.id) ? true : enabledSet.has(location.id),
        bundled: location.bundled,
        forced: isPolishForceSkillId(location.id),
        packLocked: isPackOwnedSkillId(location.id)
      })
    } catch {
      // skip invalid skill folders
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function saveSkillItem(skill: SkillItem, mode: SkillListMode = 'create'): Promise<SkillItem> {
  if (mode === 'writing-style') {
    throw new Error('写作风格分类仅支持启用内置 Skill，请在「文章创作」中新建自定义 Skill。')
  }
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
  mode: SkillListMode = 'create'
): Promise<void> {
  if (isPolishForceSkillId(id)) return
  if (mode === 'create' && isPackOwnedSkillId(id)) return
  if (mode === 'optimize' && id !== OPTIMIZER_SKILL_ID) return
  if (mode === 'batch-optimize' && id !== BATCH_OPTIMIZER_SKILL_ID) return
  if (mode === 'writing-style' && !isWritingStyleSkillId(id)) return
  if (
    mode === 'create' &&
    (id === OPTIMIZER_SKILL_ID || id === BATCH_OPTIMIZER_SKILL_ID || isWritingStyleSkillId(id))
  ) {
    return
  }

  await updateEnabledSkillIds(mode, (enabledSkills) => {
    if (enabled) enabledSkills.add(id)
    else enabledSkills.delete(id)
  })
}

async function buildEnabledSkillBundles(mode: PipelineMode): Promise<EnabledSkillBundle[]> {
  const skills = await listSkills(mode)
  return skills
    .filter((item) => item.enabled && !item.packLocked)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      content: skill.content
    }))
}

export async function loadSkillBundleById(id: string): Promise<EnabledSkillBundle | null> {
  const location = (await collectSkillLocations()).find((item) => item.id === id)
  if (!location) return null
  try {
    const raw = await readFile(join(location.root, location.id, 'SKILL.md'), 'utf-8')
    const parsed = parseSkillMarkdown(raw, location.id)
    return {
      id: location.id,
      name: parsed.name,
      description: parsed.description,
      content: parsed.body
    }
  } catch {
    return null
  }
}

export interface CreateSkillBundleOptions {
  domainPackId?: DomainPackId | string | null
  articleType?: ArticleType | string | null
  writingStyleSkillId?: string | null
}

/**
 * Create-pipeline skills: domain pack + extra custom settings skills + composer writing style.
 * Pack-owned Skill toggles in settings are ignored.
 */
export async function getCreateSkillBundles(
  options?: CreateSkillBundleOptions | string | null
): Promise<EnabledSkillBundle[]> {
  const resolved: CreateSkillBundleOptions =
    typeof options === 'string' || options == null
      ? { writingStyleSkillId: options }
      : options

  const pack = await resolveStoredDomainPack(resolved.domainPackId)
  const format = clampFormatForPack(pack, resolved.articleType)
  const packIds = skillIdsForPack(pack, format)

  const bundles: EnabledSkillBundle[] = []
  const seen = new Set<string>()

  for (const id of packIds) {
    const bundle = await loadSkillBundleById(id)
    if (!bundle || seen.has(bundle.id)) continue
    seen.add(bundle.id)
    bundles.push(bundle)
  }

  const extras = await listSkills('create')
  for (const skill of extras) {
    if (!skill.enabled) continue
    if (isPackOwnedSkillId(skill.id) || isWritingStyleSkillId(skill.id) || isPolishForceSkillId(skill.id)) {
      continue
    }
    if (seen.has(skill.id)) continue
    seen.add(skill.id)
    bundles.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      content: skill.content
    })
  }

  const styleId = resolved.writingStyleSkillId?.trim() ?? ''
  if (!styleId || !isWritingStyleSkillId(styleId) || isPolishForceSkillId(styleId) || seen.has(styleId)) {
    return bundles
  }

  const style = await loadSkillBundleById(styleId)
  if (!style) return bundles
  return [...bundles, style]
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
