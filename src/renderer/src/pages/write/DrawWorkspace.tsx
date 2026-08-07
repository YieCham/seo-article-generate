import { useEffect, useRef, useState } from 'react'
import type { ImageGenConfig, ImageHistoryItem } from '../../env.d'
import { IconDelete, IconHistory } from '../../components/Icons'

const SIZE_PRESETS = ['1024x1024', '1024x1536', '1536x1024', '512x512']

const KEEP_STYLE_PREFIX =
  '保持参考图的整体视觉风格、色调、光影与画质，仅按下列指令调整内容：\n'

function formatHistoryTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export default function DrawWorkspace({ configRevision = 0 }: { configRevision?: number }) {
  const [imageGen, setImageGen] = useState<ImageGenConfig | null>(null)
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState('1024x1024')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>([])
  const [historyError, setHistoryError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [editError, setEditError] = useState('')
  const [editing, setEditing] = useState(false)
  const [keepStyle, setKeepStyle] = useState(false)
  const [previewZoomOpen, setPreviewZoomOpen] = useState(false)
  const editPromptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    void window.app.getConfig().then((config) => {
      if (cancelled) return
      const next = config.imageGen ?? {
        apiUrl: 'https://uuapi.shop/v1/images/generations',
        apiKey: '',
        model: 'gpt-image-2',
        size: '1024x1024',
        defaultPrompt: ''
      }
      setImageGen(next)
      setPrompt((prev) => (prev.trim() ? prev : next.defaultPrompt))
      setSize(next.size || '1024x1024')
    })
    return () => {
      cancelled = true
    }
  }, [configRevision])

  useEffect(() => {
    if (!historyOpen) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setHistoryOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyOpen])

  useEffect(() => {
    if (!editOpen) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !editing) setEditOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    const timer = window.setTimeout(() => {
      editPromptRef.current?.focus()
    }, 0)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(timer)
    }
  }, [editOpen, editing])

  useEffect(() => {
    if (!previewZoomOpen) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setPreviewZoomOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewZoomOpen])

  async function loadHistory(): Promise<void> {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const items = await window.app.listImageHistory()
      setHistoryItems(items)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '加载历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleOpenHistory(): Promise<void> {
    setHistoryOpen(true)
    await loadHistory()
  }

  function applyPreview(src: string, nextSize?: string, nextPrompt?: string): void {
    setImageSrc(src)
    if (nextSize?.trim()) {
      setPreviewSize(nextSize.trim())
      setSize(nextSize.trim())
    }
    if (nextPrompt?.trim()) setPrompt(nextPrompt.trim())
  }

  async function handleGenerate(): Promise<void> {
    if (generating || editing) return
    const userPrompt = prompt.trim()
    if (!userPrompt) return

    setError('')
    setGenerating(true)
    try {
      const useStyleLock = keepStyle && Boolean(imageSrc)
      const result = useStyleLock
        ? await window.app.editImage({
            prompt: `${KEEP_STYLE_PREFIX}${userPrompt}`,
            size: size.trim() || undefined,
            imageDataUrl: imageSrc!.startsWith('data:') ? imageSrc! : undefined,
            imageUrl: imageSrc!.startsWith('data:') ? undefined : imageSrc!
          })
        : await window.app.generateImage({
            prompt: userPrompt,
            size: size.trim() || undefined
          })
      if (!result.ok) {
        setError(result.message ?? '绘图失败')
        return
      }
      const src = result.imageDataUrl || result.imageUrl || null
      if (!src) {
        setError('未收到图片数据')
        return
      }
      applyPreview(src, result.size || size, userPrompt)
    } catch (err) {
      setError(err instanceof Error ? err.message : '绘图请求失败')
    } finally {
      setGenerating(false)
    }
  }

  function handleOpenEdit(): void {
    if (!imageSrc || generating || editing) return
    setEditPrompt('')
    setEditError('')
    setEditOpen(true)
  }

  async function handleConfirmEdit(): Promise<void> {
    if (!imageSrc || editing) return
    const nextPrompt = editPrompt.trim()
    if (!nextPrompt) {
      setEditError('请输入编辑提示词')
      return
    }

    setEditError('')
    setEditing(true)
    try {
      const result = await window.app.editImage({
        prompt: nextPrompt,
        size: previewSize.trim() || size.trim() || undefined,
        imageDataUrl: imageSrc.startsWith('data:') ? imageSrc : undefined,
        imageUrl: imageSrc.startsWith('data:') ? undefined : imageSrc
      })
      if (!result.ok) {
        setEditError(result.message ?? '编辑失败')
        return
      }
      const src = result.imageDataUrl || result.imageUrl || null
      if (!src) {
        setEditError('未收到图片数据')
        return
      }
      applyPreview(src, result.size || previewSize, nextPrompt)
      setError('')
      setEditOpen(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '编辑请求失败')
    } finally {
      setEditing(false)
    }
  }

  async function handleCopyImage(): Promise<void> {
    if (!imageSrc) return
    try {
      if (imageSrc.startsWith('data:')) {
        const response = await fetch(imageSrc)
        const blob = await response.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob })
        ])
      } else {
        await navigator.clipboard.writeText(imageSrc)
      }
    } catch {
      setError('复制图片失败')
    }
  }

  function handleDownload(): void {
    if (!imageSrc) return
    const anchor = document.createElement('a')
    anchor.href = imageSrc
    anchor.download = `draw-${Date.now()}.png`
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    anchor.click()
  }

  function handleSelectHistoryItem(item: ImageHistoryItem): void {
    applyPreview(item.imageDataUrl, item.size, item.prompt)
    setError('')
    setHistoryOpen(false)
  }

  async function handleDeleteHistoryItem(id: string): Promise<void> {
    try {
      await window.app.deleteImageHistoryItem(id)
      setHistoryItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function handleClearHistory(): Promise<void> {
    if (historyItems.length === 0) return
    try {
      await window.app.clearImageHistory()
      setHistoryItems([])
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '清空失败')
    }
  }

  const configured = Boolean(imageGen?.apiKey?.trim() && imageGen?.apiUrl?.trim())
  const busy = generating || editing

  return (
    <main className="draw-workspace">
      <header className="draw-topbar">
        <h1>绘图</h1>
        <p className="draw-topbar-desc">
          {configured
            ? `模型 ${imageGen?.model || '—'} · 接口已配置`
            : '请先在设置 → 绘图中配置 API 地址与密钥'}
        </p>
      </header>

      <div className="draw-body">
        <section className="draw-form panel">
          <label>
            提示词
            <textarea
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述你想生成的图片…"
              disabled={busy}
            />
          </label>

          <label>
            尺寸
            <div className="draw-size-row">
              <select
                className="select-input"
                value={SIZE_PRESETS.includes(size) ? size : '__custom__'}
                onChange={(event) => {
                  if (event.target.value === '__custom__') {
                    if (SIZE_PRESETS.includes(size)) setSize('1024x1024')
                    return
                  }
                  setSize(event.target.value)
                }}
                disabled={busy}
              >
                {SIZE_PRESETS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value="__custom__">自定义</option>
              </select>
              {!SIZE_PRESETS.includes(size) ? (
                <input
                  type="text"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  placeholder="宽x高"
                  disabled={busy}
                />
              ) : null}
            </div>
          </label>

          <div className="draw-actions">
            <button
              type="button"
              disabled={busy || !prompt.trim()}
              onClick={() => void handleGenerate()}
            >
              {generating ? '生成中…' : '生成图片'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void handleOpenHistory()}
            >
              <IconHistory size={15} />
              生成历史
            </button>
          </div>

          <label
            className={`skill-toggle draw-keep-style${imageSrc ? '' : ' is-disabled'}`}
            title={imageSrc ? '开启后，生成将参考当前预览图保持风格' : '请先生成一张图片后再开启'}
          >
            <input
              className="toggle-input"
              type="checkbox"
              checked={keepStyle}
              disabled={busy || !imageSrc}
              onChange={(event) => setKeepStyle(event.target.checked)}
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span className="toggle-label">保持风格</span>
          </label>

          {error ? (
            <p className="draw-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <section className="draw-preview panel">
          {imageSrc ? (
            <>
              <div className="draw-preview-frame">
                <button
                  type="button"
                  className="draw-preview-zoom-trigger"
                  onClick={() => setPreviewZoomOpen(true)}
                  title="点击放大查看"
                  aria-label="放大查看预览图"
                >
                  <img src={imageSrc} alt="生成结果" />
                </button>
              </div>
              <div className="draw-preview-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void handleCopyImage()}
                >
                  复制
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={handleDownload}>
                  下载
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={handleOpenEdit}
                >
                  {editing ? '编辑中…' : '编辑'}
                </button>
              </div>
            </>
          ) : (
            <div className="draw-preview-empty">
              <p>生成结果将显示在这里</p>
            </div>
          )}
        </section>
      </div>

      {previewZoomOpen && imageSrc ? (
        <div
          className="draw-preview-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="放大预览"
          onClick={() => setPreviewZoomOpen(false)}
        >
          <button
            type="button"
            className="draw-preview-lightbox-close"
            aria-label="关闭"
            onClick={() => setPreviewZoomOpen(false)}
          >
            ×
          </button>
          <img
            src={imageSrc}
            alt="放大预览"
            className="draw-preview-lightbox-img"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      {editOpen ? (
        <div
          className="write-mode-picker-backdrop draw-history-backdrop"
          onClick={() => {
            if (!editing) setEditOpen(false)
          }}
        >
          <div
            className="draw-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draw-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="draw-edit-title" className="write-mode-picker-title">
              编辑图片
            </h2>
            <p className="draw-edit-desc">基于当前预览图进行图生图编辑，尺寸保持不变。</p>

            <div className="draw-edit-preview">
              <img src={imageSrc ?? ''} alt="待编辑预览" />
            </div>

            <label className="draw-edit-field">
              编辑提示词
              <textarea
                ref={editPromptRef}
                rows={4}
                value={editPrompt}
                onChange={(event) => setEditPrompt(event.target.value)}
                placeholder="描述你想如何修改这张图…"
                disabled={editing}
              />
            </label>

            <div className="draw-edit-size">
              <span>输出尺寸</span>
              <strong>{previewSize || size || '—'}</strong>
            </div>

            {editError ? (
              <p className="draw-error" role="alert">
                {editError}
              </p>
            ) : null}

            <div className="draw-edit-actions">
              <button
                type="button"
                className="secondary"
                disabled={editing}
                onClick={() => setEditOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={editing || !editPrompt.trim()}
                onClick={() => void handleConfirmEdit()}
              >
                {editing ? '编辑中…' : '开始编辑'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="write-mode-picker-backdrop draw-history-backdrop" onClick={() => setHistoryOpen(false)}>
          <div
            className="draw-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draw-history-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="draw-history-header">
              <div>
                <h2 id="draw-history-title" className="write-mode-picker-title">
                  生成历史
                </h2>
                <p className="draw-history-desc">点击图片可加载到预览区，最多保留 100 条。</p>
              </div>
              <div className="draw-history-header-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={historyLoading || historyItems.length === 0}
                  onClick={() => void handleClearHistory()}
                >
                  清空
                </button>
                <button type="button" className="secondary" onClick={() => setHistoryOpen(false)}>
                  关闭
                </button>
              </div>
            </div>

            {historyError ? (
              <p className="draw-error" role="alert">
                {historyError}
              </p>
            ) : null}

            {historyLoading ? (
              <div className="draw-history-empty">加载中…</div>
            ) : historyItems.length === 0 ? (
              <div className="draw-history-empty">暂无生成记录</div>
            ) : (
              <div className="draw-history-grid">
                {historyItems.map((item) => (
                  <article key={item.id} className="draw-history-card">
                    <button
                      type="button"
                      className="draw-history-thumb"
                      onClick={() => handleSelectHistoryItem(item)}
                      title="加载到预览"
                    >
                      <img src={item.imageDataUrl} alt={item.prompt || '历史图片'} />
                    </button>
                    <div className="draw-history-meta">
                      <p className="draw-history-prompt" title={item.prompt}>
                        {item.prompt || '（无提示词）'}
                      </p>
                      <div className="draw-history-footer">
                        <span>
                          {formatHistoryTime(item.createdAt)}
                          {item.size ? ` · ${item.size}` : ''}
                        </span>
                        <button
                          type="button"
                          className="draw-history-delete"
                          title="删除"
                          aria-label="删除"
                          onClick={() => void handleDeleteHistoryItem(item.id)}
                        >
                          <IconDelete size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}
