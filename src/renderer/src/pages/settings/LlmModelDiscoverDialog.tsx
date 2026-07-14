import { useEffect, useMemo, useState } from 'react'
import type { LlmModelBrandGroup } from '../../env.d'
import { LlmModelIcon, LlmVendorIcon } from '../../components/LlmBrandIcon'

const ADD_MODEL_ICON = '/添加大模型.svg'
const ADDED_MODEL_ICON = '/大模型已添加.svg'

interface LlmModelDiscoverDialogProps {
  open: boolean
  presetId: string
  existingModels: string[]
  onClose: () => void
  onAddModel: (model: string) => void
}

export default function LlmModelDiscoverDialog({
  open,
  presetId,
  existingModels,
  onClose,
  onAddModel
}: LlmModelDiscoverDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<LlmModelBrandGroup[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError('')
    setGroups([])
    setTotal(0)
    setQuery('')

    void window.app.listLlmModels(presetId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message ?? '检索失败')
        setLoading(false)
        return
      }
      setGroups(result.groups ?? [])
      setTotal(result.total ?? 0)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, presetId])

  const filteredGroups = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return groups

    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) => model.toLowerCase().includes(keyword))
      }))
      .filter((group) => group.models.length > 0)
  }, [groups, query])

  const visibleCount = filteredGroups.reduce((sum, group) => sum + group.models.length, 0)

  if (!open) return null

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="llm-model-discover-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-model-discover-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="llm-model-discover-header">
          <div>
            <h2 id="llm-model-discover-title" className="write-mode-picker-title">
              检索可用模型
            </h2>
            <p className="write-mode-picker-desc">
              根据当前预设的 Base URL 与 API Key 拉取模型列表，并按品牌分组展示。
            </p>
          </div>
          <button type="button" className="llm-model-discover-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <input
          className="llm-model-discover-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索模型名称…"
          disabled={loading || Boolean(error)}
        />

        {loading ? <p className="llm-model-discover-status">正在检索模型…</p> : null}
        {!loading && error ? <p className="llm-model-discover-error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <p className="llm-model-discover-meta">
              共 {total} 个模型{query.trim() ? `，当前显示 ${visibleCount} 个` : ''}
            </p>
            <div className="llm-model-discover-groups">
              {filteredGroups.length === 0 ? (
                <p className="llm-model-discover-status">没有匹配的模型</p>
              ) : (
                filteredGroups.map((group) => (
                  <section key={group.brand} className="llm-model-discover-group">
                    <h3 className="llm-model-discover-brand">
                      <LlmVendorIcon brand={group.brand} size={18} className="llm-model-discover-brand-icon" />
                      <span>{group.brand}</span>
                    </h3>
                    <div className="llm-model-discover-items">
                      {group.models.map((model) => {
                        const added = existingModels.includes(model)
                        return (
                          <div key={model} className="llm-model-discover-item">
                            <div className="llm-model-discover-item-main">
                              <LlmModelIcon
                                model={model}
                                brand={group.brand}
                                size={16}
                                className="llm-model-discover-item-icon"
                              />
                              <span className="llm-model-discover-item-name">{model}</span>
                            </div>
                            <button
                              type="button"
                              className={`llm-model-discover-add${added ? ' is-added' : ''}`}
                              disabled={added}
                              onClick={() => onAddModel(model)}
                              aria-label={added ? '已添加' : `添加 ${model}`}
                              title={added ? '已添加' : '添加模型'}
                            >
                              <img
                                src={added ? ADDED_MODEL_ICON : ADD_MODEL_ICON}
                                alt=""
                                width={14}
                                height={14}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
