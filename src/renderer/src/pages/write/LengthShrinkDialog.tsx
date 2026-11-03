import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface LengthShrinkSection {
  title: string
  words: number
}

export interface LengthShrinkChoice {
  title: string
  removeWords: number
}

const PERCENTS = [10, 20, 30, 40, 50] as const

function percentLabel(percent: number): string {
  if (percent <= 10) return '轻微'
  if (percent <= 20) return '适中'
  if (percent <= 30) return '较大'
  if (percent <= 40) return '大幅'
  return '很大'
}

interface LengthShrinkDialogProps {
  open: boolean
  sections: LengthShrinkSection[]
  onClose: () => void
  onConfirm: (choices: LengthShrinkChoice[]) => void
}

export default function LengthShrinkDialog({
  open,
  sections,
  onClose,
  onConfirm
}: LengthShrinkDialogProps) {
  const [selected, setSelected] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!open) return
    setSelected({})
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const choices = sections
    .filter((section) => selected[section.title] != null)
    .map((section) => ({
      title: section.title,
      removeWords: Math.max(1, Math.round((section.words * selected[section.title]) / 100))
    }))

  return createPortal(
    <div className="ui-overlay write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="ui-dialog length-shrink-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="length-shrink-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="length-shrink-title">选择要消减的章节</h3>
        <p className="length-shrink-desc">
          每节单独设置消减幅度。达到「较大」时，会在删减后重写衔接，保留步骤、图片和表格。
        </p>
        {sections.length === 0 ? (
          <p className="length-shrink-empty">当前文章没有可消减的章节。</p>
        ) : (
          <ul className="length-shrink-list">
            {sections.map((section) => {
              const percent = selected[section.title]
              const checked = percent != null
              return (
                <li key={section.title}>
                  <label className="length-shrink-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelected((current) => {
                          const next = { ...current }
                          if (next[section.title] != null) delete next[section.title]
                          else next[section.title] = 20
                          return next
                        })
                      }}
                    />
                    <span className="length-shrink-title">{section.title}</span>
                    <span className="length-shrink-words">{section.words} 词</span>
                  </label>
                  <label className="length-shrink-range">
                    <input
                      type="range"
                      min={PERCENTS[0]}
                      max={PERCENTS[PERCENTS.length - 1]}
                      step={10}
                      value={percent ?? 20}
                      disabled={!checked}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        setSelected((current) => ({ ...current, [section.title]: value }))
                      }}
                    />
                    <span>
                      {checked
                        ? `${percentLabel(percent)} · 约 ${Math.round((section.words * percent) / 100)} 词${percent >= 30 ? ' · 消减后优化行文' : ''}`
                        : '未选择'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        <div className="session-rename-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={choices.length === 0} onClick={() => onConfirm(choices)}>
            开始消减
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
