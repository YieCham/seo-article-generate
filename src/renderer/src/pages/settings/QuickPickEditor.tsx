import { useState } from 'react'
import type { QuickPickOption } from '../../env.d'

interface QuickPickEditorProps {
  title: string
  description: string
  placeholder: string
  items: QuickPickOption[]
  disabled?: boolean
  onAdd: (label: string) => void
  onRemove: (id: string) => void
}

export default function QuickPickEditor({
  title,
  description,
  placeholder,
  items,
  disabled,
  onAdd,
  onRemove
}: QuickPickEditorProps) {
  const [draft, setDraft] = useState('')

  function handleAdd(): void {
    const label = draft.trim()
    if (!label || disabled) return
    onAdd(label)
    setDraft('')
  }

  return (
    <section className="panel quick-pick-panel">
      <h2 className="section-title">{title}</h2>
      <p className="section-desc">{description}</p>

      <div className="quick-pick-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
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
          {items.map((item) => (
            <li key={item.id} className="quick-pick-item">
              <span>{item.label}</span>
              <button
                type="button"
                className="danger"
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
