import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { RewriteArticleSectionRequest, SectionEditMode } from '../../env.d'
import {
  getMarkdownOffsetFromClick,
  getMarkdownRangeFromDomSelection
} from '../../utils/markdownSourceMap'

interface ArticleSectionEditorProps {
  content: string
  articleRef: RefObject<HTMLDivElement | null>
  topic?: string
  outputLanguage?: string
  disabled?: boolean
  onApply: (updatedContent: string) => void
  onBusyChange?: (busy: boolean) => void
  onOpenChange?: (open: boolean) => void
  onDraftChange?: (draft: string) => void
}

export default function ArticleSectionEditor({
  content,
  articleRef,
  topic,
  outputLanguage,
  disabled = false,
  onApply,
  onBusyChange,
  onOpenChange,
  onDraftChange
}: ArticleSectionEditorProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(content)
  const [mode, setMode] = useState<SectionEditMode>('rewrite')
  const [instruction, setInstruction] = useState('')
  const [selectionStart, setSelectionStart] = useState(0)
  const [selectionEnd, setSelectionEnd] = useState(0)
  const [insertPoint, setInsertPoint] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (open) {
      setDraft(content)
      onDraftChange?.(content)
      setSelectionStart(0)
      setSelectionEnd(0)
      setInsertPoint(null)
      setHint('')
      setError('')
    }
  }, [content, onDraftChange, open])

  const updateDraft = useCallback(
    (next: string) => {
      setDraft(next)
      onDraftChange?.(next)
    },
    [onDraftChange]
  )

  const syncRewriteSelection = useCallback(() => {
    if (!open || busy || disabled || mode !== 'rewrite' || !articleRef.current) return

    const range = getMarkdownRangeFromDomSelection(articleRef.current, draft)
    if (!range) return

    setSelectionStart(range.start)
    setSelectionEnd(range.end)
    setInsertPoint(null)
    setHint('')
    setError('')
  }, [articleRef, busy, disabled, draft, mode, open])

  useEffect(() => {
    if (!open || mode !== 'rewrite') return

    const handlePointerUp = (): void => {
      window.requestAnimationFrame(() => {
        syncRewriteSelection()
      })
    }

    document.addEventListener('mouseup', handlePointerUp)
    document.addEventListener('selectionchange', syncRewriteSelection)

    return () => {
      document.removeEventListener('mouseup', handlePointerUp)
      document.removeEventListener('selectionchange', syncRewriteSelection)
    }
  }, [mode, open, syncRewriteSelection])

  useEffect(() => {
    const el = articleRef.current
    if (!open || busy || disabled || mode !== 'insert' || !el) return

    const handleArticleClick = (event: MouseEvent): void => {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return

      const offset = getMarkdownOffsetFromClick(el, event.clientX, event.clientY)
      if (offset == null) {
        setHint('请点击正文中的具体位置以确定插入点。')
        return
      }

      setSelectionStart(offset)
      setSelectionEnd(offset)
      setInsertPoint(offset)
      setHint('')
      setError('')
    }

    el.addEventListener('click', handleArticleClick)
    return () => el.removeEventListener('click', handleArticleClick)
  }, [articleRef, busy, disabled, mode, open])

  const selectedText = draft.slice(selectionStart, selectionEnd)
  const hasSelection = selectionStart !== selectionEnd
  const hasInsertPoint = mode === 'insert' && insertPoint != null
  const selectionPreview =
    selectedText.length > 120 ? `${selectedText.slice(0, 120).trim()}…` : selectedText.trim()

  const handleClose = (): void => {
    const thread = articleRef.current?.closest('.chat-thread')
    const scrollTop = thread instanceof HTMLElement ? thread.scrollTop : null
    setOpen(false)
    window.getSelection()?.removeAllRanges()

    if (scrollTop == null) return

    requestAnimationFrame(() => {
      if (thread instanceof HTMLElement) {
        thread.scrollTop = scrollTop
      }
    })
  }

  const handleApply = async (): Promise<void> => {
    if (busy || disabled) return

    if (mode === 'rewrite' && !hasSelection) {
      setError('请先在正文中选中要修改的文字。')
      return
    }

    if (mode === 'insert' && insertPoint == null) {
      setError('插入模式请先点击正文中的插入位置。')
      return
    }

    const trimmedInstruction = instruction.trim()
    if (!trimmedInstruction) {
      setError('请输入修改指令。')
      return
    }

    const effectiveStart = mode === 'insert' ? insertPoint! : selectionStart
    const effectiveEnd = mode === 'insert' ? insertPoint! : selectionEnd
    const effectiveSelectedText = draft.slice(effectiveStart, effectiveEnd)

    setError('')
    setBusy(true)
    onBusyChange?.(true)

    const payload: RewriteArticleSectionRequest = {
      fullArticle: draft,
      selectedText: effectiveSelectedText,
      selectionStart: effectiveStart,
      selectionEnd: effectiveEnd,
      instruction: trimmedInstruction,
      mode,
      topic,
      outputLanguage
    }

    try {
      const result = await window.app.rewriteArticleSection(payload)
      if (result.ok && result.updatedArticle) {
        updateDraft(result.updatedArticle)
        onApply(result.updatedArticle)
        setInstruction('')
        setSelectionStart(0)
        setSelectionEnd(0)
        setInsertPoint(null)
        setHint('')
      } else {
        setError(result.message ?? '修改失败')
      }
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <div className={`section-editor${open ? ' is-open' : ''}`}>
      {!open ? (
        <button
          type="button"
          className="section-editor-toggle"
          disabled={disabled || busy}
          onClick={() => setOpen(true)}
        >
          部分重写
        </button>
      ) : null}

      {open ? (
        <div className="section-editor-panel">
          <p className="section-editor-guide">
            {mode === 'rewrite'
              ? '在上方正文中拖选文字，输入指令后 AI 将重写选中部分。'
              : '切换为插入模式后，点击正文中要插入内容的位置。'}
          </p>

          <div className="section-editor-meta">
            {mode === 'rewrite' && hasSelection ? (
              <span className="section-editor-selection">
                已选中 {selectionEnd - selectionStart} 字
                {selectionPreview ? `：「${selectionPreview}」` : ''}
              </span>
            ) : null}
            {mode === 'insert' && hasInsertPoint ? (
              <span className="section-editor-selection">
                插入点已标记（字符位置 {insertPoint}）
              </span>
            ) : null}
            {!hasSelection && !hasInsertPoint ? (
              <span className="section-editor-selection is-empty">
                {mode === 'rewrite' ? '尚未选中文字' : '尚未标记插入点'}
              </span>
            ) : null}
            {hint ? <span className="section-editor-hint">{hint}</span> : null}
          </div>

          <div className="section-editor-mode" role="radiogroup" aria-label="编辑模式">
            <label className="section-editor-mode-option">
              <input
                type="radio"
                name="section-edit-mode"
                value="rewrite"
                checked={mode === 'rewrite'}
                disabled={busy || disabled}
                onChange={() => {
                  setMode('rewrite')
                  setSelectionStart(0)
                  setSelectionEnd(0)
                  setInsertPoint(null)
                  setHint('')
                }}
              />
              重写选中
            </label>
            <label className="section-editor-mode-option">
              <input
                type="radio"
                name="section-edit-mode"
                value="insert"
                checked={mode === 'insert'}
                disabled={busy || disabled}
                onChange={() => {
                  setMode('insert')
                  setSelectionStart(0)
                  setSelectionEnd(0)
                  setInsertPoint(null)
                  setHint('')
                }}
              />
              插入内容
            </label>
          </div>

          <textarea
            className="section-editor-instruction"
            rows={2}
            placeholder={
              mode === 'rewrite'
                ? '描述如何改写选中部分，例如：语气更口语、补充数据、缩短至 80 字…'
                : '描述要插入的内容，例如：在此段后增加一个 FAQ 小节…'
            }
            value={instruction}
            disabled={busy || disabled}
            onChange={(event) => setInstruction(event.target.value)}
          />

          {error ? <p className="section-editor-error">{error}</p> : null}

          <div className="section-editor-actions">
            <button
              type="button"
              className="section-editor-cancel"
              disabled={busy}
              onClick={handleClose}
            >
              退出部分重写
            </button>
            <button
              type="button"
              className="section-editor-apply"
              disabled={busy || disabled}
              onClick={() => void handleApply()}
            >
              {busy ? 'AI 处理中…' : '应用 AI 修改'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
