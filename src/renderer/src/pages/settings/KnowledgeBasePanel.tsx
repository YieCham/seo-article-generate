import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeDoc } from '../../env.d'
import { formatTagInput, parseTagInput } from '../../../../shared/knowledgeBase'

interface KnowledgeBasePanelProps {
  visible: boolean
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onStatus: (message: string) => void
}

interface KnowledgeDraft {
  id: string
  title: string
  tags: string
  content: string
  enabled: boolean
}

const EMPTY_DRAFT: KnowledgeDraft = {
  id: '',
  title: '',
  tags: '',
  content: '',
  enabled: true
}

function toDraft(doc: KnowledgeDoc): KnowledgeDraft {
  return {
    id: doc.id,
    title: doc.title,
    tags: formatTagInput(doc.tags),
    content: doc.content,
    enabled: doc.enabled
  }
}

export default function KnowledgeBasePanel({
  visible,
  saving,
  onSavingChange,
  onStatus
}: KnowledgeBasePanelProps) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<KnowledgeDraft | null>(null)

  useEffect(() => {
    if (visible) void loadDocs()
  }, [visible])

  async function loadDocs(): Promise<void> {
    setLoading(true)
    try {
      setDocs(await window.app.listKnowledgeDocs())
    } catch {
      onStatus('知识库加载失败')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter((doc) => {
      const hay = `${doc.title}\n${doc.tags.join('\n')}\n${doc.content}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [docs, query])

  const enabledCount = docs.filter((doc) => doc.enabled).length

  async function handleSave(): Promise<void> {
    if (!editing) return
    if (!editing.title.trim()) {
      onStatus('请填写条目标题')
      return
    }
    if (!editing.content.trim()) {
      onStatus('请填写条目内容')
      return
    }
    onSavingChange(true)
    try {
      await window.app.saveKnowledgeDoc({
        id: editing.id || undefined,
        title: editing.title,
        tags: parseTagInput(editing.tags),
        content: editing.content,
        enabled: editing.enabled
      })
      setEditing(null)
      await loadDocs()
      onStatus('知识库条目已保存')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '知识库保存失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleToggle(id: string, enabled: boolean): Promise<void> {
    setDocs((prev) => prev.map((doc) => (doc.id === id ? { ...doc, enabled } : doc)))
    try {
      await window.app.setKnowledgeDocEnabled(id, enabled)
      onStatus(enabled ? '条目已启用' : '条目已禁用')
    } catch {
      await loadDocs()
      onStatus('条目状态更新失败')
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('确定删除该知识库条目？')) return
    try {
      await window.app.deleteKnowledgeDoc(id)
      if (editing?.id === id) setEditing(null)
      await loadDocs()
      onStatus('知识库条目已删除')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '知识库删除失败')
    }
  }

  async function handleImport(): Promise<void> {
    onSavingChange(true)
    try {
      const result = await window.app.importKnowledgeDocs()
      if (result.canceled) return
      if (result.imported.length === 0) {
        onStatus('所选文件为空，未导入')
        return
      }
      await loadDocs()
      onStatus(`已导入 ${result.imported.length} 条知识库条目`)
    } catch {
      onStatus('知识库导入失败')
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="section-title">知识库</h2>
            <p className="section-desc">
              存放产品事实、卖点、禁词与品牌口径。条目保存在本地。正文撰写到用户所选产品的介绍环节时，会按产品名匹配已启用条目的标题、标签或正文；匹配不到则不注入。进度里会显示「知识库：已匹配…」或「未匹配到…」。写作时请先选择产品。与 Skill
              不同：Skill 是写作规范，知识库是事实材料。
            </p>
          </div>
          <div className="section-actions">
            <button type="button" className="secondary" disabled={saving} onClick={() => void handleImport()}>
              导入文件
            </button>
            <button type="button" className="secondary" onClick={() => setEditing({ ...EMPTY_DRAFT })}>
              新建条目
            </button>
          </div>
        </div>

        <div className="kb-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、标签或正文"
            aria-label="搜索知识库"
          />
          <p className="kb-count">
            {loading ? '加载中…' : `共 ${docs.length} 条，已启用 ${enabledCount} 条`}
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-hint">
            {docs.length === 0
              ? '暂无知识库条目。可新建，或导入 Markdown / 文本文件。'
              : '没有匹配的条目，试试换个关键词。'}
          </p>
        ) : (
          <ul className="skill-list">
            {filtered.map((doc) => (
              <li key={doc.id} className="skill-item">
                <label className="skill-toggle">
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={doc.enabled}
                    onChange={(event) => void handleToggle(doc.id, event.target.checked)}
                  />
                  <span className="toggle-switch" aria-hidden="true" />
                  <span className="toggle-label">{doc.enabled ? '已启用' : '已禁用'}</span>
                </label>
                <div className="skill-meta">
                  <strong>{doc.title}</strong>
                  {doc.tags.length > 0 ? (
                    <span className="kb-tags">
                      {doc.tags.map((tag) => (
                        <span key={tag} className="kb-tag">
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span>无标签</span>
                  )}
                </div>
                <div className="skill-actions">
                  <button type="button" className="secondary" onClick={() => setEditing(toDraft(doc))}>
                    编辑
                  </button>
                  <button type="button" className="danger" onClick={() => void handleDelete(doc.id)}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <section className="panel">
          <h2 className="section-title">{editing.id ? '编辑条目' : '新建条目'}</h2>

          <label htmlFor="kbTitle">标题</label>
          <input
            id="kbTitle"
            value={editing.title}
            onChange={(event) => setEditing({ ...editing, title: event.target.value })}
            placeholder="例如：TuneFab 核心卖点"
          />

          <label htmlFor="kbTags">标签（用逗号分隔，便于之后按主题检索）</label>
          <input
            id="kbTags"
            value={editing.tags}
            onChange={(event) => setEditing({ ...editing, tags: event.target.value })}
            placeholder="产品，卖点，合规"
          />

          <label htmlFor="kbContent">内容（Markdown）</label>
          <textarea
            id="kbContent"
            rows={12}
            className="code-area"
            value={editing.content}
            onChange={(event) => setEditing({ ...editing, content: event.target.value })}
            placeholder={'记录事实、卖点、限制与禁词，例如：\n\n- 产品名必须使用 TuneFab\n- 不得承诺破解 DRM'}
          />

          <label className="skill-toggle inline-toggle">
            <input
              type="checkbox"
              className="toggle-input"
              checked={editing.enabled}
              onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span className="toggle-label">保存后启用此条目</span>
          </label>

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSave()}>
              保存条目
            </button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}
