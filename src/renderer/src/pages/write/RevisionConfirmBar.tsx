interface RevisionConfirmBarProps {
  instructionPreview?: string | null
  onApply: () => void
  onCancel: () => void
}

function previewInstruction(raw: string | null | undefined): string {
  if (!raw) return ''
  const lines = raw.replace(/^\*\*(修改说明|插图插入)\*\*[^\n]*\n?/, '').trim()
  if (!lines) return ''
  return lines.length > 80 ? `${lines.slice(0, 80)}…` : lines
}

export default function RevisionConfirmBar({
  instructionPreview,
  onApply,
  onCancel
}: RevisionConfirmBarProps) {
  const preview = previewInstruction(instructionPreview)

  return (
    <div className="revision-confirm-bar" role="region" aria-label="待确认修改">
      <div className="revision-confirm-copy">
        <strong>待确认修改</strong>
        <p>
          上方文章已按说明更新。看完预览后在此确认，无需再滚到对话底部。
          {preview ? <span className="revision-confirm-preview">{preview}</span> : null}
        </p>
      </div>
      <div className="revision-confirm-actions">
        <button type="button" className="revision-action-btn" onClick={onCancel}>
          取消修改
        </button>
        <button type="button" className="revision-action-btn is-primary" onClick={onApply}>
          应用修改
        </button>
      </div>
    </div>
  )
}
