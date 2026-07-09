import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { QuickPicksConfig } from '../../env.d'
import { ARTICLE_TYPE_OPTIONS, type ArticleType } from '../../constants/articleTypes'
import type { WriteMode } from '../../constants/writeMode'
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguageCode } from '../../constants/outputLanguage'
import { parseBatchTopics } from '../../utils/parseBatchTopics'

interface BatchWriteDialogProps {
  open: boolean
  mode: WriteMode
  disabled: boolean
  quickPicks: QuickPicksConfig
  selectedProductId: string
  outputLanguage: OutputLanguageCode
  articleType: ArticleType
  draftExtra: string
  onClose: () => void
  onSubmit: (itemsText: string, extraInstructions: string) => void
}

const COPY = {
  create: {
    title: '批量创作',
    desc: '每行输入一个主题，将按顺序依次为每个主题创建新对话并生成文章。创作流程与单篇相同。',
    listLabel: '主题列表',
    extraLabel: '补充要求（应用于全部主题）',
    placeholder:
      '每行一个主题，例如：\nHow to download Spotify songs\nBest Tidal converter tools\nApple Music to MP3 guide',
    countUnit: '个主题',
    submit: '开始批量创作'
  },
  optimize: {
    title: '批量优化',
    desc: '每行输入一个页面 URL，将按顺序依次为每个 URL 创建新对话并优化内容。优化流程与单篇相同。',
    listLabel: 'URL 列表',
    extraLabel: '补充要求（应用于全部 URL）',
    placeholder:
      '每行一个 URL，例如：\nhttps://example.com/blog/spotify-guide\nhttps://example.com/blog/tidal-converter',
    countUnit: '个 URL',
    submit: '开始批量优化'
  }
} as const

export default function BatchWriteDialog({
  open,
  mode,
  disabled,
  quickPicks,
  selectedProductId,
  outputLanguage,
  articleType,
  draftExtra,
  onClose,
  onSubmit
}: BatchWriteDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [itemsText, setItemsText] = useState('')
  const [extra, setExtra] = useState('')
  const copy = COPY[mode]

  useEffect(() => {
    if (!open) return
    setItemsText('')
    setExtra(draftExtra)
  }, [open, draftExtra])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const textarea = dialogRef.current?.querySelector('textarea')
    textarea?.focus()
  }, [open])

  if (!open) return null

  const itemCount = parseBatchTopics(itemsText).length
  const productLabel =
    quickPicks.products.find((item) => item.id === selectedProductId)?.label ?? '未选择'
  const articleTypeLabel =
    ARTICLE_TYPE_OPTIONS.find((item) => item.value === articleType)?.label ?? articleType
  const languageLabel =
    OUTPUT_LANGUAGE_OPTIONS.find((item) => item.value === outputLanguage)?.label ?? outputLanguage
  const panelDisabled = disabled

  function handleSubmit(): void {
    if (panelDisabled || itemCount === 0) return
    onSubmit(itemsText, extra.trim())
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="write-mode-picker-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="batch-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-write-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="batch-write-title" className="write-mode-picker-title">
          {copy.title}
        </h2>
        <p className="write-mode-picker-desc">{copy.desc}</p>

        <div className="batch-create-options">
          <span>产品：{productLabel}</span>
          <span>语言：{languageLabel}</span>
          {mode === 'create' ? <span>类型：{articleTypeLabel}</span> : null}
        </div>

        <label className="batch-create-label" htmlFor="batch-write-items">
          {copy.listLabel}
        </label>
        <textarea
          id="batch-write-items"
          className="batch-create-topics"
          value={itemsText}
          onChange={(event) => setItemsText(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          rows={8}
          disabled={panelDisabled}
          placeholder={copy.placeholder}
        />
        <p className="batch-create-count">
          已识别 <strong>{itemCount}</strong> {copy.countUnit}
        </p>

        <label className="batch-create-label" htmlFor="batch-write-extra">
          {copy.extraLabel}
        </label>
        <textarea
          id="batch-write-extra"
          className="batch-create-extra"
          value={extra}
          onChange={(event) => setExtra(event.target.value)}
          rows={2}
          disabled={panelDisabled}
          placeholder="风格、结构、关键词等额外说明…"
        />

        <div className="batch-create-actions">
          <button type="button" className="batch-create-cancel" onClick={onClose} disabled={panelDisabled}>
            取消
          </button>
          <button
            type="button"
            className="batch-create-submit"
            onClick={handleSubmit}
            disabled={panelDisabled || itemCount === 0}
          >
            {copy.submit}（{itemCount}）
          </button>
        </div>
      </div>
    </div>
  )
}
