import { useEffect, useMemo, useState } from 'react'
import type { SkillItem } from '../../env.d'
import { ARTICLE_TYPE_OPTIONS, type ArticleType } from '../../constants/articleTypes'
import {
  formatPackTermInput,
  isBuiltinDomainPackId,
  isPackBindableSkillId,
  normalizePackTerms,
  type DomainPack
} from '../../../../shared/domainPacks'
import { formatTagInput as formatKnowledgeTags, parseTagInput as parseKnowledgeTags } from '../../../../shared/knowledgeBase'

interface DomainPackPanelProps {
  visible: boolean
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onStatus: (message: string) => void
  onSaved?: () => void
}

interface PackDraft {
  id: string
  builtin: boolean
  name: string
  formats: ArticleType[]
  domainSkillIds: string[]
  complianceSkillIds: string[]
  formatSkillIds: Partial<Record<ArticleType, string[]>>
  styleHint: string
  bannedTerms: string
  preferredTerms: string
  searchHints: string
  excludeQueryTerms: string
  knowledgeTags: string
}

const EMPTY_DRAFT: PackDraft = {
  id: '',
  builtin: false,
  name: '',
  formats: ['how-to'],
  domainSkillIds: [],
  complianceSkillIds: [],
  formatSkillIds: {},
  styleHint: '',
  bannedTerms: '',
  preferredTerms: '',
  searchHints: '',
  excludeQueryTerms: '',
  knowledgeTags: ''
}

function toDraft(pack: DomainPack): PackDraft {
  return {
    id: pack.id,
    builtin: isBuiltinDomainPackId(pack.id),
    name: pack.name,
    formats: [...pack.formats],
    domainSkillIds: [...pack.domainSkillIds],
    complianceSkillIds: [...pack.complianceSkillIds],
    formatSkillIds: { ...pack.formatSkillIds },
    styleHint: pack.styleHint,
    bannedTerms: formatPackTermInput(pack.bannedTerms),
    preferredTerms: formatPackTermInput(pack.preferredTerms),
    searchHints: formatPackTermInput(pack.searchHints),
    excludeQueryTerms: formatPackTermInput(pack.excludeQueryTerms),
    knowledgeTags: formatKnowledgeTags(pack.knowledgeTags ?? [])
  }
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function SkillCheckList({
  skills,
  selected,
  onToggle
}: {
  skills: SkillItem[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  if (skills.length === 0) {
    return <p className="field-hint">暂无可绑定的创作 Skill。</p>
  }
  return (
    <div className="pack-skill-list">
      {skills.map((skill) => (
        <label key={skill.id} className="pack-check">
          <input
            type="checkbox"
            checked={selected.includes(skill.id)}
            onChange={() => onToggle(skill.id)}
          />
          <span>
            <strong>{skill.name}</strong>
            <em>{skill.id}</em>
          </span>
        </label>
      ))}
    </div>
  )
}

export default function DomainPackPanel({
  visible,
  saving,
  onSavingChange,
  onStatus,
  onSaved
}: DomainPackPanelProps) {
  const [packs, setPacks] = useState<DomainPack[]>([])
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<PackDraft | null>(null)

  async function loadPacks(): Promise<DomainPack[]> {
    const next = await window.app.listDomainPacks()
    setPacks(next)
    return next
  }

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    void Promise.all([loadPacks(), window.app.listSkills('create')])
      .then(([nextPacks, nextSkills]) => {
        setPacks(nextPacks)
        setSkills(nextSkills.filter((skill) => isPackBindableSkillId(skill.id)))
      })
      .catch(() => onStatus('领域包加载失败'))
      .finally(() => setLoading(false))
  }, [visible])

  const bindableSkills = skills
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return packs
    return packs.filter((pack) => {
      const hay = `${pack.name}\n${pack.id}\n${pack.domainSkillIds.join('\n')}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [packs, query])

  async function handleSave(): Promise<void> {
    if (!editing) return
    if (!editing.name.trim()) {
      onStatus('请填写领域包名称')
      return
    }
    if (editing.formats.length === 0) {
      onStatus('请至少选择一种文章类型')
      return
    }
    onSavingChange(true)
    try {
      const saved = await window.app.saveDomainPack({
        id: editing.id || undefined,
        name: editing.name,
        formats: editing.formats,
        domainSkillIds: editing.domainSkillIds,
        complianceSkillIds: editing.complianceSkillIds,
        formatSkillIds: editing.formatSkillIds,
        styleHint: editing.styleHint,
        bannedTerms: normalizePackTerms(editing.bannedTerms),
        preferredTerms: normalizePackTerms(editing.preferredTerms),
        searchHints: normalizePackTerms(editing.searchHints),
        excludeQueryTerms: normalizePackTerms(editing.excludeQueryTerms),
        knowledgeTags: parseKnowledgeTags(editing.knowledgeTags)
      })
      await loadPacks()
      setEditing(toDraft(saved))
      onStatus(editing.builtin ? '内置领域包已更新' : '领域包已保存')
      onSaved?.()
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '领域包保存失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (isBuiltinDomainPackId(id)) return
    if (!confirm('确定删除该自定义领域包？')) return
    try {
      await window.app.deleteDomainPack(id)
      if (editing?.id === id) setEditing(null)
      await loadPacks()
      onStatus('领域包已删除')
      onSaved?.()
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '领域包删除失败')
    }
  }

  async function handleRestore(id: string): Promise<void> {
    if (!confirm('将丢弃对此内置包的修改，恢复为代码默认值。确定继续？')) return
    onSavingChange(true)
    try {
      const restored = await window.app.restoreDomainPack(id)
      await loadPacks()
      setEditing(toDraft(restored))
      onStatus('已恢复为默认配置')
      onSaved?.()
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '恢复默认失败')
    } finally {
      onSavingChange(false)
    }
  }

  function toggleFormat(format: ArticleType): void {
    if (!editing) return
    const next = editing.formats.includes(format)
      ? editing.formats.filter((item) => item !== format)
      : [...editing.formats, format]
    setEditing({ ...editing, formats: next })
  }

  function toggleFormatSkill(format: ArticleType, skillId: string): void {
    if (!editing) return
    const current = editing.formatSkillIds[format] ?? []
    setEditing({
      ...editing,
      formatSkillIds: {
        ...editing.formatSkillIds,
        [format]: toggleId(current, skillId)
      }
    })
  }

  return (
    <>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="section-title">领域包</h2>
            <p className="section-desc">
              领域包决定创作时加载哪些 Skill、禁词、扩词提示，以及知识库按哪些标签过滤。内置包可直接修改，也可恢复默认；自定义包可绑定任意创作 Skill。
            </p>
          </div>
          <div className="section-actions">
            <button type="button" className="secondary" onClick={() => setEditing({ ...EMPTY_DRAFT })}>
              新建领域包
            </button>
          </div>
        </div>

        <div className="kb-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称或 ID"
            aria-label="搜索领域包"
          />
          <p className="kb-count">{loading ? '加载中…' : `共 ${packs.length} 个领域包`}</p>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-hint">
            {packs.length === 0 ? '暂无领域包。' : '没有匹配的领域包，试试换个关键词。'}
          </p>
        ) : (
          <ul className="skill-list">
            {filtered.map((pack) => (
              <li key={pack.id} className="skill-item">
                <div className="skill-meta">
                  <strong>
                    {pack.name}
                    {isBuiltinDomainPackId(pack.id) ? (
                      <span className="kb-tag pack-builtin-tag">内置</span>
                    ) : null}
                  </strong>
                  <span>{pack.id}</span>
                </div>
                <div className="skill-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(toDraft(pack))}>
                    编辑
                  </button>
                  {isBuiltinDomainPackId(pack.id) ? null : (
                    <button type="button" className="danger" onClick={() => void handleDelete(pack.id)}>
                      删除
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <section className="panel">
          <h2 className="section-title">{editing.id ? (editing.builtin ? '编辑内置包' : '编辑领域包') : '新建领域包'}</h2>
          {editing.id ? <p className="field-hint">ID：{editing.id}（不可更改）</p> : null}

          <label htmlFor="packName">名称</label>
          <input
            id="packName"
            value={editing.name}
            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
            placeholder="例如：播客转写"
          />

          <p className="subsection-title">可用体裁</p>
          <div className="pack-check-grid">
            {ARTICLE_TYPE_OPTIONS.map((item) => (
              <label key={item.value} className="pack-check">
                <input
                  type="checkbox"
                  checked={editing.formats.includes(item.value)}
                  onChange={() => toggleFormat(item.value)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <p className="subsection-title">领域 Skill（始终加载）</p>
          <SkillCheckList
            skills={bindableSkills}
            selected={editing.domainSkillIds}
            onToggle={(id) =>
              setEditing({ ...editing, domainSkillIds: toggleId(editing.domainSkillIds, id) })
            }
          />

          <p className="subsection-title">合规 Skill（始终加载）</p>
          <SkillCheckList
            skills={bindableSkills}
            selected={editing.complianceSkillIds}
            onToggle={(id) =>
              setEditing({
                ...editing,
                complianceSkillIds: toggleId(editing.complianceSkillIds, id)
              })
            }
          />

          {ARTICLE_TYPE_OPTIONS.filter((item) => editing.formats.includes(item.value)).map((item) => (
            <div key={item.value}>
              <p className="subsection-title">体裁附加 · {item.label}</p>
              <SkillCheckList
                skills={bindableSkills}
                selected={editing.formatSkillIds[item.value] ?? []}
                onToggle={(id) => toggleFormatSkill(item.value, id)}
              />
            </div>
          ))}

          <label htmlFor="packStyle">风格提示 styleHint</label>
          <textarea
            id="packStyle"
            rows={4}
            value={editing.styleHint}
            onChange={(event) => setEditing({ ...editing, styleHint: event.target.value })}
            placeholder="写入该领域的语气、术语与禁止声称"
          />

          <label htmlFor="packBanned">禁词（逗号分隔）</label>
          <input
            id="packBanned"
            value={editing.bannedTerms}
            onChange={(event) => setEditing({ ...editing, bannedTerms: event.target.value })}
            placeholder="DRM，crack"
          />

          <label htmlFor="packPreferred">推荐替代表述（逗号分隔）</label>
          <input
            id="packPreferred"
            value={editing.preferredTerms}
            onChange={(event) => setEditing({ ...editing, preferredTerms: event.target.value })}
            placeholder="format limitations，playback restrictions"
          />

          <label htmlFor="packHints">扩词 searchHints（逗号分隔）</label>
          <input
            id="packHints"
            value={editing.searchHints}
            onChange={(event) => setEditing({ ...editing, searchHints: event.target.value })}
            placeholder="Spotify，converter，offline listening"
          />

          <label htmlFor="packExclude">扩词排除 excludeQueryTerms（逗号分隔）</label>
          <input
            id="packExclude"
            value={editing.excludeQueryTerms}
            onChange={(event) => setEditing({ ...editing, excludeQueryTerms: event.target.value })}
            placeholder="jailbreak，DRM"
          />

          <label htmlFor="packTags">知识库标签 knowledgeTags（逗号分隔）</label>
          <input
            id="packTags"
            value={editing.knowledgeTags}
            onChange={(event) => setEditing({ ...editing, knowledgeTags: event.target.value })}
            placeholder="streaming，audio"
          />
          <p className="field-hint">
            有标签时，草稿只注入带其中任一标签的知识库条目；留空则仍按产品名检索全部启用条目。
          </p>

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSave()}>
              保存领域包
            </button>
            {editing.builtin && editing.id ? (
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => void handleRestore(editing.id)}
              >
                恢复默认
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}
