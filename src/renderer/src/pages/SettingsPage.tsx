import { useEffect, useState } from 'react'
import type { AppConfig, QuickPickOption, SkillItem } from '../env.d'
import { LANGUAGE_OPTIONS, REGION_OPTIONS } from '../constants/localeOptions'
import QuickPickEditor from './settings/QuickPickEditor'

type SettingsTab = 'llm' | 'research' | 'shortcuts' | 'prompts' | 'skills'

const EMPTY_SKILL: SkillItem = {
  id: '',
  name: '',
  description: '',
  content: '',
  enabled: true
}

interface SettingsPageProps {
  visible?: boolean
  onConfigSaved?: () => void
}

export default function SettingsPage({ visible = true, onConfigSaved }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>('llm')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null)
  const [status, setStatus] = useState('')
  const [testing, setTesting] = useState(false)
  const [testingTavily, setTestingTavily] = useState(false)
  const [testingFirecrawl, setTestingFirecrawl] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) void loadData()
  }, [visible])

  useEffect(() => {
    if (visible && tab === 'skills') {
      void window.app.listSkills().then(setSkills)
    }
  }, [visible, tab])

  useEffect(() => {
    if (!status || status === '正在保存…' || status.startsWith('正在测试')) return
    const delay = status.includes('失败') ? 5000 : 2500
    const timer = window.setTimeout(() => setStatus(''), delay)
    return () => window.clearTimeout(timer)
  }, [status])

  function switchTab(next: SettingsTab): void {
    setTab(next)
    setStatus('')
  }

  async function loadData(): Promise<void> {
    const [nextConfig, nextSkills] = await Promise.all([window.app.getConfig(), window.app.listSkills()])
    setConfig(nextConfig)
    setSkills(nextSkills)
  }

  async function handleSaveConfig(partial: Partial<AppConfig>): Promise<void> {
    if (!config) return
    setSaving(true)
    setStatus('正在保存…')
    try {
      const next = await window.app.saveConfig(partial)
      setConfig(next)
      setStatus('保存成功')
      onConfigSaved?.()
    } catch {
      setStatus('保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true)
    setStatus('正在测试连接…')
    const result = await window.app.testLlmConnection()
    setStatus(result.message ?? (result.ok ? '连接成功' : '连接失败'))
    setTesting(false)
  }

  async function handleTestTavily(): Promise<void> {
    if (!config) return
    setTestingTavily(true)
    setStatus('正在测试 Tavily…')
    const result = await window.app.testTavilyConnection(config.research.tavilyApiKey)
    setStatus(result.message ?? (result.ok ? 'Tavily 连接成功' : 'Tavily 连接失败'))
    setTestingTavily(false)
  }

  async function handleTestFirecrawl(): Promise<void> {
    if (!config) return
    setTestingFirecrawl(true)
    setStatus('正在测试 Firecrawl…')
    const result = await window.app.testFirecrawlConnection(config.research.firecrawlApiKey)
    setStatus(result.message ?? (result.ok ? 'Firecrawl 连接成功' : 'Firecrawl 连接失败'))
    setTestingFirecrawl(false)
  }

  async function handleToggleSkill(id: string, enabled: boolean): Promise<void> {
    setSkills((prev) => prev.map((skill) => (skill.id === id ? { ...skill, enabled } : skill)))
    try {
      await window.app.setSkillEnabled(id, enabled)
      setStatus(enabled ? 'Skill 已启用' : 'Skill 已禁用')
    } catch {
      await loadData()
      setStatus('Skill 状态更新失败')
    }
  }

  async function handleSaveSkill(): Promise<void> {
    if (!editingSkill?.name.trim()) {
      setStatus('请填写 Skill 名称')
      return
    }
    setSaving(true)
    try {
      await window.app.saveSkill(editingSkill)
      setEditingSkill(null)
      await loadData()
      setStatus('Skill 已保存')
    } catch {
      setStatus('Skill 保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSkill(id: string): Promise<void> {
    const skill = skills.find((item) => item.id === id)
    if (skill?.bundled) {
      setStatus('内置 Skill 不可删除，请使用开关禁用')
      return
    }
    if (!confirm('确定删除该 Skill？')) return
    try {
      await window.app.deleteSkill(id)
      if (editingSkill?.id === id) setEditingSkill(null)
      await loadData()
      setStatus('Skill 已删除')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Skill 删除失败')
    }
  }

  function handleResetPrompts(): void {
    if (!config) return
    void handleSaveConfig({
      prompts: {
        systemPrompt:
          '你是一位专业内容创作者。请严格遵循以下 Skills 中的写作规范：\n\n{{skills}}\n\n{{research}}',
        userPrompt:
          '请围绕以下主题创作一篇完整文章（Markdown 格式）：\n\n主题：{{topic}}\n{{extraInstructions}}\n\n在动笔前，请结合上方竞品调研参考（如有），确保文章在观点、结构或深度上具备差异化。\n直接输出正文，不要解释你将如何写作。'
      }
    })
  }

  async function updateQuickPicks(
    type: 'products' | 'audiences',
    updater: (items: QuickPickOption[]) => QuickPickOption[]
  ): Promise<void> {
    if (!config) return
    const nextItems = updater(config.quickPicks[type])
    await handleSaveConfig({
      quickPicks: {
        ...config.quickPicks,
        [type]: nextItems
      }
    })
  }

  function handleAddQuickPick(type: 'products' | 'audiences', label: string): void {
    const item: QuickPickOption = { id: crypto.randomUUID(), label: label.trim() }
    void updateQuickPicks(type, (items) => [...items, item])
  }

  function handleRemoveQuickPick(type: 'products' | 'audiences', id: string): void {
    void updateQuickPicks(type, (items) => items.filter((item) => item.id !== id))
  }

  if (!config) {
    return (
      <section className="panel panel-loading">
        <div className="loading-spinner" />
        <p>加载配置中…</p>
      </section>
    )
  }

  return (
    <div className="settings-page">
      <nav className="settings-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'llm'}
          className={tab === 'llm' ? 'tab active' : 'tab'}
          onClick={() => switchTab('llm')}
        >
          LLM 配置
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'research'}
          className={tab === 'research' ? 'tab active' : 'tab'}
          onClick={() => switchTab('research')}
        >
          竞品调研
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shortcuts'}
          className={tab === 'shortcuts' ? 'tab active' : 'tab'}
          onClick={() => switchTab('shortcuts')}
        >
          快捷选项
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prompts'}
          className={tab === 'prompts' ? 'tab active' : 'tab'}
          onClick={() => switchTab('prompts')}
        >
          提示词
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'skills'}
          className={tab === 'skills' ? 'tab active' : 'tab'}
          onClick={() => switchTab('skills')}
        >
          Skill 管理
        </button>
      </nav>

      <div className="settings-content">
      {tab === 'llm' && (
        <section className="panel">
          <h2 className="section-title">LLM 配置</h2>
          <p className="section-desc">配置 OpenAI 兼容接口，用于文章生成。</p>

          <label htmlFor="apiKey">API Key</label>
          <input
            id="apiKey"
            type="password"
            value={config.llm.apiKey}
            onChange={(e) => setConfig({ ...config, llm: { ...config.llm, apiKey: e.target.value } })}
            placeholder="sk-..."
          />

          <label htmlFor="baseUrl">Base URL</label>
          <input
            id="baseUrl"
            value={config.llm.baseUrl}
            onChange={(e) => setConfig({ ...config, llm: { ...config.llm, baseUrl: e.target.value } })}
            placeholder="https://api.openai.com/v1"
          />

          <div className="form-row">
            <div>
              <label htmlFor="model">模型</label>
              <input
                id="model"
                value={config.llm.model}
                onChange={(e) => setConfig({ ...config, llm: { ...config.llm, model: e.target.value } })}
                placeholder="gpt-4o"
              />
            </div>
            <div>
              <label htmlFor="temperature">Temperature ({config.llm.temperature})</label>
              <input
                id="temperature"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.llm.temperature}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    llm: { ...config.llm, temperature: Number(e.target.value) }
                  })
                }
              />
            </div>
          </div>

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSaveConfig({ llm: config.llm })}>
              保存配置
            </button>
            <button type="button" className="secondary" disabled={testing} onClick={() => void handleTestConnection()}>
              {testing ? '测试中…' : '测试连接'}
            </button>
          </div>
        </section>
      )}

      {tab === 'research' && (
        <section className="panel">
          <h2 className="section-title">竞品调研</h2>
          <p className="section-desc">
            支持 Pipeline 第 ② 步：Tavily 多关键词搜索 Top 10 URL，Firecrawl 抓取 Markdown 正文供 E-E-A-T 萃取。
            成文语言自动跟随创作主题（与下方「语言」设置无关，后者仅影响搜索偏好）。
          </p>

          <label className="skill-toggle inline-toggle">
            <input
              type="checkbox"
              className="toggle-input"
              checked={config.research.enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  research: { ...config.research, enabled: e.target.checked }
                })
              }
            />
            <span className="toggle-switch" aria-hidden="true" />
            <span className="toggle-label">创作前自动进行竞品调研</span>
          </label>

          <label htmlFor="tavilyKey">Tavily API Key</label>
          <input
            id="tavilyKey"
            type="password"
            value={config.research.tavilyApiKey}
            onChange={(e) =>
              setConfig({
                ...config,
                research: { ...config.research, tavilyApiKey: e.target.value }
              })
            }
            placeholder="从 tavily.com 获取"
          />

          <label htmlFor="firecrawlKey">Firecrawl API Key</label>
          <input
            id="firecrawlKey"
            type="password"
            value={config.research.firecrawlApiKey}
            onChange={(e) =>
              setConfig({
                ...config,
                research: { ...config.research, firecrawlApiKey: e.target.value }
              })
            }
            placeholder="从 firecrawl.dev 获取"
          />

          <div className="form-row">
            <div>
              <label htmlFor="maxSearch">Tavily 结果上限 ({config.research.maxSearchResults})</label>
              <input
                id="maxSearch"
                type="range"
                min="3"
                max="10"
                step="1"
                value={config.research.maxSearchResults}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    research: { ...config.research, maxSearchResults: Number(e.target.value) }
                  })
                }
              />
            </div>
            <div>
              <label htmlFor="maxScrape">Firecrawl 抓取页数 ({config.research.maxPagesToScrape})</label>
              <input
                id="maxScrape"
                type="range"
                min="1"
                max="10"
                step="1"
                value={config.research.maxPagesToScrape}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    research: { ...config.research, maxPagesToScrape: Number(e.target.value) }
                  })
                }
              />
            </div>
          </div>

          <div className="form-row">
            <div>
              <label htmlFor="searchRegion">地区</label>
              <select
                id="searchRegion"
                className="select-input"
                value={config.research.searchRegion}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    research: { ...config.research, searchRegion: e.target.value }
                  })
                }
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="searchLanguage">搜索偏好语言</label>
              <select
                id="searchLanguage"
                className="select-input"
                value={config.research.searchLanguage}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    research: { ...config.research, searchLanguage: e.target.value }
                  })
                }
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSaveConfig({ research: config.research })}>
              保存配置
            </button>
            <button type="button" className="secondary" disabled={testingTavily} onClick={() => void handleTestTavily()}>
              {testingTavily ? '测试中…' : '测试 Tavily'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={testingFirecrawl}
              onClick={() => void handleTestFirecrawl()}
            >
              {testingFirecrawl ? '测试中…' : '测试 Firecrawl'}
            </button>
          </div>
        </section>
      )}

      {tab === 'shortcuts' && (
        <>
          <QuickPickEditor
            title="产品名称"
            description="创作页「产品名称」下拉选项。选中后会自动写入补充要求（Product name: …）。"
            placeholder="例如：TuneFab Spotify Music Converter"
            items={config.quickPicks.products}
            disabled={saving}
            onAdd={(label) => handleAddQuickPick('products', label)}
            onRemove={(id) => handleRemoveQuickPick('products', id)}
          />
          <QuickPickEditor
            title="目标读者"
            description="创作页「目标读者」下拉选项。选中后会自动写入补充要求（Target audience: …）。"
            placeholder="例如：US music lovers who want offline Spotify playback"
            items={config.quickPicks.audiences}
            disabled={saving}
            onAdd={(label) => handleAddQuickPick('audiences', label)}
            onRemove={(id) => handleRemoveQuickPick('audiences', id)}
          />
        </>
      )}

      {tab === 'prompts' && (
        <section className="panel">
          <h2 className="section-title">提示词模板</h2>
          <p className="section-desc">
            可用变量：<code>{'{{skills}}'}</code>、<code>{'{{research}}'}</code>、<code>{'{{topic}}'}</code>、
            <code>{'{{extraInstructions}}'}</code>
          </p>

          <label htmlFor="systemPrompt">System 提示词</label>
          <textarea
            id="systemPrompt"
            rows={8}
            value={config.prompts.systemPrompt}
            onChange={(e) =>
              setConfig({ ...config, prompts: { ...config.prompts, systemPrompt: e.target.value } })
            }
          />

          <label htmlFor="userPrompt">User 提示词</label>
          <textarea
            id="userPrompt"
            rows={8}
            value={config.prompts.userPrompt}
            onChange={(e) =>
              setConfig({ ...config, prompts: { ...config.prompts, userPrompt: e.target.value } })
            }
          />

          <div className="actions">
            <button type="button" disabled={saving} onClick={() => void handleSaveConfig({ prompts: config.prompts })}>
              保存提示词
            </button>
            <button type="button" className="secondary" onClick={handleResetPrompts}>
              恢复默认
            </button>
          </div>
        </section>
      )}

      {tab === 'skills' && (
        <>
          <section className="panel">
            <div className="section-header">
              <div>
                <h2 className="section-title">Skill 列表</h2>
                <p className="section-desc">
                  管理写作规范，启用的 Skill 会在创作时注入 Pipeline。内置 Skill 随应用打包，不可删除。
                </p>
              </div>
              <div className="section-actions">
                <button type="button" className="secondary" onClick={() => void loadData()}>
                  刷新列表
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingSkill({ ...EMPTY_SKILL })}
                >
                  新建 Skill
                </button>
              </div>
            </div>

            {skills.length === 0 ? (
              <p className="empty-hint">暂无 Skill，点击「新建 Skill」添加。</p>
            ) : (
              <ul className="skill-list">
                {skills.map((skill) => (
                  <li key={skill.id} className="skill-item">
                    <label className="skill-toggle">
                      <input
                        type="checkbox"
                        className="toggle-input"
                        checked={skill.enabled}
                        onChange={(e) => void handleToggleSkill(skill.id, e.target.checked)}
                      />
                      <span className="toggle-switch" aria-hidden="true" />
                      <span className="toggle-label">{skill.enabled ? '已启用' : '已禁用'}</span>
                    </label>
                    <div className="skill-meta">
                      <strong>
                        {skill.name}
                        {skill.bundled ? <span className="skill-badge">内置</span> : null}
                      </strong>
                      <span>{skill.description || '无描述'}</span>
                    </div>
                    <div className="skill-actions">
                      <button type="button" className="secondary" onClick={() => setEditingSkill({ ...skill })}>
                        {skill.bundled ? '查看' : '编辑'}
                      </button>
                      {!skill.bundled ? (
                        <button type="button" className="danger" onClick={() => void handleDeleteSkill(skill.id)}>
                          删除
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editingSkill && (
            <section className="panel">
              <h2 className="section-title">{editingSkill.id ? '编辑 Skill' : '新建 Skill'}</h2>

              <label htmlFor="skillName">名称</label>
              <input
                id="skillName"
                value={editingSkill.name}
                onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                placeholder="article-writing"
              />

              <label htmlFor="skillDesc">描述</label>
              <textarea
                id="skillDesc"
                rows={2}
                value={editingSkill.description}
                onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                placeholder="简要说明该 Skill 的用途"
              />

              <label htmlFor="skillContent">Skill 内容（Markdown）</label>
              <textarea
                id="skillContent"
                rows={12}
                className="code-area"
                value={editingSkill.content}
                onChange={(e) => setEditingSkill({ ...editingSkill, content: e.target.value })}
                placeholder="# 写作规范&#10;&#10;1. ..."
              />

              <label className="skill-toggle inline-toggle">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={editingSkill.enabled}
                  onChange={(e) => setEditingSkill({ ...editingSkill, enabled: e.target.checked })}
                />
                <span className="toggle-switch" aria-hidden="true" />
                <span className="toggle-label">保存后启用此 Skill</span>
              </label>

              <div className="actions">
                <button type="button" disabled={saving} onClick={() => void handleSaveSkill()}>
                  保存 Skill
                </button>
                <button type="button" className="secondary" onClick={() => setEditingSkill(null)}>
                  取消
                </button>
              </div>
            </section>
          )}
        </>
      )}

      </div>

      {status ? (
        <div
          className={`settings-toast${
            status.includes('成功') ||
            status.includes('已保存') ||
            status.includes('已删除') ||
            status.includes('已启用') ||
            status.includes('已禁用')
              ? ' is-success'
              : ''
          }`}
          role="status"
        >
          {status}
        </div>
      ) : null}
    </div>
  )
}
