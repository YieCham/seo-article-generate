import { useCallback, useEffect, useState } from 'react'
import type {
  AppConfig,
  WordPressPreset,
  WordPressPublishLogRecord,
  WordPressTerm
} from '../../env.d'
import { IconNewPreset } from '../../components/Icons'
import {
  DEFAULT_WORDPRESS_SETTINGS,
  WORDPRESS_SEO_PLUGIN_OPTIONS,
  createDefaultWordPressPreset,
  normalizeWordPressSettings,
  resolveActiveWordPressPreset,
  type WordPressSeoPlugin
} from '../../../../shared/wordpress'

interface WordPressPanelProps {
  config: AppConfig
  saving: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
  onStatus?: (message: string) => void
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function TermChecklist({
  id,
  label,
  terms,
  selectedIds,
  onChange
}: {
  id: string
  label: string
  terms: WordPressTerm[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  const selected = new Set(selectedIds)
  return (
    <div className="wp-term-picker">
      <span className="wp-term-picker-label">{label}</span>
      {terms.length === 0 ? (
        <p className="field-hint">暂无{label}。请先测试连接以从站点加载。</p>
      ) : (
        <div className="wp-term-list" id={id}>
          {terms.map((term) => (
            <label key={term.id} className="wp-term-item">
              <input
                type="checkbox"
                checked={selected.has(term.id)}
                onChange={() => {
                  const next = selected.has(term.id)
                    ? selectedIds.filter((item) => item !== term.id)
                    : [...selectedIds, term.id]
                  onChange(next)
                }}
              />
              <span>
                {term.name}
                {typeof term.count === 'number' ? (
                  <span className="wp-term-count">{term.count}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WordPressPanel({
  config,
  saving,
  onConfigChange,
  onSave,
  onStatus
}: WordPressPanelProps) {
  const wordpress = normalizeWordPressSettings(config.wordpress ?? DEFAULT_WORDPRESS_SETTINGS)
  const [editingPresetId, setEditingPresetId] = useState(wordpress.activePresetId)
  const [testing, setTesting] = useState(false)
  const [loadingTerms, setLoadingTerms] = useState(false)
  const [categories, setCategories] = useState<WordPressTerm[]>([])
  const [tags, setTags] = useState<WordPressTerm[]>([])
  const [records, setRecords] = useState<WordPressPublishLogRecord[]>([])
  const [loadingLog, setLoadingLog] = useState(true)
  const [clearingLog, setClearingLog] = useState(false)

  const preset =
    wordpress.presets.find((item) => item.id === editingPresetId) ??
    resolveActiveWordPressPreset(wordpress)

  useEffect(() => {
    if (!wordpress.presets.some((item) => item.id === editingPresetId)) {
      setEditingPresetId(wordpress.activePresetId || wordpress.presets[0]?.id || '')
    }
  }, [wordpress.activePresetId, wordpress.presets, editingPresetId])

  function patchSettings(
    partial: Partial<{ presets: WordPressPreset[]; activePresetId: string }>
  ): void {
    onConfigChange({
      ...config,
      wordpress: normalizeWordPressSettings({
        ...wordpress,
        ...partial
      })
    })
  }

  function patchPreset(partial: Partial<WordPressPreset>): void {
    patchSettings({
      presets: wordpress.presets.map((item) =>
        item.id === preset.id ? { ...item, ...partial } : item
      )
    })
  }

  const loadLog = useCallback(async () => {
    setLoadingLog(true)
    try {
      const data = await window.app.getWordPressPublishLog()
      setRecords(data.records)
    } finally {
      setLoadingLog(false)
    }
  }, [])

  const loadTerms = useCallback(
    async (override?: WordPressPreset) => {
      setLoadingTerms(true)
      try {
        const result = await window.app.listWordPressTerms(override)
        if (!result.ok) {
          onStatus?.(result.message ?? '加载分类/标签失败')
          return
        }
        setCategories(result.categories)
        setTags(result.tags)
      } finally {
        setLoadingTerms(false)
      }
    },
    [onStatus]
  )

  useEffect(() => {
    void loadLog()
  }, [loadLog])

  useEffect(() => {
    setCategories([])
    setTags([])
  }, [preset.id])

  function handleAddPreset(): void {
    const next = createDefaultWordPressPreset({
      id: crypto.randomUUID(),
      name: `站点 ${wordpress.presets.length + 1}`,
      siteUrl: '',
      username: '',
      applicationPassword: '',
      seoPlugin: 'none',
      defaultCategoryIds: [],
      defaultTagIds: []
    })
    patchSettings({
      presets: [...wordpress.presets, next],
      activePresetId: next.id
    })
    setEditingPresetId(next.id)
  }

  function handleDeletePreset(): void {
    if (wordpress.presets.length <= 1) {
      onStatus?.('至少保留一个 WordPress 预设')
      return
    }
    if (!window.confirm(`确定删除预设「${preset.name}」？`)) return
    const nextPresets = wordpress.presets.filter((item) => item.id !== preset.id)
    const nextActive =
      wordpress.activePresetId === preset.id ? nextPresets[0].id : wordpress.activePresetId
    patchSettings({ presets: nextPresets, activePresetId: nextActive })
    setEditingPresetId(nextActive)
  }

  function handleSetActive(): void {
    patchSettings({ activePresetId: preset.id })
    onStatus?.(`已将「${preset.name}」设为默认推送预设`)
  }

  async function handleTest(): Promise<void> {
    setTesting(true)
    try {
      const result = await window.app.testWordPressConnection(preset)
      onStatus?.(result.message ?? (result.ok ? '连接成功' : '连接失败'))
      if (result.ok) await loadTerms(preset)
    } catch {
      onStatus?.('连接 WordPress 失败')
    } finally {
      setTesting(false)
    }
  }

  async function handleClearLog(): Promise<void> {
    if (!window.confirm('确定清空 WordPress 推送日志？此操作不可恢复。')) return
    setClearingLog(true)
    try {
      await window.app.clearWordPressPublishLog()
      await loadLog()
      onStatus?.('WordPress 推送日志已清空')
    } finally {
      setClearingLog(false)
    }
  }

  const isActive = wordpress.activePresetId === preset.id

  return (
    <>
      <p className="field-hint" style={{ marginTop: 0 }}>
        可保存多个 WordPress 站点预设。推送时可选目标站点；默认预设用于未特别指定时。密钥只保存在本机，不会发给写作模型。批量创作 / 批量优化不会自动推送。
      </p>

      <div className="llm-preset-toolbar">
        <label htmlFor="wpEditingPreset">编辑预设</label>
        <select
          id="wpEditingPreset"
          value={preset.id}
          onChange={(event) => setEditingPresetId(event.target.value)}
        >
          {wordpress.presets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.id === wordpress.activePresetId ? '（默认）' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="llm-preset-add-btn"
          title="新增预设"
          aria-label="新增预设"
          onClick={handleAddPreset}
        >
          <IconNewPreset size={16} />
        </button>
      </div>

      <label htmlFor="wpPresetName">预设名称</label>
      <input
        id="wpPresetName"
        type="text"
        value={preset.name}
        placeholder="例如：主站 / 博客站"
        autoComplete="off"
        onChange={(event) => patchPreset({ name: event.target.value })}
      />

      <label htmlFor="wpSiteUrl">站点地址</label>
      <input
        id="wpSiteUrl"
        type="url"
        value={preset.siteUrl}
        placeholder="https://example.com"
        autoComplete="off"
        onChange={(event) => patchPreset({ siteUrl: event.target.value })}
      />

      <div className="form-row">
        <label htmlFor="wpUsername">
          用户名
          <input
            id="wpUsername"
            type="text"
            value={preset.username}
            placeholder="WordPress 登录用户名"
            autoComplete="off"
            onChange={(event) => patchPreset({ username: event.target.value })}
          />
        </label>
        <label htmlFor="wpAppPassword">
          应用程序密码
          <input
            id="wpAppPassword"
            type="password"
            value={preset.applicationPassword}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            autoComplete="off"
            onChange={(event) => patchPreset({ applicationPassword: event.target.value })}
          />
        </label>
      </div>
      <p className="field-hint">
        用户名请填登录名或登录邮箱，不要填显示名称。应用程序密码在「用户 → 个人资料 →
        应用程序密码」生成，不要填登录密码。站点地址请与浏览器最终网址一致（https、是否带
        www、是否在子目录）。
      </p>

      <label htmlFor="wpSeoPlugin">SEO 插件字段</label>
      <select
        id="wpSeoPlugin"
        className="select-input"
        value={preset.seoPlugin}
        onChange={(event) => patchPreset({ seoPlugin: event.target.value as WordPressSeoPlugin })}
      >
        {WORDPRESS_SEO_PLUGIN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="field-hint">
        {WORDPRESS_SEO_PLUGIN_OPTIONS.find((item) => item.value === preset.seoPlugin)?.hint}
      </p>

      <div className="actions">
        <button type="button" className="secondary" disabled={testing || saving} onClick={() => void handleTest()}>
          {testing ? '正在测试…' : '测试连接'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loadingTerms || testing || saving}
          onClick={() => void loadTerms(preset)}
        >
          {loadingTerms ? '加载中…' : '加载分类/标签'}
        </button>
        <button type="button" className="secondary" disabled={saving || isActive} onClick={handleSetActive}>
          {isActive ? '当前默认' : '设为默认'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={saving || wordpress.presets.length <= 1}
          onClick={handleDeletePreset}
        >
          删除预设
        </button>
        <button type="button" disabled={saving} onClick={onSave}>
          保存 WordPress 设置
        </button>
      </div>

      <div className="wp-term-pickers">
        <TermChecklist
          id="wpDefaultCategories"
          label="默认分类"
          terms={categories}
          selectedIds={preset.defaultCategoryIds}
          onChange={(ids) => patchPreset({ defaultCategoryIds: ids })}
        />
        <TermChecklist
          id="wpDefaultTags"
          label="默认标签"
          terms={tags}
          selectedIds={preset.defaultTagIds}
          onChange={(ids) => patchPreset({ defaultTagIds: ids })}
        />
      </div>

      <h3 className="subsection-title wp-log-title">推送日志</h3>
      <p className="field-hint">记录每次手动创建或更新草稿的结果。失败也会留下原因，便于排查。</p>
      <div className="token-log-toolbar">
        <div className="actions">
          <button type="button" className="secondary" disabled={loadingLog} onClick={() => void loadLog()}>
            刷新
          </button>
          <button
            type="button"
            className="secondary"
            disabled={clearingLog || records.length === 0}
            onClick={() => void handleClearLog()}
          >
            {clearingLog ? '清空中…' : '清空日志'}
          </button>
        </div>
      </div>
      {loadingLog ? (
        <p className="field-hint">加载中…</p>
      ) : records.length === 0 ? (
        <p className="field-hint">暂无推送记录。在文章下方点击「推送到 WordPress」后会出现在这里。</p>
      ) : (
        <div className="token-log-table-wrap">
          <table className="token-log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>预设</th>
                <th>结果</th>
                <th>标题</th>
                <th>草稿</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 50).map((record) => (
                <tr key={record.id}>
                  <td>{formatTime(record.timestamp)}</td>
                  <td title={record.presetName || record.siteUrl}>
                    {record.presetName || '—'}
                  </td>
                  <td>{record.ok ? (record.created ? '已创建' : '已更新') : '失败'}</td>
                  <td title={record.title}>{record.title}</td>
                  <td>
                    {record.ok && record.editLink ? (
                      <a href={record.editLink} target="_blank" rel="noreferrer">
                        打开后台
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td title={record.message}>{record.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
