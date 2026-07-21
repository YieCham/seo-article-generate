import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { QuickPicksConfig } from '../../env.d'
import { ARTICLE_TYPE_OPTIONS, type ArticleType } from '../../constants/articleTypes'
import type { WriteMode } from '../../constants/writeMode'
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguageCode } from '../../constants/outputLanguage'
import {
  formatLlmModelOptionLabel,
  type LlmModelOption
} from '../../utils/llmModels'
import { resolveLlmBrandFromModel } from '../../utils/llmIcons'
import { LlmModelIcon } from '../../components/LlmBrandIcon'
import { IconPlus, IconSend, IconStop, IconClose } from '../../components/Icons'

interface ComposerProps {
  disabled: boolean
  isGenerating: boolean
  canResume?: boolean
  resumeLabel?: string
  onResume?: () => void
  onDiscardResume?: () => void
  showOptions: boolean
  writeMode: WriteMode
  quickPicks: QuickPicksConfig
  selectedProductId: string
  outputLanguage: OutputLanguageCode
  articleType: ArticleType
  llmModels: LlmModelOption[]
  selectedLlmModelId: string
  llmRoleRoutingEnabled?: boolean
  llmRoleRoutingHint?: string
  onProductChange: (id: string) => void
  onOutputLanguageChange: (code: OutputLanguageCode) => void
  onArticleTypeChange: (type: ArticleType) => void
  onLlmModelChange: (optionId: string) => void
  onSubmit: (input: string, extraInstructions: string) => void
  onStop: () => void
  draftInput: string
  draftExtra: string
  onDraftInputChange: (value: string) => void
  onDraftExtraChange: (value: string) => void
  reviseSelectionPreview?: string | null
  onClearReviseSelection?: () => void
  onBatchWrite?: () => void
}

export default function Composer({
  disabled,
  isGenerating,
  canResume = false,
  resumeLabel = '继续生成',
  onResume,
  onDiscardResume,
  showOptions,
  writeMode,
  quickPicks,
  selectedProductId,
  outputLanguage,
  articleType,
  llmModels,
  selectedLlmModelId,
  llmRoleRoutingEnabled = false,
  llmRoleRoutingHint = '',
  onProductChange,
  onOutputLanguageChange,
  onArticleTypeChange,
  onLlmModelChange,
  onSubmit,
  onStop,
  draftInput,
  draftExtra,
  onDraftInputChange,
  onDraftExtraChange,
  reviseSelectionPreview = null,
  onClearReviseSelection,
  onBatchWrite
}: ComposerProps) {
  const [showExtra, setShowExtra] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const modelTriggerRef = useRef<HTMLButtonElement>(null)
  const isOptimize = writeMode === 'optimize'
  const isBatchOptimize = writeMode === 'batch-optimize'
  const isUrlMode = isOptimize || isBatchOptimize
  const isFollowUp = !showOptions
  const activeModel = llmModels.find((item) => item.id === selectedLlmModelId) ?? llmModels[0] ?? null
  const placeholder = isFollowUp
    ? reviseSelectionPreview
      ? '描述如何改写选中部分…'
      : '描述要如何修改文章（可补充、删减或局部改写）…'
    : isBatchOptimize
      ? '每行输入一个页面 URL，将按顺序批量优化…'
      : isOptimize
        ? '请发送要优化的页面URL...'
        : '请输入你想要创作的主题...'
  const panelDisabled = disabled || isGenerating

  useEffect(() => {
    if (!showOptions) setShowExtra(false)
  }, [showOptions])

  useEffect(() => {
    if (!isFollowUp) setModelMenuOpen(false)
  }, [isFollowUp])

  useEffect(() => {
    if (!modelMenuOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (modelMenuRef.current?.contains(target)) return
      if (modelTriggerRef.current?.contains(target)) return
      setModelMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') setModelMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [modelMenuOpen])

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
            <div className={`composer-options${isUrlMode ? ' is-optimize' : ''}`}>
              {onBatchWrite ? (
                <div className="composer-option composer-option-fixed">
                  <button
                    type="button"
                    className="composer-control composer-batch-btn"
                    onClick={onBatchWrite}
                    disabled={panelDisabled}
                  >
                    {isBatchOptimize || isOptimize ? '批量优化' : '批量创作'}
                  </button>
                </div>
              ) : null}
              <label className="composer-option">
                <select
                  className="composer-control"
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
                  className="composer-control"
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

              {!isUrlMode ? (
                <label className="composer-option">
                  <select
                    className="composer-control"
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

              <label className="composer-option">
                {llmRoleRoutingEnabled ? (
                  <span
                    className="composer-control composer-role-routing-badge"
                    title={llmRoleRoutingHint || '已启用多模型分工'}
                    aria-label={
                      llmRoleRoutingHint
                        ? `已启用多模型分工。${llmRoleRoutingHint.replace(/\n/g, '；')}`
                        : '已启用多模型分工'
                    }
                  >
                    已启用多模型分工
                  </span>
                ) : (
                  <select
                    className="composer-control"
                    value={selectedLlmModelId}
                    onChange={(e) => onLlmModelChange(e.target.value)}
                    disabled={panelDisabled || llmModels.length === 0}
                    aria-label="模型"
                  >
                    {llmModels.length === 0 ? (
                      <option value="">未配置模型</option>
                    ) : (
                      llmModels.map((item) => (
                        <option key={item.id} value={item.id}>
                          {formatLlmModelOptionLabel(item)}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </label>
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

        {canResume && !isGenerating ? (
          <div className="composer-resume-bar">
            <span className="composer-resume-hint">生成已中断，可从当前进度继续</span>
            <div className="composer-resume-actions">
              <button
                type="button"
                className="composer-resume-btn"
                onClick={onResume}
                disabled={disabled}
              >
                {resumeLabel}
              </button>
              {onDiscardResume ? (
                <button
                  type="button"
                  className="composer-resume-discard"
                  onClick={onDiscardResume}
                  disabled={disabled}
                >
                  放弃进度
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="composer-bar">
          {isFollowUp && activeModel ? (
            <div className="composer-model-picker">
              <button
                ref={modelTriggerRef}
                type="button"
                className={`composer-model-trigger${modelMenuOpen ? ' is-open' : ''}`}
                onClick={() => setModelMenuOpen((open) => !open)}
                disabled={panelDisabled || llmModels.length === 0}
                aria-expanded={modelMenuOpen}
                aria-haspopup="menu"
                aria-label={`当前模型：${formatLlmModelOptionLabel(activeModel)}，点击切换`}
                title={formatLlmModelOptionLabel(activeModel)}
              >
                <LlmModelIcon
                  model={activeModel.model}
                  brand={resolveLlmBrandFromModel(activeModel.model)}
                  size={18}
                />
              </button>
              {modelMenuOpen ? (
                <div ref={modelMenuRef} className="composer-model-menu" role="menu" aria-label="选择模型">
                  {llmModels.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={`composer-model-menu-item${item.id === selectedLlmModelId ? ' is-active' : ''}`}
                      onClick={() => {
                        onLlmModelChange(item.id)
                        setModelMenuOpen(false)
                      }}
                    >
                      <LlmModelIcon
                        model={item.model}
                        brand={resolveLlmBrandFromModel(item.model)}
                        size={16}
                      />
                      <span>{formatLlmModelOptionLabel(item)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

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
              <IconStop size={22} />
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
