import { useEffect, useState } from 'react'
import type { QuickPickOption } from '../../env.d'
import {
  formatUrlFilterInput,
  type InternalLinkCatalogSummary
} from '../../../../shared/internalLinks'

interface InternalLinkPanelProps {
  visible: boolean
  saving: boolean
  quickPicks: QuickPickOption[]
  onSavingChange: (saving: boolean) => void
  onStatus: (message: string) => void
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

export default function InternalLinkPanel({
  visible,
  saving,
  quickPicks,
  onSavingChange,
  onStatus
}: InternalLinkPanelProps) {
  const [selectedId, setSelectedId] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [sitemapUrl, setSitemapUrl] = useState('')
  const [includePatterns, setIncludePatterns] = useState('')
  const [excludePatterns, setExcludePatterns] = useState('')
  const [catalog, setCatalog] = useState<InternalLinkCatalogSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const selected = quickPicks.find((item) => item.id === selectedId) ?? null

  const productKey = quickPicks.map((item) => item.id).join('|')

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && quickPicks.some((item) => item.id === prev)) return prev
      return quickPicks[0]?.id ?? ''
    })
  }, [productKey])

  useEffect(() => {
    if (!visible) return
    if (!selectedId) {
      setCatalog(null)
      setSiteUrl('')
      setSitemapUrl('')
      setIncludePatterns('')
      setExcludePatterns('')
      return
    }

    let cancelled = false
    setLoading(true)
    void window.app
      .listInternalLinks(selectedId)
      .then((summary) => {
        if (cancelled) return
        setCatalog(summary)
        setSiteUrl(summary?.siteUrl ?? '')
        setSitemapUrl(summary?.sitemapUrl ?? '')
        setIncludePatterns(formatUrlFilterInput(summary?.includePatterns))
        setExcludePatterns(formatUrlFilterInput(summary?.excludePatterns))
      })
      .catch(() => {
        if (!cancelled) onStatus('内链库加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [visible, selectedId, onStatus])

  async function handleImport(): Promise<void> {
    if (!selected) {
      onStatus('请先选择产品')
      return
    }
    if (!siteUrl.trim()) {
      onStatus('请填写站点地址')
      return
    }
    onSavingChange(true)
    try {
      const result = await window.app.importInternalLinks({
        productId: selected.id,
        productName: selected.label,
        siteUrl,
        sitemapUrl: sitemapUrl.trim() || undefined,
        includePatterns,
        excludePatterns
      })
      setCatalog({
        productId: result.productId,
        productName: result.productName,
        siteUrl: result.siteUrl,
        sitemapUrl: result.sitemapUrl,
        importedAt: result.importedAt,
        truncated: result.truncated,
        includePatterns: result.includePatterns,
        excludePatterns: result.excludePatterns,
        count: result.count
      })
      setSiteUrl(result.siteUrl)
      if (result.sitemapUrl) setSitemapUrl(result.sitemapUrl)
      setIncludePatterns(formatUrlFilterInput(result.includePatterns))
      setExcludePatterns(formatUrlFilterInput(result.excludePatterns))
      onStatus(result.message ?? `已导入 ${result.count} 篇站内文章`)
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Sitemap 导入失败')
    } finally {
      onSavingChange(false)
    }
  }

  const canImport = Boolean(selected) && Boolean(siteUrl.trim()) && !saving

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2 className="section-title">内链库</h2>
          <p className="section-desc">
            按产品存放 Sitemap 导入的已发布文章。创作时只用当前所选产品的目录，把最多 4
            条内链嵌进已有段落，锚文本用正文里已有的短语。对不上就不插。不依赖 WordPress 账号。
          </p>
        </div>
      </div>

      <label htmlFor="internalLinkProduct">产品</label>
      {quickPicks.length === 0 ? (
        <p className="field-hint">请先在「产品配置」中添加产品。内链库按产品分目录，不在此新建产品。</p>
      ) : (
        <select
          id="internalLinkProduct"
          className="select-input"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={saving}
        >
          {quickPicks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      )}

      <label htmlFor="internalLinkSiteUrl">站点地址</label>
      <input
        id="internalLinkSiteUrl"
        type="url"
        value={siteUrl}
        onChange={(event) => setSiteUrl(event.target.value)}
        placeholder="https://example.com"
        autoComplete="off"
        disabled={!selected || saving}
      />

      <label htmlFor="internalLinkSitemapUrl">Sitemap 地址（可留空，将自动尝试常见路径）</label>
      <input
        id="internalLinkSitemapUrl"
        value={sitemapUrl}
        onChange={(event) => setSitemapUrl(event.target.value)}
        placeholder={`${siteUrl.trim() || 'https://example.com'}/sitemap_index.xml`}
        autoComplete="off"
        disabled={!selected || saving}
      />

      <label htmlFor="internalLinkInclude">只导入包含这些字段的 URL（可选）</label>
      <textarea
        id="internalLinkInclude"
        rows={3}
        value={includePatterns}
        onChange={(event) => setIncludePatterns(event.target.value)}
        placeholder={'/blog/\n/how-to/\n*spotify*'}
        disabled={!selected || saving}
      />
      <p className="field-hint">
        每行或用逗号分隔。留空表示不限制。填写后，URL 必须匹配其中至少一项才会导入。支持
        * 通配符。
      </p>

      <label htmlFor="internalLinkExclude">排除包含这些字段的 URL（可选）</label>
      <textarea
        id="internalLinkExclude"
        rows={3}
        value={excludePatterns}
        onChange={(event) => setExcludePatterns(event.target.value)}
        placeholder={'/tag/\n/promo/\n*coupon*'}
        disabled={!selected || saving}
      />
      <p className="field-hint">URL 匹配其中任一项则跳过。排除优先于包含。</p>

      <div className="actions">
        <button type="button" disabled={!canImport} onClick={() => void handleImport()}>
          {saving ? '正在导入…' : '导入 Sitemap'}
        </button>
      </div>

      <p className="field-hint">
        {!selected
          ? '请先选择产品后再导入'
          : loading
            ? '加载中…'
            : catalog
              ? `「${selected.label}」已索引 ${catalog.count} 篇${catalog.truncated ? '（已截断）' : ''} · ${formatTime(catalog.importedAt)}`
              : `「${selected.label}」尚未导入内链库`}
      </p>
    </section>
  )
}
