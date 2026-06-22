import { useEffect, useState, type KeyboardEvent } from 'react'
import type { QuickPicksConfig } from '../../env.d'
import { ARTICLE_TYPE_OPTIONS, type ArticleType } from '../../constants/articleTypes'
import type { WriteMode } from '../../constants/writeMode'
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguageCode } from '../../constants/outputLanguage'
import { IconPlus, IconSend, IconStop, IconClose } from '../../components/Icons'

interface ComposerProps {
  disabled: boolean
  isGenerating: boolean
  showOptions: boolean
  writeMode: WriteMode
  quickPicks: QuickPicksConfig
  selectedProductId: string
  outputLanguage: OutputLanguageCode
  articleType: ArticleType
  onProductChange: (id: string) => void
  onOutputLanguageChange: (code: OutputLanguageCode) => void
  onArticleTypeChange: (type: ArticleType) => void
  onSubmit: (input: string, extraInstructions: string) => void
  onStop: () => void
  draftInput: string
  draftExtra: string
  onDraftInputChange: (value: string) => void
  onDraftExtraChange: (value: string) => void
  reviseSelectionPreview?: string | null
  onClearReviseSelection?: () => void
}

export default function Composer({
  disabled,
  isGenerating,
  showOptions,
  writeMode,
  quickPicks,
  selectedProductId,
  outputLanguage,
  articleType,
  onProductChange,
  onOutputLanguageChange,
  onArticleTypeChange,
  onSubmit,
  onStop,
  draftInput,
  draftExtra,
  onDraftInputChange,
  onDraftExtraChange,
  reviseSelectionPreview = null,
  onClearReviseSelection
}: ComposerProps) {
  const [showExtra, setShowExtra] = useState(false)
  const isOptimize = writeMode === 'optimize'
  const isFollowUp = !showOptions
  const placeholder = isFollowUp
    ? reviseSelectionPreview
      ? '描述如何改写选中部分…'
      : '描述要如何修改文章（可补充、删减或局部改写）…'
    : isOptimize
      ? '请发送要优化的页面URL...'
      : '请输入你想要创作的主题...'
  const panelDisabled = disabled || isGenerating

  useEffect(() => {
    if (!showOptions) setShowExtra(false)
  }, [showOptions])

  function handleSubmit(): void {
    if (!draftInput.trim() || panelDisabled) return
    onSubmit(draftInput.trim(), isFollowUp ? '' : draftExtra.trim())
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (isGenerating) return
      handleSubmit()
    }
  }

  return (
    <div className="composer-wrap">
      <div
        className={[
          'composer-panel',
          panelDisabled ? 'is-disabled' : '',
          isGenerating ? 'is-generating' : '',
          isFollowUp ? 'is-follow-up' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {showOptions ? (
          <>
            <div className={`composer-options${isOptimize ? ' is-optimize' : ''}`}>
              <label className="composer-option">
                <select
                  value={selectedProductId}
                  onChange={(e) => onProductChange(e.target.value)}
                  disabled={panelDisabled || quickPicks.products.length === 0}
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
                  disabled={panelDisabled}
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
                    disabled={panelDisabled}
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
                  disabled={panelDisabled}
                  placeholder="风格、结构、关键词等额外说明…"
                />
              </div>
            ) : null}
          </>
        ) : null}

        {isFollowUp && reviseSelectionPreview ? (
          <div className="composer-selection-hint">
            <span className="composer-selection-hint-text">
              已选中{' '}
              {reviseSelectionPreview.length > 80
                ? `${reviseSelectionPreview.slice(0, 80).trim()}…`
                : reviseSelectionPreview}
            </span>
            <button
              type="button"
              className="composer-selection-clear"
              onClick={onClearReviseSelection}
              disabled={panelDisabled}
              aria-label="取消选中"
              title="取消选中"
            >
              <IconClose size={10} />
            </button>
          </div>
        ) : null}

        <div className="composer-bar">
          {showOptions ? (
            <button
              type="button"
              className={`composer-icon-btn${showExtra ? ' is-active' : ''}`}
              onClick={() => setShowExtra((prev) => !prev)}
              disabled={panelDisabled}
              aria-label={showExtra ? '收起补充要求' : '补充要求'}
              title={showExtra ? '收起补充要求' : '补充要求'}
            >
              <IconPlus size={15} />
            </button>
          ) : null}
          <textarea
            className="composer-input"
            value={draftInput}
            onChange={(e) => onDraftInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={panelDisabled}
            placeholder={placeholder}
          />
          {isGenerating ? (
            <button
              type="button"
              className="composer-stop"
              onClick={onStop}
              aria-label="中止生成"
              title="中止生成"
            >
              <IconStop size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="composer-send"
              onClick={handleSubmit}
              disabled={disabled || !draftInput.trim()}
              aria-label={isFollowUp ? '发送修改说明' : '发送'}
            >
              <IconSend size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
