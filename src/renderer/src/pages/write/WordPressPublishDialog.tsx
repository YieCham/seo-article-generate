import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImageHistoryItem, WordPressPreset, WordPressTerm } from '../../env.d'
import {
  DEFAULT_WORDPRESS_SETTINGS,
  isWordPressConfigured,
  normalizeWordPressSettings,
  parseArticleForWordPress,
  resolveActiveWordPressPreset,
  resolveWordPressPreset,
  slugifyTitle,
  type WordPressDraftBinding,
  type WordPressPublishRequest
} from '../../../../shared/wordpress'

interface WordPressPublishDialogProps {
  open: boolean
  markdown: string
  sessionId: string
  sessionTitle: string
  existingDraft?: WordPressDraftBinding
  /** From the product currently selected on the write page, if bound to a WP preset. */
  preferredWordpressPresetId?: string
  onClose: () => void
  onPublished: (binding: WordPressDraftBinding, message: string) => void
}

export default function WordPressPublishDialog({
  open,
  markdown,
  sessionId,
  sessionTitle,
  existingDraft,
  preferredWordpressPresetId,
  onClose,
  onPublished
}: WordPressPublishDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const parsed = useMemo(() => parseArticleForWordPress(markdown), [markdown])
  const [presets, setPresets] = useState<WordPressPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [title, setTitle] = useState(parsed.title)
  const [slug, setSlug] = useState(parsed.slug)
  const [metaTitle, setMetaTitle] = useState(parsed.metaTitle)
  const [metaDescription, setMetaDescription] = useState(parsed.metaDescription)
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [tagIds, setTagIds] = useState<number[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [tagNamesToCreate, setTagNamesToCreate] = useState<string[]>([])
  const [categories, setCategories] = useState<WordPressTerm[]>([])
  const [tags, setTags] = useState<WordPressTerm[]>([])
  const [images, setImages] = useState<ImageHistoryItem[]>([])
  const [featuredImageFileName, setFeaturedImageFileName] = useState<string | null>(null)
  const [forceNew, setForceNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const wordpress =
    presets.find((item) => item.id === selectedPresetId) ??
    presets[0] ??
    resolveActiveWordPressPreset(DEFAULT_WORDPRESS_SETTINGS)

  const sameSiteBinding =
    Boolean(existingDraft?.postId) &&
    Boolean(selectedPresetId) &&
    (!existingDraft?.presetId || existingDraft.presetId === selectedPresetId)

  const configured = isWordPressConfigured(wordpress)
  const canUpdateExisting = sameSiteBinding && !forceNew

  useEffect(() => {
    if (!open) return
    setTitle(parsed.title)
    setSlug(parsed.slug)
    setMetaTitle(parsed.metaTitle)
    setMetaDescription(parsed.metaDescription)
    setNewTagName('')
    setTagNamesToCreate([])
    setFeaturedImageFileName(null)
    setForceNew(false)
    setError('')
    cancelRef.current?.focus()
  }, [open, parsed])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, submitting])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [config, history] = await Promise.all([
          window.app.getConfig(),
          window.app.listImageHistory()
        ])
        if (cancelled) return
        const settings = normalizeWordPressSettings(config.wordpress ?? DEFAULT_WORDPRESS_SETTINGS)
        setPresets(settings.presets)
        setImages(history)

        const preferredId =
          (preferredWordpressPresetId &&
          settings.presets.some((item) => item.id === preferredWordpressPresetId)
            ? preferredWordpressPresetId
            : null) ||
          (existingDraft?.presetId &&
          settings.presets.some((item) => item.id === existingDraft.presetId)
            ? existingDraft.presetId
            : null) ||
          settings.activePresetId

        setSelectedPresetId(preferredId)
      } catch {
        if (!cancelled) setError('加载 WordPress 配置失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, existingDraft?.presetId, preferredWordpressPresetId])

  useEffect(() => {
    if (!open || !selectedPresetId || presets.length === 0) return
    let cancelled = false

    async function loadTermsForPreset(): Promise<void> {
      const nextWp = resolveWordPressPreset(
        { presets, activePresetId: selectedPresetId },
        selectedPresetId
      )
      setCategoryIds(nextWp.defaultCategoryIds)
      setTagIds(nextWp.defaultTagIds)
      setCategories([])
      setTags([])

      if (!isWordPressConfigured(nextWp)) return

      setLoading(true)
      try {
        const terms = await window.app.listWordPressTerms(nextWp)
        if (cancelled) return
        if (!terms.ok) {
          setError(terms.message ?? '无法加载分类与标签')
        } else {
          setError('')
        }
        setCategories(terms.categories)
        setTags(terms.tags)
      } catch {
        if (!cancelled) setError('加载分类与标签失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadTermsForPreset()
    return () => {
      cancelled = true
    }
  }, [open, selectedPresetId, presets])

  function toggleId(list: number[], id: number, setter: (next: number[]) => void): void {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }

  function handleAddTag(): void {
    const name = newTagName.trim()
    if (!name) return
    if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      const match = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase())
      if (match && !tagIds.includes(match.id)) setTagIds([...tagIds, match.id])
      setNewTagName('')
      return
    }
    if (!tagNamesToCreate.includes(name)) {
      setTagNamesToCreate([...tagNamesToCreate, name])
    }
    setNewTagName('')
  }

  async function handleSubmit(): Promise<void> {
    if (!configured) {
      setError('请先在设置中填写该预设的站点地址、用户名和应用程序密码。')
      return
    }
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError('请填写文章标题。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const request: WordPressPublishRequest = {
        sessionId,
        sessionTitle,
        markdown,
        title: nextTitle,
        slug: slugifyTitle(slug || nextTitle),
        metaTitle: metaTitle.trim() || nextTitle,
        metaDescription: metaDescription.trim(),
        categoryIds,
        tagIds,
        tagNamesToCreate,
        featuredImageFileName,
        existingPostId: canUpdateExisting ? (existingDraft?.postId ?? null) : null,
        forceNew: !canUpdateExisting || forceNew,
        presetId: wordpress.id
      }
      const result = await window.app.publishWordPressDraft(request)
      if (!result.ok || !result.binding) {
        setError(result.message ?? '推送失败')
        return
      }
      onPublished(
        result.binding,
        result.warning ? `${result.message} ${result.warning}` : (result.message ?? '已推送')
      )
    } catch {
      setError('推送 WordPress 草稿失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="ui-overlay write-mode-picker-backdrop" onClick={() => !submitting && onClose()}>
      <div
        className="ui-dialog wordpress-publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wp-publish-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="wp-publish-title" className="write-mode-picker-title">
          {canUpdateExisting ? '更新 WordPress 草稿' : '推送到 WordPress 草稿'}
        </h2>
        <p className="session-confirm-desc">
          始终以草稿写入，不会自动发布。可选择推送到哪个已保存的站点预设。
        </p>

        <label htmlFor="wpPublishPreset">目标站点预设</label>
        <select
          id="wpPublishPreset"
          className="session-rename-input"
          value={selectedPresetId}
          disabled={presets.length === 0}
          onChange={(event) => {
            setSelectedPresetId(event.target.value)
            setForceNew(false)
          }}
        >
          {presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.siteUrl ? ` · ${item.siteUrl}` : ''}
            </option>
          ))}
        </select>

        {!configured ? (
          <p className="wp-publish-error">请先到设置 → WordPress 填写该预设的站点与应用程序密码。</p>
        ) : null}

        {existingDraft?.postId && sameSiteBinding ? (
          <label className="session-confirm-checkbox">
            <input
              type="checkbox"
              checked={forceNew}
              onChange={(event) => setForceNew(event.target.checked)}
            />
            <span>
              改为新建草稿（当前绑定 #{existingDraft.postId}
              {existingDraft.editLink ? (
                <>
                  {' '}
                  ·{' '}
                  <a href={existingDraft.editLink} target="_blank" rel="noreferrer">
                    打开已有草稿
                  </a>
                </>
              ) : null}
              ）
            </span>
          </label>
        ) : null}

        {existingDraft?.postId && !sameSiteBinding ? (
          <p className="field-hint">
            当前会话草稿绑定在其他站点。切换到本预设将新建草稿，不会覆盖原站点文章。
          </p>
        ) : null}

        <label htmlFor="wpPublishTitle">文章标题</label>
        <input
          id="wpPublishTitle"
          className="session-rename-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <label htmlFor="wpPublishSlug">Slug</label>
        <input
          id="wpPublishSlug"
          className="session-rename-input"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />

        <label htmlFor="wpPublishMetaTitle">SEO 标题</label>
        <input
          id="wpPublishMetaTitle"
          className="session-rename-input"
          value={metaTitle}
          onChange={(event) => setMetaTitle(event.target.value)}
        />

        <label htmlFor="wpPublishMetaDesc">SEO 描述 / 摘要</label>
        <textarea
          id="wpPublishMetaDesc"
          className="wp-publish-textarea"
          rows={3}
          value={metaDescription}
          onChange={(event) => setMetaDescription(event.target.value)}
        />

        {loading ? <p className="field-hint">正在加载分类、标签与配图…</p> : null}

        <div className="wp-term-pickers">
          <div className="wp-term-picker">
            <span className="wp-term-picker-label">分类</span>
            <div className="wp-term-list">
              {categories.length === 0 ? (
                <p className="field-hint">暂无分类</p>
              ) : (
                categories.map((term) => (
                  <label key={term.id} className="wp-term-item">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(term.id)}
                      onChange={() => toggleId(categoryIds, term.id, setCategoryIds)}
                    />
                    <span>{term.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="wp-term-picker">
            <span className="wp-term-picker-label">标签</span>
            <div className="wp-term-list">
              {tags.map((term) => (
                <label key={term.id} className="wp-term-item">
                  <input
                    type="checkbox"
                    checked={tagIds.includes(term.id)}
                    onChange={() => toggleId(tagIds, term.id, setTagIds)}
                  />
                  <span>{term.name}</span>
                </label>
              ))}
              {tagNamesToCreate.map((name) => (
                <label key={name} className="wp-term-item">
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      setTagNamesToCreate(tagNamesToCreate.filter((item) => item !== name))
                    }
                  />
                  <span>{name}（新建）</span>
                </label>
              ))}
            </div>
            <div className="wp-tag-create">
              <input
                type="text"
                value={newTagName}
                placeholder="输入新标签"
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddTag()
                  }
                }}
              />
              <button type="button" className="secondary" onClick={handleAddTag}>
                添加
              </button>
            </div>
          </div>
        </div>

        <div className="wp-featured">
          <span className="wp-term-picker-label">特色图（可选，来自绘图历史）</span>
          {canUpdateExisting && existingDraft?.featuredMediaId && !featuredImageFileName ? (
            <p className="field-hint">更新草稿时默认保留已有特色图；点选下方图片可替换。</p>
          ) : null}
          {images.length === 0 ? (
            <p className="field-hint">绘图历史为空。可先到「绘图」生成后再选特色图。</p>
          ) : (
            <div className="wp-featured-grid">
              <button
                type="button"
                className={`wp-featured-item${featuredImageFileName == null ? ' is-selected' : ''}`}
                onClick={() => setFeaturedImageFileName(null)}
              >
                不上传
              </button>
              {images.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`wp-featured-item${
                    featuredImageFileName === item.fileName ? ' is-selected' : ''
                  }`}
                  onClick={() => setFeaturedImageFileName(item.fileName)}
                  title={item.prompt}
                >
                  <img src={item.imageSrc} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="wp-publish-error">{error}</p> : null}

        <div className="session-rename-actions session-confirm-actions">
          <button ref={cancelRef} type="button" className="secondary" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={submitting || !configured} onClick={() => void handleSubmit()}>
            {submitting
              ? '正在推送…'
              : canUpdateExisting
                ? '更新草稿'
                : '创建草稿'}
          </button>
        </div>
      </div>
    </div>
  )
}
