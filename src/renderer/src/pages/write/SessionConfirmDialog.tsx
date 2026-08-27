import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type SessionConfirmAction = 'clear' | 'delete' | 'regenerate'

export interface RegenerateConfirmOptions {
  forceRefreshResearch: boolean
}

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
  },
  regenerate: {
    title: '重新生成',
    message: '将根据最初的用户请求重新生成文章，当前对话内容将被替换。此操作不可撤销。',
    confirmLabel: '确定重新生成'
  }
}

interface SessionConfirmDialogProps {
  open: boolean
  action: SessionConfirmAction | null
  sessionTitle: string
  /** When regenerating a session that already has a research pack. */
  hasResearchPack?: boolean
  onConfirm: (options?: RegenerateConfirmOptions) => void
  onClose: () => void
}

export default function SessionConfirmDialog({
  open,
  action,
  sessionTitle,
  hasResearchPack = false,
  onConfirm,
  onClose
}: SessionConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [forceRefreshResearch, setForceRefreshResearch] = useState(false)

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
    setForceRefreshResearch(false)
    cancelRef.current?.focus()
  }, [open, action])

  if (!open || !action) return null

  const copy = CONFIRM_COPY[action]
  const showResearchToggle = action === 'regenerate' && hasResearchPack

  return createPortal(
    <div className="ui-overlay write-mode-picker-backdrop" onClick={onClose}>
      <div
        className="ui-dialog session-rename-dialog session-confirm-dialog"
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
          {showResearchToggle ? (
            <>
              <br />
              默认复用上次调研结果，不消耗 Tavily / Firecrawl 额度。
            </>
          ) : null}
          {sessionTitle ? (
            <>
              <br />
              <span className="session-confirm-topic">「{sessionTitle}」</span>
            </>
          ) : null}
        </p>
        {showResearchToggle ? (
          <label className="session-confirm-checkbox">
            <input
              type="checkbox"
              checked={forceRefreshResearch}
              onChange={(event) => setForceRefreshResearch(event.target.checked)}
            />
            <span>重新拉取调研（消耗 Tavily / Firecrawl 额度）</span>
          </label>
        ) : null}
        <div className="session-rename-actions session-confirm-actions">
          <button ref={cancelRef} type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={action === 'delete' ? 'danger' : undefined}
            onClick={() => {
              if (action === 'regenerate') {
                onConfirm({ forceRefreshResearch: showResearchToggle ? forceRefreshResearch : true })
              } else {
                onConfirm()
              }
            }}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
