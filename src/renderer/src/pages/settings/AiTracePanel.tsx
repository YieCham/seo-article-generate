import { useEffect, useState } from 'react'
import {
  normalizeAiTraceConfig,
  type AiTraceConfig,
  type AiTraceHit,
  type AiTracePattern,
  type AiTracePatternVerdict,
  type AiTraceReading,
  type AiTraceReport
} from '../../../../shared/aiTrace'
import type { AppConfig } from '../../env.d'
import {
  encodeLlmModelOptionId,
  formatLlmModelOptionLabel,
  listUnionLlmModels,
  type LlmModelOption
} from '../../utils/llmModels'

interface AiTracePanelProps {
  config: AppConfig
  visible?: boolean
  onConfigChange: (config: AppConfig) => void
  onConfigSaved?: () => void
  onStatus: (message: string) => void
}

type HitTab = 'hits' | 'known'

function formatRatio(ratio: number): string {
  const percent = Math.round(ratio * 1000) / 10
  return `${percent}%`
}

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function kindLabel(kind: AiTraceHit['kind']): string {
  if (kind === 'sentence') return '整句'
  if (kind === 'known') return '套话'
  return '短语'
}

const VERDICT_LABEL: Record<AiTracePatternVerdict, string> = {
  universal: '普遍',
  partial: '部分成立',
  insufficient: '证据不足',
  rejected: '不成立'
}

const VERDICT_ORDER: Record<AiTracePatternVerdict, number> = {
  universal: 0,
  insufficient: 1,
  partial: 2,
  rejected: 3
}

function ReadingSection({
  reading,
  busy,
  disabled,
  models,
  presetId,
  model,
  onModelChange,
  onRead
}: {
  reading?: AiTraceReading
  busy: boolean
  disabled: boolean
  models: LlmModelOption[]
  presetId: string
  model: string
  onModelChange: (presetId: string, model: string) => void
  onRead: () => void
}) {
  const patterns = [...(reading?.patterns ?? [])].sort(
    (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.supportCount - a.supportCount
  )
  const universal = patterns.filter((item) => item.verdict === 'universal').length
  const selectedId =
    presetId && model && models.some((item) => item.presetId === presetId && item.model === model)
      ? encodeLlmModelOptionId(presetId, model)
      : ''

  return (
    <div className="settings-subsection">
      <h3 className="subsection-title">模型归纳</h3>
      <p className="field-hint" style={{ marginTop: 0 }}>
        第一轮读开头、各节首段和结尾，提出跨篇规律。第二轮不看那些原句，重新读文章：样本够时用另一批页面，不够时重读同一批，但只采纳新的原文。标成普遍的规律才适合拿去约束以后的写作。阅读模型在旁边单独选，与写作时的当前模型无关，也不会在标为已完成时自动运行。
      </p>
      <label htmlFor="aiTraceReadModel">阅读模型</label>
      <div className="ai-trace-read-row">
        <select
          id="aiTraceReadModel"
          className="select-input"
          value={selectedId}
          disabled={disabled || models.length === 0}
          onChange={(event) => {
            const next = models.find((item) => item.id === event.target.value)
            onModelChange(next?.presetId ?? '', next?.model ?? '')
          }}
        >
          <option value="">{models.length === 0 ? '请先在 LLM 配置里添加模型' : '选择模型'}</option>
          {models.map((item) => (
            <option key={item.id} value={item.id}>
              {formatLlmModelOptionLabel(item)}
            </option>
          ))}
        </select>
        <button type="button" disabled={disabled || !selectedId} onClick={onRead}>
          {busy ? '正在阅读…' : '让模型读两轮'}
        </button>
      </div>
      {!reading ? (
        <p className="field-hint">还没有读过。</p>
      ) : (
        <>
          <p className={`field-hint${reading.status === 'error' ? ' ai-trace-reading-error' : ''}`} style={{ marginTop: 0 }}>
            {formatWhen(reading.scannedAt)} · {reading.message}
          </p>
          {reading.status === 'ok' ? (
            <div className="ai-trace-summary">
              <div className="token-log-stat">
                <span className="token-log-stat-label">发现 / 复核</span>
                <strong>
                  {reading.discoveryPageCount} / {reading.verifyPageCount}
                </strong>
              </div>
              <div className="token-log-stat">
                <span className="token-log-stat-label">普遍规律</span>
                <strong>{universal}</strong>
              </div>
              <div className="token-log-stat">
                <span className="token-log-stat-label">全部规律</span>
                <strong>{patterns.length}</strong>
              </div>
            </div>
          ) : null}
          {patterns.length > 0 ? (
            <div className="ai-trace-list">
              {patterns.map((pattern) => (
                <PatternCard key={pattern.name} pattern={pattern} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function PatternCard({ pattern }: { pattern: AiTracePattern }) {
  return (
    <details className={`ai-trace-hit${pattern.verdict === 'rejected' ? ' is-rejected' : ''}`}>
      <summary>
        <span className={`ai-trace-kind is-${pattern.verdict}`}>{VERDICT_LABEL[pattern.verdict]}</span>
        <span className="ai-trace-phrase">{pattern.name}</span>
        <span className="ai-trace-meta">
          复核 {pattern.supportCount}/{pattern.checkedCount} 篇 · {formatRatio(pattern.ratio)}
          {pattern.why ? ` · ${pattern.why}` : ''}
        </span>
      </summary>
      <div className="ai-trace-pattern-body">
        {pattern.suggestion && pattern.verdict !== 'rejected' ? <p>以后可以这样写：{pattern.suggestion}</p> : null}
        {pattern.support.length > 0 ? (
          <>
            <p>复核时找到的新原句</p>
            <ul className="ai-trace-pages">
              {pattern.support.map((item) => (
                <li key={`${item.sessionId}:${item.quote}`}>
                  <strong>{item.title}</strong>
                  <span>{item.quote}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>复核没有找到第一轮没用过的新原句。</p>
        )}
        {pattern.counterexamples.length > 0 ? (
          <>
            <p>看不出这个习惯的页面</p>
            <ul className="ai-trace-pages">
              {pattern.counterexamples.map((item) => (
                <li key={item.sessionId}>
                  <strong>{item.title}</strong>
                  <span>{item.note}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {pattern.discoveryQuotes.length > 0 ? (
          <>
            <p>第一轮用过的原句</p>
            <ul className="ai-trace-pages">
              {pattern.discoveryQuotes.map((item) => (
                <li key={`${item.sessionId}:${item.quote}`}>
                  <strong>{item.title}</strong>
                  <span>{item.quote}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  )
}

export default function AiTracePanel({
  config,
  visible = true,
  onConfigChange,
  onConfigSaved,
  onStatus
}: AiTracePanelProps) {
  const [draft, setDraft] = useState<AiTraceConfig>(() => normalizeAiTraceConfig(config.aiTrace))
  const [ignoreText, setIgnoreText] = useState(() => draft.ignorePhrases.join('\n'))
  const [report, setReport] = useState<AiTraceReport | null>(null)
  const [hitTab, setHitTab] = useState<HitTab>('hits')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<'save' | 'scan' | 'read' | null>(null)

  const traceKey = JSON.stringify(config.aiTrace ?? null)

  useEffect(() => {
    const next = normalizeAiTraceConfig(config.aiTrace)
    setDraft(next)
    setIgnoreText(next.ignorePhrases.join('\n'))
  }, [traceKey, config.aiTrace])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void window.app.getAiTraceReport().then((next) => {
      if (!cancelled) setReport(next)
    })
    return () => {
      cancelled = true
    }
  }, [visible])

  function patch(partial: Partial<AiTraceConfig>): void {
    setDraft((current) => normalizeAiTraceConfig({ ...current, ...partial }))
  }

  function currentTrace(): AiTraceConfig {
    return normalizeAiTraceConfig({
      ...draft,
      ignorePhrases: ignoreText.split(/\r?\n/)
    })
  }

  async function persist(trace: AiTraceConfig): Promise<boolean> {
    const saved = await window.app.saveConfig({ aiTrace: trace })
    onConfigChange(saved)
    onConfigSaved?.()
    return true
  }

  async function handleSave(): Promise<void> {
    setBusy('save')
    onStatus('正在保存…')
    try {
      await persist(currentTrace())
      onStatus('AI 痕迹设置已保存')
    } catch {
      onStatus('保存失败')
    } finally {
      setBusy(null)
    }
  }

  async function handleScan(): Promise<void> {
    setBusy('scan')
    onStatus('正在扫描已完成页面…')
    try {
      await persist(currentTrace())
      const next = await window.app.scanAiTrace()
      setReport(next)
      setHitTab(next.hits.length === 0 && next.knownHits.length > 0 ? 'known' : 'hits')
      onStatus(next.message)
    } catch {
      onStatus('扫描失败')
    } finally {
      setBusy(null)
    }
  }

  async function handleRead(): Promise<void> {
    setBusy('read')
    onStatus('正在阅读已完成页面…')
    try {
      await persist(currentTrace())
      const next = await window.app.readAiTrace()
      setReport(next)
      onStatus(next.reading?.message || '模型阅读完成')
    } catch {
      onStatus('阅读失败')
    } finally {
      setBusy(null)
    }
  }

  const activeHits = report ? (hitTab === 'known' ? report.knownHits : report.hits) : []
  const needle = query.trim().toLowerCase()
  const visibleHits = needle
    ? activeHits.filter(
        (hit) =>
          hit.phrase.toLowerCase().includes(needle) ||
          hit.pages.some((page) => page.title.toLowerCase().includes(needle))
      )
    : activeHits

  return (
    <>
      <p className="field-hint" style={{ marginTop: 0 }}>
        统计侧边栏「已完成」里已有成稿的页面，按一句话出现在多少篇里计数。扫描在本地完成，不调用模型。结构标题、产品名本身，以及合规免责声明不会进入结果。
      </p>

      <label className="skill-toggle inline-toggle">
        <input
          type="checkbox"
          className="toggle-input"
          checked={draft.autoOnComplete}
          onChange={(event) => patch({ autoOnComplete: event.target.checked })}
        />
        <span className="toggle-switch" aria-hidden="true" />
        <span className="toggle-label">标为已完成时自动扫描</span>
      </label>
      <p className="field-hint">保存后生效。点「扫描已完成页面」会先保存当前规则再扫描。</p>

      <div className="ai-trace-fields">
        <div>
          <label htmlFor="aiTraceMinCorpus">最低样本（篇）</label>
          <input
            id="aiTraceMinCorpus"
            type="number"
            min={2}
            max={200}
            value={draft.minCorpusPages}
            onChange={(event) => patch({ minCorpusPages: Number(event.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="aiTraceMinDocs">至少出现（篇）</label>
          <input
            id="aiTraceMinDocs"
            type="number"
            min={2}
            max={100}
            value={draft.minDocuments}
            onChange={(event) => patch({ minDocuments: Number(event.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="aiTraceMinRatio">占比下限（%）</label>
          <input
            id="aiTraceMinRatio"
            type="number"
            min={5}
            max={100}
            value={Math.round(draft.minRatio * 100)}
            onChange={(event) => patch({ minRatio: Number(event.target.value) / 100 })}
          />
        </div>
        <div>
          <label htmlFor="aiTraceMinTokens">短语最短（词）</label>
          <input
            id="aiTraceMinTokens"
            type="number"
            min={3}
            max={12}
            value={draft.minPhraseTokens}
            onChange={(event) => patch({ minPhraseTokens: Number(event.target.value) })}
          />
        </div>
        <div>
          <label htmlFor="aiTraceMaxTokens">短语最长（词）</label>
          <input
            id="aiTraceMaxTokens"
            type="number"
            min={4}
            max={24}
            value={draft.maxPhraseTokens}
            onChange={(event) => patch({ maxPhraseTokens: Number(event.target.value) })}
          />
        </div>
      </div>
      <p className="field-hint">
        样本少于最低篇数时不统计。高频语句需要同时达到篇数和占比。已知套话只要出现在 2 篇及以上就会单独列出。
      </p>

      <label htmlFor="aiTraceIgnore">忽略短语</label>
      <textarea
        id="aiTraceIgnore"
        rows={5}
        value={ignoreText}
        placeholder={'一行一条。不少于 8 个字时，包含该片段的整句会跳过。\n例如：for personal offline listening'}
        onChange={(event) => setIgnoreText(event.target.value)}
      />

      <div className="actions">
        <button type="button" disabled={busy !== null} onClick={() => void handleSave()}>
          {busy === 'save' ? '正在保存…' : '保存设置'}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void handleScan()}>
          {busy === 'scan' ? '正在扫描…' : '扫描已完成页面'}
        </button>
      </div>

      <ReadingSection
        reading={report?.reading}
        busy={busy === 'read'}
        disabled={busy !== null}
        models={listUnionLlmModels(config.llmPresets)}
        presetId={draft.readPresetId}
        model={draft.readModel}
        onModelChange={(readPresetId, readModel) => patch({ readPresetId, readModel })}
        onRead={() => void handleRead()}
      />

      <div className="settings-subsection">
        <h3 className="subsection-title">扫描报告</h3>
        {!report ? (
          <p className="field-hint" style={{ marginTop: 0 }}>
            还没有扫描过。
          </p>
        ) : (
          <>
            <p className="field-hint" style={{ marginTop: 0 }}>
              {formatWhen(report.scannedAt)} · {report.message} 规则：至少 {report.rules.minDocuments}{' '}
              篇且占比 ≥ {formatRatio(report.rules.minRatio)}，样本不少于 {report.rules.minCorpusPages} 篇。
            </p>
            <div className="ai-trace-summary">
              <div className="token-log-stat">
                <span className="token-log-stat-label">已扫描</span>
                <strong>{report.pageCount}</strong>
              </div>
              <div className="token-log-stat">
                <span className="token-log-stat-label">高频语句</span>
                <strong>{report.hits.length}</strong>
              </div>
              <div className="token-log-stat">
                <span className="token-log-stat-label">已知套话</span>
                <strong>{report.knownHits.length}</strong>
              </div>
            </div>

            {report.scannedPages.length > 0 ? (
              <details className="ai-trace-scope">
                <summary>本次扫描的页面（{report.scannedPages.length}）</summary>
                <ul>
                  {report.scannedPages.map((page) => (
                    <li key={page.sessionId}>{page.title}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {report.status === 'ok' ? (
              <>
                <div className="settings-pipeline-tabs" role="tablist" aria-label="扫描结果">
                  <button
                    type="button"
                    role="tab"
                    className={`settings-pipeline-tab${hitTab === 'hits' ? ' active' : ''}`}
                    aria-selected={hitTab === 'hits'}
                    onClick={() => setHitTab('hits')}
                  >
                    高频语句（{report.hits.length}）
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`settings-pipeline-tab${hitTab === 'known' ? ' active' : ''}`}
                    aria-selected={hitTab === 'known'}
                    onClick={() => setHitTab('known')}
                  >
                    已知套话（{report.knownHits.length}）
                  </button>
                </div>
                <label htmlFor="aiTraceFilter" className="sr-only">
                  筛选语句
                </label>
                <input
                  id="aiTraceFilter"
                  type="search"
                  value={query}
                  placeholder="筛选语句或页面标题"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {visibleHits.length === 0 ? (
                  <p className="field-hint">这一栏没有匹配的语句。</p>
                ) : (
                  <div className="ai-trace-list">
                    {visibleHits.map((hit) => (
                      <details key={`${hit.kind}:${hit.phrase}`} className="ai-trace-hit">
                        <summary>
                          <span className="ai-trace-kind">{kindLabel(hit.kind)}</span>
                          <span className="ai-trace-phrase">{hit.phrase}</span>
                          <span className="ai-trace-meta">
                            {hit.documentCount} 篇 · {formatRatio(hit.ratio)}
                          </span>
                        </summary>
                        <ul className="ai-trace-pages">
                          {hit.pages.slice(0, 30).map((page) => (
                            <li key={page.sessionId}>{page.title}</li>
                          ))}
                          {hit.pages.length > 30 ? <li>另有 {hit.pages.length - 30} 篇</li> : null}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
