import { useEffect, useRef, useState } from 'react'
import type { EditImageReference, ImageGenConfig, ImageHistoryItem } from '../../env.d'
import { IconDelete, IconHistory, IconUpload } from '../../components/Icons'

const SIZE_PRESETS = ['1024x1024', '1024x1536', '1536x1024', '512x512']

const KEEP_STYLE_PREFIX =
  '保持参考图的整体视觉风格、色调、光影与画质，仅按下列指令调整内容：\n'

const MAX_REFERENCE_IMAGES = 6

function buildReferencePrompt(
  userPrompt: string,
  referenceCount: number,
  includesPrevious: boolean
): string {
  const labels = Array.from({ length: referenceCount }, (_, index) => `图${index + 1}`).join('、')
  const styleNote = includesPrevious
    ? `最后一张（图${referenceCount}）是上一张成图，请同时保持它的整体画面风格。`
    : ''
  return `请参考${labels}中的人物形象、五官、发型与服装，并保持这些特征。${styleNote}在此基础上按下列指令绘制：\n${userPrompt}`
}

function snapOutputSize(width: number, height: number): string {
  if (!width || !height) return '1024x1024'
  const ratio = width / height
  if (ratio > 1.15) return '1536x1024'
  if (ratio < 0.87) return '1024x1536'
  return '1024x1024'
}

function detectImageSize(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(snapOutputSize(img.naturalWidth, img.naturalHeight))
    img.onerror = () => resolve('1024x1024')
    img.src = src
  })
}

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
  const [previewFileName, setPreviewFileName] = useState<string | null>(null)
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
  const [referenceImages, setReferenceImages] = useState<ImageHistoryItem[]>([])
  const [previewZoomOpen, setPreviewZoomOpen] = useState(false)
  const editPromptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    void window.app.getConfig().then((config) => {
      if (cancelled) return
      const next = config.imageGen ?? {
        apiUrl: 'https://uuapi.net/v1/images/generations',
        apiKey: '',
        model: 'gpt-image-2.5',
        size: '1024x1024',
        defaultPrompt: ''
      }
      setImageGen(next)
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

  async function handleImportImage(): Promise<void> {
    if (generating || editing) return
    setError('')
    try {
      const result = await window.app.importImage()
      if (!result.ok) {
        setError(result.message ?? '上传图片失败')
        return
      }
      if (result.canceled || !result.item) return

      const nextSize = await detectImageSize(result.item.imageSrc)
      applyPreview(result.item.imageSrc, {
        size: nextSize,
        fileName: result.item.fileName
      })
      setEditPrompt('')
      setEditError('')
      setEditOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传图片失败')
    }
  }

  function applyPreview(
    src: string,
    options?: { size?: string; prompt?: string; fileName?: string | null }
  ): void {
    setImageSrc(src)
    if (options?.fileName !== undefined) {
      setPreviewFileName(options.fileName)
    }
    if (options?.size?.trim()) {
      setPreviewSize(options.size.trim())
      setSize(options.size.trim())
    }
    if (options?.prompt?.trim()) setPrompt(options.prompt.trim())
  }

  async function handleAddReferences(): Promise<void> {
    if (generating || editing) return
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      setError(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图`)
      return
    }

    setError('')
    try {
      const result = await window.app.importReferenceImages()
      if (!result.ok) {
        setError(result.message ?? '添加参考图失败')
        return
      }
      if (result.canceled) return

      const incoming = result.items ?? []
      const seen = new Set(referenceImages.map((item) => item.fileName))
      const next = [...referenceImages]
      let skipped = 0
      for (const item of incoming) {
        if (seen.has(item.fileName)) continue
        if (next.length >= MAX_REFERENCE_IMAGES) {
          skipped += 1
          continue
        }
        seen.add(item.fileName)
        next.push(item)
      }
      setReferenceImages(next)
      if (skipped > 0) {
        setError(`最多 ${MAX_REFERENCE_IMAGES} 张参考图，已忽略多余图片`)
      } else if (result.message) {
        setError(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加参考图失败')
    }
  }

  function handleRemoveReference(fileName: string): void {
    setReferenceImages((current) => current.filter((item) => item.fileName !== fileName))
  }

  async function handleGenerate(): Promise<void> {
    if (generating || editing) return
    const userPrompt = prompt.trim()
    if (!userPrompt) return

    setError('')
    setGenerating(true)
    try {
      const styleLock = keepStyle && Boolean(previewFileName || imageSrc)
      const listed = referenceImages.slice(0, MAX_REFERENCE_IMAGES)
      const references: EditImageReference[] = listed.map((item) => ({ fileName: item.fileName }))
      if (styleLock) {
        references.push({
          fileName: previewFileName || undefined,
          imageDataUrl:
            !previewFileName && imageSrc?.startsWith('data:') ? imageSrc : undefined,
          imageUrl:
            !previewFileName && imageSrc && !imageSrc.startsWith('data:') ? imageSrc : undefined
        })
      }

      const result =
        references.length > 0
          ? await window.app.editImage({
              prompt:
                listed.length > 0
                  ? buildReferencePrompt(userPrompt, references.length, styleLock)
                  : `${KEEP_STYLE_PREFIX}${userPrompt}`,
              size: size.trim() || undefined,
              references
            })
          : await window.app.generateImage({
              prompt: userPrompt,
              size: size.trim() || undefined
            })
      if (!result.ok) {
        setError(result.message ?? '绘图失败')
        return
      }
      const src = result.imageSrc || null
      if (!src) {
        setError('未收到图片数据')
        return
      }
      applyPreview(src, {
        size: result.size || size,
        prompt: userPrompt,
        fileName: result.fileName || null
      })
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
        fileName: previewFileName || undefined,
        imageDataUrl: !previewFileName && imageSrc.startsWith('data:') ? imageSrc : undefined,
        imageUrl:
          !previewFileName && !imageSrc.startsWith('data:') ? imageSrc : undefined
      })
      if (!result.ok) {
        setEditError(result.message ?? '编辑失败')
        return
      }
      const src = result.imageSrc || null
      if (!src) {
        setEditError('未收到图片数据')
        return
      }
      applyPreview(src, {
        size: result.size || previewSize,
        prompt: nextPrompt,
        fileName: result.fileName || null
      })
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
      const response = await fetch(imageSrc)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || 'image/png']: blob })
      ])
    } catch {
      setError('复制图片失败')
    }
  }

  async function handleDownload(): Promise<void> {
    if (!imageSrc) return
    try {
      const response = await fetch(imageSrc)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = previewFileName || `draw-${Date.now()}.png`
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setError('下载图片失败')
    }
  }

  function handleSelectHistoryItem(item: ImageHistoryItem): void {
    applyPreview(item.imageSrc, {
      size: item.size,
      prompt: item.prompt,
      fileName: item.fileName
    })
    setError('')
    setHistoryOpen(false)
  }

  async function handleDeleteHistoryItem(id: string): Promise<void> {
    if (!window.confirm('确定删除这张图片？删除后无法恢复。')) return
    try {
      await window.app.deleteImageHistoryItem(id)
      setHistoryItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function handleClearHistory(): Promise<void> {
    if (historyItems.length === 0) return
    if (!window.confirm('确定清空全部生成历史？此操作不可恢复。')) return
    try {
      await window.app.clearImageHistory()
      setHistoryItems([])
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '清空失败')
    }
  }

  const configured = Boolean(imageGen?.apiKey?.trim() && imageGen?.apiUrl?.trim())
  const busy = generating || editing
  const coverPrompt = imageGen?.defaultPrompt?.trim() ?? ''

  function handleFillCoverPrompt(): void {
    if (!coverPrompt) {
      setError('请先在设置 → 绘图中填写默认提示词')
      return
    }
    setPrompt(coverPrompt)
    setError('')
  }

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
            <span className="draw-prompt-label">
              提示词
              <button
                type="button"
                className="secondary"
                disabled={busy}
                title={coverPrompt ? '填入文章封面预设提示词' : '请先在设置 → 绘图中填写默认提示词'}
                onClick={handleFillCoverPrompt}
              >
                文章封面
              </button>
            </span>
            <textarea
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述你想生成的图片，或上传图片后填写修改说明…"
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
                    setSize(SIZE_PRESETS.includes(size) ? '' : size)
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
                  placeholder="宽x高，例如 1024x1024"
                  autoComplete="off"
                  autoFocus
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
              onClick={() => void handleImportImage()}
            >
              <IconUpload size={15} />
              上传图片
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

          <div className="draw-references">
            <div className="draw-references-head">
              <span>参考图</span>
              <button
                type="button"
                className="secondary"
                disabled={busy || referenceImages.length >= MAX_REFERENCE_IMAGES}
                onClick={() => void handleAddReferences()}
              >
                <IconUpload size={15} />
                添加参考图
              </button>
            </div>
            {referenceImages.length === 0 ? (
              <p className="draw-references-hint">
                添加人物或服装图片后，生成会按图1、图2的顺序参考形象和服装。
              </p>
            ) : (
              <ul className="draw-reference-list">
                {referenceImages.map((item, index) => (
                  <li key={item.fileName} className="draw-reference-card">
                    <img src={item.imageSrc} alt={`参考图 ${index + 1}`} />
                    <span>图{index + 1}</span>
                    <button
                      type="button"
                      className="draw-reference-remove"
                      aria-label={`移除图${index + 1}`}
                      disabled={busy}
                      onClick={() => handleRemoveReference(item.fileName)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void handleDownload()}
                >
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
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleImportImage()}
              >
                <IconUpload size={15} />
                上传图片进行编辑
              </button>
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
          className="ui-overlay write-mode-picker-backdrop"
          onClick={() => {
            if (!editing) setEditOpen(false)
          }}
        >
          <div
            className="ui-dialog draw-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draw-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="draw-edit-title" className="write-mode-picker-title">
              编辑图片
            </h2>
            <p className="draw-edit-desc">
              基于当前预览图进行图生图编辑。可先上传本地图片，再填写修改说明。
            </p>

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
        <div className="ui-overlay write-mode-picker-backdrop" onClick={() => setHistoryOpen(false)}>
          <div
            className="ui-dialog draw-history-dialog"
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
                      <img
                        src={item.imageSrc}
                        alt={item.prompt || '历史图片'}
                        onError={(event) => {
                          const target = event.currentTarget
                          target.style.display = 'none'
                          target.parentElement?.classList.add('is-broken')
                          if (target.parentElement && !target.parentElement.dataset.brokenLabel) {
                            target.parentElement.dataset.brokenLabel = '1'
                            target.parentElement.append('无法预览')
                          }
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      className="draw-history-delete"
                      title="删除"
                      aria-label="删除"
                      onClick={() => void handleDeleteHistoryItem(item.id)}
                    >
                      <IconDelete size={14} />
                    </button>
                    <div className="draw-history-meta">
                      <p className="draw-history-prompt" title={item.prompt}>
                        {item.prompt || '（无提示词）'}
                      </p>
                      <p className="draw-history-footer">
                        {formatHistoryTime(item.createdAt)}
                        {item.size ? ` · ${item.size}` : ''}
                      </p>
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
