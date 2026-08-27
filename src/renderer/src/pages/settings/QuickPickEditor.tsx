import { useEffect, useRef, useState } from 'react'
import type { QuickPickOption, WordPressPreset } from '../../env.d'

interface QuickPickEditorProps {
  title: string
  description: string
  items: QuickPickOption[]
  wordpressPresets?: WordPressPreset[]
  disabled?: boolean
  onAdd: (label: string) => void
  onRemove: (id: string) => void
  onBindWordPressPreset?: (productId: string, wordpressPresetId: string | undefined) => void
}

export default function QuickPickEditor({
  title,
  description,
  items,
  wordpressPresets = [],
  disabled,
  onAdd,
  onRemove,
  onBindWordPressPreset
}: QuickPickEditorProps) {
  const [draft, setDraft] = useState('')
  const [bindingProductId, setBindingProductId] = useState<string | null>(null)
  const [draftPresetId, setDraftPresetId] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)

  const bindingProduct = items.find((item) => item.id === bindingProductId) ?? null

  useEffect(() => {
    if (!bindingProductId) return
    const product = items.find((item) => item.id === bindingProductId)
    setDraftPresetId(product?.wordpressPresetId ?? '')
    cancelRef.current?.focus()
  }, [bindingProductId, items])

  useEffect(() => {
    if (!bindingProductId) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setBindingProductId(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bindingProductId])

  function handleAdd(): void {
    const label = draft.trim()
    if (!label || disabled) return
    onAdd(label)
    setDraft('')
  }

  function presetName(presetId: string | undefined): string | null {
    if (!presetId) return null
    return wordpressPresets.find((item) => item.id === presetId)?.name ?? null
  }

  function handleConfirmBind(): void {
    if (!bindingProductId || !onBindWordPressPreset) return
    onBindWordPressPreset(bindingProductId, draftPresetId || undefined)
    setBindingProductId(null)
  }

  return (
    <section className="panel quick-pick-panel">
      <h2 className="section-title">{title}</h2>
      <p className="section-desc">{description}</p>

      <div className="quick-pick-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
        />
        <button type="button" className="secondary" disabled={disabled || !draft.trim()} onClick={handleAdd}>
          添加
        </button>
      </div>

      {items.length === 0 ? (
        <p className="empty-hint">暂无选项，请在上方输入并添加。</p>
      ) : (
        <ul className="quick-pick-list">
          {items.map((item) => {
            const boundName = presetName(item.wordpressPresetId)
            return (
              <li key={item.id} className="quick-pick-item">
                <div className="quick-pick-item-main">
                  <span>{item.label}</span>
                  {boundName ? (
                    <span className="quick-pick-bind-tag" title={`已绑定 WordPress 预设：${boundName}`}>
                      WP · {boundName}
                    </span>
                  ) : null}
                </div>
                <div className="quick-pick-item-actions">
                  {onBindWordPressPreset ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={disabled || wordpressPresets.length === 0}
                      title={
                        wordpressPresets.length === 0
                          ? '请先在 WordPress 设置中添加站点预设'
                          : '绑定 WordPress 预设'
                      }
                      onClick={() => setBindingProductId(item.id)}
                    >
                      绑定
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    disabled={disabled}
                    onClick={() => onRemove(item.id)}
                  >
                    删除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {bindingProduct && onBindWordPressPreset ? (
        <div className="ui-overlay write-mode-picker-backdrop" onClick={() => setBindingProductId(null)}>
          <div
            className="ui-dialog session-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-wp-bind-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="product-wp-bind-title" className="write-mode-picker-title">
              绑定 WordPress 预设
            </h2>
            <p className="session-confirm-desc">
              产品「{bindingProduct.label}」在创作页被选中时，推送 WordPress 将默认使用该预设。
            </p>
            <label htmlFor="productWpPreset">WordPress 预设</label>
            <select
              id="productWpPreset"
              className="session-rename-input"
              value={draftPresetId}
              onChange={(event) => setDraftPresetId(event.target.value)}
            >
              <option value="">不绑定</option>
              {wordpressPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.siteUrl ? ` · ${preset.siteUrl}` : ''}
                </option>
              ))}
            </select>
            <div className="session-rename-actions">
              <button
                ref={cancelRef}
                type="button"
                className="secondary"
                onClick={() => setBindingProductId(null)}
              >
                取消
              </button>
              <button type="button" disabled={disabled} onClick={handleConfirmBind}>
                保存绑定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
