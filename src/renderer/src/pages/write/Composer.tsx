import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { QuickPicksConfig } from '../../env.d'
import { ARTICLE_TYPE_OPTIONS, type ArticleType } from '../../constants/articleTypes'
import type { WriteMode } from '../../constants/writeMode'
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguageCode } from '../../constants/outputLanguage'
import { IconPlus, IconSend } from '../../components/Icons'

interface ComposerProps {
  disabled: boolean
  writeMode: WriteMode
  quickPicks: QuickPicksConfig
  selectedProductId: string
  outputLanguage: OutputLanguageCode
  articleType: ArticleType
  onProductChange: (id: string) => void
  onOutputLanguageChange: (code: OutputLanguageCode) => void
  onArticleTypeChange: (type: ArticleType) => void
  onSubmit: (input: string, extraInstructions: string) => void
  draftInput: string
  draftExtra: string
  onDraftInputChange: (value: string) => void
  onDraftExtraChange: (value: string) => void
}

export default function Composer({
  disabled,
  writeMode,
  quickPicks,
  selectedProductId,
  outputLanguage,
  articleType,
  onProductChange,
  onOutputLanguageChange,
  onArticleTypeChange,
  onSubmit,
  draftInput,
  draftExtra,
  onDraftInputChange,
  onDraftExtraChange
}: ComposerProps) {
  const [showExtra, setShowExtra] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isOptimize = writeMode === 'optimize'
  const placeholder = isOptimize ? '粘贴要优化的页面 URL 或追问…' : '输入主题或追问…'

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [draftInput])

  function handleSubmit(): void {
    if (!draftInput.trim() || disabled) return
    onSubmit(draftInput.trim(), draftExtra.trim())
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="composer-wrap">
      <div className={`composer-panel${disabled ? ' is-disabled' : ''}`}>
        <div className={`composer-options${isOptimize ? ' is-optimize' : ''}`}>
          <label className="composer-option">
            <select
              value={selectedProductId}
              onChange={(e) => onProductChange(e.target.value)}
              disabled={disabled || quickPicks.products.length === 0}
              aria-label="产品名称"
            >
              <option value="">
                {quickPicks.products.length === 0 ? '未配置产品' : '产品（可选）'}
              </option>
              {quickPicks.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="composer-option">
            <select
              value={outputLanguage}
              onChange={(e) => onOutputLanguageChange(e.target.value as OutputLanguageCode)}
              disabled={disabled}
              aria-label="文本语言"
            >
              {OUTPUT_LANGUAGE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {!isOptimize ? (
            <label className="composer-option">
              <select
                value={articleType}
                onChange={(e) => onArticleTypeChange(e.target.value as ArticleType)}
                disabled={disabled}
                aria-label="文章类型"
              >
                {ARTICLE_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {showExtra ? (
          <div className="composer-extra-wrap">
            <span className="composer-extra-label">补充要求</span>
            <textarea
              className="composer-extra"
              value={draftExtra}
              onChange={(e) => onDraftExtraChange(e.target.value)}
              rows={2}
              disabled={disabled}
              placeholder="风格、结构、关键词等额外说明…"
            />
          </div>
        ) : null}

        <div className="composer-bar">
          <button
            type="button"
            className={`composer-icon-btn${showExtra ? ' is-active' : ''}`}
            onClick={() => setShowExtra((prev) => !prev)}
            disabled={disabled}
            aria-label={showExtra ? '收起补充要求' : '补充要求'}
            title={showExtra ? '收起补充要求' : '补充要求'}
          >
            <IconPlus size={15} />
          </button>
          <textarea
            ref={textareaRef}
            className="composer-input"
            value={draftInput}
            onChange={(e) => onDraftInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder}
          />
          <button
            type="button"
            className="composer-send"
            onClick={handleSubmit}
            disabled={disabled || !draftInput.trim()}
            aria-label="发送"
          >
            <IconSend size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
