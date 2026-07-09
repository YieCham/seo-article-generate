import { useEffect, useRef, useState } from 'react'
import { IconClose } from './Icons'

interface CloseConfirmDialogProps {
  open: boolean
  onClose: () => void
  onMinimizeToTray: (remember: boolean) => void
  onQuit: (remember: boolean) => void
}

export default function CloseConfirmDialog({
  open,
  onClose,
  onMinimizeToTray,
  onQuit
}: CloseConfirmDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (!open) return
    setRemember(false)
  }, [open])

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
    closeRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="session-rename-dialog close-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-confirm-title"
        aria-describedby="close-confirm-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="close-confirm-header">
          <h2 id="close-confirm-title" className="write-mode-picker-title">
            关闭确认
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="close-confirm-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconClose size={10} />
          </button>
        </div>
        <p id="close-confirm-desc" className="session-confirm-desc close-confirm-desc">
          您希望最小化到系统托盘，还是退出程序？
        </p>
        <div className="close-confirm-footer">
          <label className="close-confirm-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>以后不再提示</span>
          </label>
          <div className="close-confirm-actions">
            <button type="button" onClick={() => onMinimizeToTray(remember)}>
              最小化到托盘
            </button>
            <button type="button" className="danger" onClick={() => onQuit(remember)}>
              退出程序
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
