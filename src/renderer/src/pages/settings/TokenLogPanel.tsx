import { useCallback, useEffect, useState } from 'react'
import type { TokenUsageRecord, TokenUsageSummary } from '../../env.d'

interface TokenLogPanelProps {
  onStatus?: (message: string) => void
}

const PIPELINE_LABELS: Record<string, string> = {
  create: '文章创作',
  optimize: '文章优化',
  sectionEdit: '部分重写',
  test: '连接测试',
  other: '其他'
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function formatTokens(value: number): string {
  return value.toLocaleString('zh-CN')
}

function truncate(text: string | undefined, max = 48): string {
  if (!text) return '—'
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export default function TokenLogPanel({ onStatus }: TokenLogPanelProps) {
  const [records, setRecords] = useState<TokenUsageRecord[]>([])
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [pipelineFilter, setPipelineFilter] = useState<string>('all')
  const [clearing, setClearing] = useState(false)

  const loadLog = useCallback(async () => {
    setLoading(true)
    try {
      const data = await window.app.getTokenUsageLog()
      setRecords(data.records)
      setSummary(data.summary)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLog()
  }, [loadLog])

  const filteredRecords =
    pipelineFilter === 'all'
      ? records
      : records.filter((record) => record.pipeline === pipelineFilter)

  async function handleClear(): Promise<void> {
    if (!window.confirm('确定清空全部 Token 日志？此操作不可恢复。')) return
    setClearing(true)
    try {
      await window.app.clearTokenUsageLog()
      await loadLog()
      onStatus?.('Token 日志已清空')
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="panel token-log-panel">
      <h2 className="section-title">Token 日志</h2>
      <p className="section-desc">
        记录每次文章创作、优化与部分重写过程中各 Pipeline 步骤的 LLM Token 用量（优先使用 API 返回的
        usage；流式或未返回时按字符估算，标记为「估算」）。
      </p>

      {summary ? (
        <div className="token-log-summary">
          <div className="token-log-stat">
            <span className="token-log-stat-label">累计 Total</span>
            <strong>{formatTokens(summary.totalTokens)}</strong>
            <span className="token-log-stat-sub">
              输入 {formatTokens(summary.totalPromptTokens)} · 输出{' '}
              {formatTokens(summary.totalCompletionTokens)}
            </span>
          </div>
          <div className="token-log-stat">
            <span className="token-log-stat-label">今日</span>
            <strong>{formatTokens(summary.todayTotalTokens)}</strong>
            <span className="token-log-stat-sub">{summary.todayRecordCount} 次请求</span>
          </div>
          <div className="token-log-stat">
            <span className="token-log-stat-label">记录</span>
            <strong>{summary.recordCount}</strong>
            <span className="token-log-stat-sub">{summary.runCount} 次生成任务</span>
          </div>
        </div>
      ) : null}

      <div className="token-log-toolbar">
        <label className="token-log-filter">
          <span>Pipeline</span>
          <select
            value={pipelineFilter}
            onChange={(e) => setPipelineFilter(e.target.value)}
          >
            <option value="all">全部</option>
            <option value="create">文章创作</option>
            <option value="optimize">文章优化</option>
            <option value="sectionEdit">部分重写</option>
          </select>
        </label>
        <div className="actions">
          <button type="button" className="secondary" disabled={loading} onClick={() => void loadLog()}>
            刷新
          </button>
          <button
            type="button"
            className="secondary"
            disabled={clearing || records.length === 0}
            onClick={() => void handleClear()}
          >
            清空日志
          </button>
        </div>
      </div>

      {loading ? (
        <p className="field-hint">加载中…</p>
      ) : filteredRecords.length === 0 ? (
        <p className="field-hint">暂无 Token 记录。完成一次创作或优化后在此查看。</p>
      ) : (
        <div className="token-log-table-wrap">
          <table className="token-log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>Pipeline</th>
                <th>步骤</th>
                <th>模型</th>
                <th>输入</th>
                <th>输出</th>
                <th>合计</th>
                <th>主题</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td>{formatTime(record.timestamp)}</td>
                  <td>{PIPELINE_LABELS[record.pipeline] ?? record.pipeline}</td>
                  <td title={record.label}>
                    {record.label || record.step}
                    {record.estimated ? <span className="token-log-estimated">估算</span> : null}
                  </td>
                  <td title={record.model}>{truncate(record.model, 28)}</td>
                  <td>{formatTokens(record.promptTokens)}</td>
                  <td>{formatTokens(record.completionTokens)}</td>
                  <td>
                    <strong>{formatTokens(record.totalTokens)}</strong>
                  </td>
                  <td title={record.topic}>{truncate(record.topic, 36)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
