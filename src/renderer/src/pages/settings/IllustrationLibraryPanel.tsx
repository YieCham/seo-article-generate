import { useEffect, useMemo, useState } from 'react'
import type {
  IllustrationImage,
  IllustrationLibrary,
  IllustrationProduct,
  QuickPickOption
} from '../../env.d'
import {
  formatIllustrationKeywords,
  isAllowedIllustrationUrl
} from '../../../../shared/illustrationLibrary'

interface IllustrationLibraryPanelProps {
  visible: boolean
  saving: boolean
  quickPicks: QuickPickOption[]
  onSavingChange: (saving: boolean) => void
  onStatus: (message: string) => void
}

interface ImageDraft {
  id: string
  url: string
  alt: string
  caption: string
  stepKey: string
  keywords: string
}

const EMPTY_DRAFT: ImageDraft = {
  id: '',
  url: '',
  alt: '',
  caption: '',
  stepKey: '',
  keywords: ''
}

function toDraft(image: IllustrationImage): ImageDraft {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt,
    caption: image.caption,
    stepKey: image.stepKey,
    keywords: formatIllustrationKeywords(image.matchKeywords)
  }
}

export default function IllustrationLibraryPanel({
  visible,
  saving,
  quickPicks,
  onSavingChange,
  onStatus
}: IllustrationLibraryPanelProps) {
  const [library, setLibrary] = useState<IllustrationLibrary>({ products: [] })
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [addingProduct, setAddingProduct] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [renameDraft, setRenameDraft] = useState('')
  const [draft, setDraft] = useState<ImageDraft>(EMPTY_DRAFT)
  const [brokenIds, setBrokenIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (visible) void loadLibrary()
  }, [visible])

  async function loadLibrary(): Promise<IllustrationLibrary> {
    setLoading(true)
    try {
      const next = await window.app.getIllustrationLibrary()
      setLibrary(next)
      setSelectedId((prev) => {
        if (prev && next.products.some((item) => item.id === prev)) return prev
        return next.products[0]?.id ?? ''
      })
      return next
    } catch {
      onStatus('插图库加载失败')
      return library
    } finally {
      setLoading(false)
    }
  }

  const selected = library.products.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    setRenameDraft(selected?.name ?? '')
    setBrokenIds({})
  }, [selectedId, selected?.name])

  const unusedQuickPicks = useMemo(
    () => quickPicks.filter((item) => !library.products.some((product) => product.id === item.id)),
    [quickPicks, library.products]
  )

  function applyLibrary(next: IllustrationLibrary, preferId?: string): void {
    setLibrary(next)
    const nextId =
      (preferId && next.products.some((item) => item.id === preferId) ? preferId : null) ??
      (selectedId && next.products.some((item) => item.id === selectedId) ? selectedId : null) ??
      next.products[0]?.id ??
      ''
    setSelectedId(nextId)
  }

  async function handleAddProduct(name: string, id?: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      onStatus('请填写产品名称')
      return
    }
    onSavingChange(true)
    try {
      const next = await window.app.saveIllustrationProduct({ id, name: trimmed })
      const previousIds = new Set(library.products.map((item) => item.id))
      const created =
        (id ? next.products.find((item) => item.id === id) : null) ??
        next.products.find((item) => !previousIds.has(item.id)) ??
        next.products[next.products.length - 1]
      applyLibrary(next, created?.id)
      setAddingProduct(false)
      setNewProductName('')
      onStatus('产品已添加')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '添加产品失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleRenameProduct(): Promise<void> {
    if (!selected) return
    const name = renameDraft.trim()
    if (!name) {
      onStatus('请填写产品名称')
      return
    }
    onSavingChange(true)
    try {
      applyLibrary(await window.app.saveIllustrationProduct({ id: selected.id, name }), selected.id)
      onStatus('产品名称已更新')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '重命名失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleDeleteProduct(): Promise<void> {
    if (!selected) return
    if (!confirm(`确定删除「${selected.name}」及其全部插图？`)) return
    onSavingChange(true)
    try {
      const next = await window.app.deleteIllustrationProduct(selected.id)
      applyLibrary(next)
      setDraft(EMPTY_DRAFT)
      onStatus('产品已删除')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '删除产品失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleSaveImage(): Promise<void> {
    if (!selected) {
      onStatus('请先选择或添加产品')
      return
    }
    if (!isAllowedIllustrationUrl(draft.url)) {
      onStatus('请填写有效的图片 URL（http/https）')
      return
    }
    onSavingChange(true)
    try {
      applyLibrary(
        await window.app.saveIllustrationImage({
          productId: selected.id,
          id: draft.id || undefined,
          url: draft.url.trim(),
          alt: draft.alt,
          caption: draft.caption,
          stepKey: draft.stepKey,
          matchKeywords: draft.keywords
        }),
        selected.id
      )
      setDraft(EMPTY_DRAFT)
      onStatus(draft.id ? '插图已更新' : '插图已添加')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '保存插图失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleImportFile(): Promise<void> {
    if (!selected) {
      onStatus('请先选择或添加产品')
      return
    }
    onSavingChange(true)
    try {
      const result = await window.app.importIllustrationFile(selected.id)
      if (result.canceled) return
      applyLibrary(result.library, selected.id)
      onStatus('本地插图已上传')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '上传失败')
    } finally {
      onSavingChange(false)
    }
  }

  async function handleDeleteImage(image: IllustrationImage): Promise<void> {
    if (!selected) return
    if (!confirm('确定删除这张插图？')) return
    try {
      applyLibrary(await window.app.deleteIllustrationImage(selected.id, image.id), selected.id)
      if (draft.id === image.id) setDraft(EMPTY_DRAFT)
      onStatus('插图已删除')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : '删除插图失败')
    }
  }

  function productLabel(product: IllustrationProduct): string {
    const count = product.images.length
    return count > 0 ? `${product.name}（${count}）` : product.name
  }

  return (
    <>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="section-title">插图库</h2>
            <p className="section-desc">
              按产品存放截图。优先用「从本地上传」；部分官网 CDN / Cloudflare 保护的 https
              地址在应用内无法预览（浏览器能开不代表此处能加载）。
            </p>
          </div>
        </div>

        <div className="illust-toolbar">
          <div className="illust-product-tabs" role="tablist" aria-label="插图库产品">
            {library.products.map((product) => (
              <button
                key={product.id}
                type="button"
                role="tab"
                className={`settings-pipeline-tab${selectedId === product.id ? ' active' : ''}`}
                aria-selected={selectedId === product.id}
                onClick={() => {
                  setSelectedId(product.id)
                  setDraft(EMPTY_DRAFT)
                }}
              >
                {productLabel(product)}
              </button>
            ))}
          </div>
          <div className="illust-toolbar-actions">
            {unusedQuickPicks.length > 0 ? (
              <select
                className="select-input"
                value=""
                disabled={saving}
                aria-label="从产品配置添加"
                onChange={(event) => {
                  const pick = unusedQuickPicks.find((item) => item.id === event.target.value)
                  if (pick) void handleAddProduct(pick.label, pick.id)
                }}
              >
                <option value="">从产品配置添加…</option>
                {unusedQuickPicks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => {
                setAddingProduct(true)
                setNewProductName('')
              }}
            >
              新建产品
            </button>
          </div>
        </div>

        {addingProduct ? (
          <div className="illust-inline-add">
            <input
              value={newProductName}
              onChange={(event) => setNewProductName(event.target.value)}
              placeholder="产品名称，例如 TuneFab"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleAddProduct(newProductName)
                }
                if (event.key === 'Escape') setAddingProduct(false)
              }}
            />
            <button type="button" disabled={saving} onClick={() => void handleAddProduct(newProductName)}>
              添加
            </button>
            <button type="button" className="secondary" onClick={() => setAddingProduct(false)}>
              取消
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="empty-hint">加载中…</p>
        ) : !selected ? (
          <p className="empty-hint">还没有产品。可从「产品配置」导入，或新建一个产品后再上传插图。</p>
        ) : (
          <>
            <div className="illust-product-meta">
              <input
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                aria-label="产品名称"
              />
              <button
                type="button"
                className="secondary"
                disabled={saving || !renameDraft.trim() || renameDraft.trim() === selected.name}
                onClick={() => void handleRenameProduct()}
              >
                重命名
              </button>
              <button type="button" className="danger" disabled={saving} onClick={() => void handleDeleteProduct()}>
                删除产品
              </button>
              <p className="kb-count">
                {selected.images.length} 张插图
              </p>
            </div>

            {selected.images.length === 0 ? (
              <p className="empty-hint">该产品还没有插图。粘贴图片 URL，或从本地上传。</p>
            ) : (
              <ul className="illust-grid">
                {selected.images.map((image) => (
                  <li key={image.id} className="illust-card">
                    <div className="illust-thumb">
                      {brokenIds[image.id] ? (
                        <button
                          type="button"
                          className="illust-thumb-fallback"
                          title="点击重试预览"
                          onClick={() =>
                            setBrokenIds((prev) => {
                              const next = { ...prev }
                              delete next[image.id]
                              return next
                            })
                          }
                        >
                          <span>无法预览</span>
                          <span className="illust-thumb-hint">
                            {image.url.startsWith('http')
                              ? '远程站可能开启防盗链 / Cloudflare，请下载后改用本地上传'
                              : '本地文件加载失败，点击重试'}
                          </span>
                        </button>
                      ) : (
                        <img
                          src={image.url}
                          alt={image.alt || image.caption || '插图预览'}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenIds((prev) => ({ ...prev, [image.id]: true }))}
                        />
                      )}
                    </div>
                    <div className="illust-card-body">
                      <p className="illust-card-title">{image.alt || image.stepKey || '未填写说明'}</p>
                      <p className="illust-card-url" title={image.url}>
                        {image.url}
                      </p>
                      <div className="illust-card-actions">
                        <button type="button" className="secondary" onClick={() => setDraft(toDraft(image))}>
                          编辑
                        </button>
                        <button type="button" className="danger" onClick={() => void handleDeleteImage(image)}>
                          删除
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {selected ? (
        <section className="panel">
          <h2 className="section-title">{draft.id ? '编辑插图' : '添加插图'}</h2>
          <p className="section-desc">
            推荐「从本地上传」。粘贴 https 时须为可直链的图片地址；若站点有防盗链或 Cloudflare
            验证，应用内会显示无法预览，请先下载再上传。
          </p>

          <label htmlFor="illustUrl">图片 URL</label>
          <input
            id="illustUrl"
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder="https://example.com/screenshot.png"
            autoComplete="off"
          />

          <div className="form-row">
            <label htmlFor="illustAlt">
              Alt 说明
              <input
                id="illustAlt"
                value={draft.alt}
                onChange={(event) => setDraft({ ...draft, alt: event.target.value })}
                placeholder="例如 Add Spotify tracks"
              />
            </label>
            <label htmlFor="illustStep">
              步骤标识（可选）
              <input
                id="illustStep"
                value={draft.stepKey}
                onChange={(event) => setDraft({ ...draft, stepKey: event.target.value })}
                placeholder="例如 add-tracks"
              />
            </label>
          </div>

          <div className="form-row">
            <label htmlFor="illustCaption">
              图注（可选）
              <input
                id="illustCaption"
                value={draft.caption}
                onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
                placeholder="插入正文时的 caption"
              />
            </label>
            <label htmlFor="illustKeywords">
              匹配关键词（逗号分隔，可选）
              <input
                id="illustKeywords"
                value={draft.keywords}
                onChange={(event) => setDraft({ ...draft, keywords: event.target.value })}
                placeholder="add, playlist, tracks"
              />
            </label>
          </div>

          {draft.url.trim() && isAllowedIllustrationUrl(draft.url) ? (
            <div className="illust-form-preview">
              <img src={draft.url.trim()} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : null}

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSaveImage()}>
              {draft.id ? '保存修改' : '添加 URL'}
            </button>
            <button type="button" className="secondary" disabled={saving} onClick={() => void handleImportFile()}>
              从本地上传
            </button>
            {draft.id ? (
              <button type="button" className="secondary" onClick={() => setDraft(EMPTY_DRAFT)}>
                取消编辑
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  )
}
