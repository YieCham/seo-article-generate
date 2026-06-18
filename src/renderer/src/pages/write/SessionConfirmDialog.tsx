import { useEffect, useRef } from 'react'

export type SessionConfirmAction = 'clear' | 'delete'

const CONFIRM_COPY: Record<
  SessionConfirmAction,
  { title: string; message: string; confirmLabel: string }
> = {
  clear: {
    title: '清空话题',
    message: '确定要清空该话题的所有对话内容吗？此操作不可撤销。',
    confirmLabel: '确定清空'
  },
  delete: {
    title: '删除话题',
    message: '确定要删除该话题吗？删除后无法恢复。',
    confirmLabel: '确定删除'
  }
}

interface SessionConfirmDialogProps {
  open: boolean
  action: SessionConfirmAction | null
  sessionTitle: string
  onConfirm: () => void
  onClose: () => void
}

export default function SessionConfirmDialog({
  open,
  action,
  sessionTitle,
  onConfirm,
  onClose
}: SessionConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

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
    cancelRef.current?.focus()
  }, [open])

  if (!open || !action) return null

  const copy = CONFIRM_COPY[action]

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="session-rename-dialog session-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-confirm-title"
        aria-describedby="session-confirm-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-confirm-title" className="write-mode-picker-title">
          {copy.title}
        </h2>
        <p id="session-confirm-desc" className="session-confirm-desc">
          {copy.message}
          {sessionTitle ? (
            <>
              <br />
              <span className="session-confirm-topic">「{sessionTitle}」</span>
            </>
          ) : null}
        </p>
        <div className="session-rename-actions session-confirm-actions">
          <button ref={cancelRef} type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={action === 'delete' ? 'danger' : undefined}
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
