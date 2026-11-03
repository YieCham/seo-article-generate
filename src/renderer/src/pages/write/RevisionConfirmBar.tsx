interface RevisionConfirmBarProps {
  instructionPreview?: string | null
  onApply: () => void
  onCancel: () => void
  mode?: 'revision' | 'length'
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
  onCancel,
  mode = 'revision'
}: RevisionConfirmBarProps) {
  const preview = previewInstruction(instructionPreview)
  const isLength = mode === 'length'

  return (
    <div className="revision-confirm-bar" role="region" aria-label={isLength ? '待确认词数校准' : '待确认修改'}>
      <div className="revision-confirm-copy">
        <strong>{isLength ? '待确认词数校准' : '待确认修改'}</strong>
        <p>
          {isLength
            ? '正文已按章节补丁预览。确认后写入终稿；忽略则回到校准前正文。'
            : '上方文章已按说明更新。看完预览后在此确认，无需再滚到对话底部。'}
          {preview ? <span className="revision-confirm-preview">{preview}</span> : null}
        </p>
      </div>
      <div className="revision-confirm-actions">
        <button type="button" className="revision-action-btn" onClick={onCancel}>
          {isLength ? '忽略' : '取消修改'}
        </button>
        <button type="button" className="revision-action-btn is-primary" onClick={onApply}>
          {isLength ? '全部应用' : '应用修改'}
        </button>
      </div>
    </div>
  )
}
