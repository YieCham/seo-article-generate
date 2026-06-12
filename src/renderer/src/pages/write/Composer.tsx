import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { QuickPicksConfig } from '../../env.d'
import { IconSend } from '../../components/Icons'

interface ComposerProps {
  disabled: boolean
  quickPicks: QuickPicksConfig
  selectedProductId: string
  selectedAudienceId: string
  onProductChange: (id: string) => void
  onAudienceChange: (id: string) => void
  onSubmit: (topic: string, extraInstructions: string) => void
  draftTopic: string
  draftExtra: string
  onDraftTopicChange: (value: string) => void
  onDraftExtraChange: (value: string) => void
}

export default function Composer({
  disabled,
  quickPicks,
  selectedProductId,
  selectedAudienceId,
  onProductChange,
  onAudienceChange,
  onSubmit,
  draftTopic,
  draftExtra,
  onDraftTopicChange,
  onDraftExtraChange
}: ComposerProps) {
  const [showExtra, setShowExtra] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draftTopic])

  function handleSubmit(): void {
    if (!draftTopic.trim() || disabled) return
    onSubmit(draftTopic.trim(), draftExtra.trim())
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="composer-wrap">
      <div className={`composer-box${disabled ? ' is-disabled' : ''}`}>
        <div className="composer-quick-row">
          <label className="composer-quick-field">
            <span>产品名称</span>
            <select
              value={selectedProductId}
              onChange={(e) => onProductChange(e.target.value)}
              disabled={disabled || quickPicks.products.length === 0}
            >
              <option value="">
                {quickPicks.products.length === 0 ? '请先在设置中添加产品' : '选择产品（可选）'}
              </option>
              {quickPicks.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="composer-quick-field">
            <span>目标读者</span>
            <select
              value={selectedAudienceId}
              onChange={(e) => onAudienceChange(e.target.value)}
              disabled={disabled || quickPicks.audiences.length === 0}
            >
              <option value="">
                {quickPicks.audiences.length === 0 ? '请先在设置中添加读者' : '选择读者（可选）'}
              </option>
              {quickPicks.audiences.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showExtra ? (
          <div className="composer-extra-wrap">
            <span className="composer-extra-label">补充要求</span>
            <textarea
              className="composer-extra"
              value={draftExtra}
              onChange={(e) => onDraftExtraChange(e.target.value)}
              placeholder="其他字数、风格、结构要求…"
              rows={2}
              disabled={disabled}
            />
          </div>
        ) : null}

        <div className="composer-main">
          <textarea
            ref={textareaRef}
            className="composer-input"
            value={draftTopic}
            onChange={(e) => onDraftTopicChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想写的文章主题…"
            rows={1}
            disabled={disabled}
          />
          <div className="composer-toolbar">
            <button
              type="button"
              className={`toolbar-btn${showExtra ? ' is-active' : ''}`}
              onClick={() => setShowExtra((prev) => !prev)}
              disabled={disabled}
            >
              {showExtra ? '收起要求' : '补充要求'}
            </button>
            <div className="composer-shortcuts">
              <kbd>Enter</kbd>
              <span>发送</span>
            </div>
            <button
              type="button"
              className="send-btn"
              onClick={handleSubmit}
              disabled={disabled || !draftTopic.trim()}
              aria-label="发送"
            >
              <IconSend size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
