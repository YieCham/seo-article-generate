import { useEffect, useRef, useState } from 'react'

interface SessionRenameDialogProps {
  open: boolean
  initialTitle: string
  onConfirm: (title: string) => void
  onClose: () => void
}

export default function SessionRenameDialog({
  open,
  initialTitle,
  onConfirm,
  onClose
}: SessionRenameDialogProps) {
  const [value, setValue] = useState(initialTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setValue(initialTitle)
  }, [open, initialTitle])

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
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open])

  if (!open) return null

  function handleSubmit(): void {
    onConfirm(value.trim())
  }

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="session-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-rename-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-rename-title" className="write-mode-picker-title">
          重命名话题
        </h2>
        <input
          ref={inputRef}
          className="session-rename-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="输入话题名称"
        />
        <div className="session-rename-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" onClick={handleSubmit}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
