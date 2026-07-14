import { useEffect, useRef } from 'react'
import { WRITE_MODE_OPTIONS, type WriteMode } from '../../constants/writeMode'

interface WriteModePickerDialogProps {
  open: boolean
  onSelect: (mode: WriteMode) => void
  onClose: () => void
}

export default function WriteModePickerDialog({ open, onSelect, onClose }: WriteModePickerDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const firstButton = dialogRef.current?.querySelector('button')
    firstButton?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="write-mode-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="write-mode-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="write-mode-picker-title" className="write-mode-picker-title">
          选择对话类型
        </h2>
        <p className="write-mode-picker-desc">请选择本次新对话要进行的任务类型。</p>
        <div className="write-mode-picker-options">
          {WRITE_MODE_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className="write-mode-picker-option"
              onClick={() => onSelect(item.value)}
            >
              <span className="write-mode-picker-option-label">{item.label}</span>
              <span className="write-mode-picker-option-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
