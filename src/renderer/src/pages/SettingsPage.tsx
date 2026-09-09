import { useEffect, useState } from 'react'
import type { AppConfig, LlmPreset, PipelineMode, QuickPickOption, SkillItem, SkillListMode } from '../env.d'
import { LANGUAGE_OPTIONS, REGION_OPTIONS } from '../constants/localeOptions'
import QuickPickEditor from './settings/QuickPickEditor'
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguageCode } from '../constants/outputLanguage'
import LlmPresetPanel from './settings/LlmPresetPanel'
import LlmRoleRoutingPanel from './settings/LlmRoleRoutingPanel'
import TokenLogPanel from './settings/TokenLogPanel'
import WindowClosePanel from './settings/WindowClosePanel'
import NetworkProxyPanel from './settings/NetworkProxyPanel'
import ImageGenPanel from './settings/ImageGenPanel'
import KnowledgeBasePanel from './settings/KnowledgeBasePanel'
import IllustrationLibraryPanel from './settings/IllustrationLibraryPanel'
import WordPressPanel from './settings/WordPressPanel'
import { normalizeWordPressSettings } from '../../../shared/wordpress'

type SettingsTab =
  | 'general'
  | 'llm'
  | 'tokenLog'
  | 'research'
  | 'shortcuts'
  | 'prompts'
  | 'skills'
  | 'knowledge'
  | 'illustrations'
  | 'imageGen'
  | 'wordpress'

const DEFAULT_CREATE_PROMPTS = {
  systemPrompt:
    '你是一位专业内容创作者。请严格遵循以下 Skills 中的写作规范：\n\n{{skills}}\n\n{{research}}',
  userPrompt:
    '请围绕以下主题创作一篇完整文章（Markdown 格式）：\n\n主题：{{topic}}\n{{extraInstructions}}\n\n在动笔前，请结合上方竞品调研参考（如有），确保文章在观点、结构或深度上具备差异化。\n直接输出正文，不要解释你将如何写作。'
}

const DEFAULT_OPTIMIZE_PROMPTS = {
  systemPrompt:
    '你是一位资深 SEO/GEO 编辑。请严格遵循以下 Skills 中的优化规范：\n\n{{skills}}\n\n{{research}}',
  userPrompt:
    '请基于以下原文 URL 与抓取内容，输出优化后的完整文章（Markdown）：\n\n原文：{{sourceUrl}}\n{{extraInstructions}}\n\n在动笔前，请结合竞品调研与 E-E-A-T 萃取（如有），在保留原文骨架的前提下做增量优化。\n直接输出正文，不要解释你将如何优化。'
}

const PIPELINE_MODE_OPTIONS: Array<{ value: SettingsPipelineMode; label: string; hint: string }> = [
  { value: 'create', label: '文章创作', hint: '用于从零生成新文章的 Pipeline' },
  { value: 'optimize', label: '文章优化', hint: '用于抓取原页并做 E-E-A-T 增量优化' }
]

const SKILL_LIST_MODE_OPTIONS: Array<{ value: SkillListMode; label: string; hint: string }> = [
  ...PIPELINE_MODE_OPTIONS,
  {
    value: 'batch-optimize',
    label: '页面批量优化',
    hint: '仅 Firecrawl 抓取 + 单次生成优化全文'
  },
  {
    value: 'writing-style',
    label: '写作风格',
    hint: '文风类 Skill 清单；explainer-voice 由创作页下拉选择。Humanizer 在润色去 AI 味阶段强制注入，不可关闭。'
  }
]

type SettingsPipelineMode = 'create' | 'optimize'

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
  const [testingModel, setTestingModel] = useState('')
  const [testingTavily, setTestingTavily] = useState(false)
  const [testingFirecrawl, setTestingFirecrawl] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pipelineMode, setPipelineMode] = useState<SettingsPipelineMode>('create')
  const [skillListMode, setSkillListMode] = useState<SkillListMode>('create')
  const [editingPresetId, setEditingPresetId] = useState('')

  useEffect(() => {
    if (visible) void loadData()
  }, [visible])

  useEffect(() => {
    if (visible && tab === 'skills') {
      void window.app.listSkills(skillListMode).then(setSkills)
    }
  }, [visible, tab, skillListMode])

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

  async function loadData(mode: SkillListMode = skillListMode): Promise<void> {
    const [nextConfig, nextSkills] = await Promise.all([
      window.app.getConfig(),
      window.app.listSkills(mode)
    ])
    setConfig(nextConfig)
    setSkills(nextSkills)
    setEditingPresetId(nextConfig.activeLlmPresetId || nextConfig.llmPresets[0]?.id || '')
  }

  function renderSkillListModeTabs(
    options: Array<{ value: SkillListMode; label: string; hint: string }>,
    activeMode: SkillListMode,
    onSelect: (mode: SkillListMode) => void
  ) {
    return (
      <div className="settings-pipeline-tabs" role="tablist" aria-label="Skill 分类">
        {options.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            className={`settings-pipeline-tab${activeMode === item.value ? ' active' : ''}`}
            aria-selected={activeMode === item.value}
            title={item.hint}
            onClick={() => onSelect(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  function renderPipelineModeTabs(
    options: Array<{ value: PipelineMode; label: string; hint: string }>,
    activeMode: PipelineMode,
    onSelect: (mode: PipelineMode) => void
  ) {
    return (
      <div className="settings-pipeline-tabs" role="tablist" aria-label="Pipeline 类型">
        {options.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            className={`settings-pipeline-tab${activeMode === item.value ? ' active' : ''}`}
            aria-selected={activeMode === item.value}
            title={item.hint}
            onClick={() => onSelect(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
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

  async function handleTestConnection(presetId: string, model: string): Promise<void> {
    setTesting(true)
    setTestingModel(model)
    setStatus(`正在测试「${model}」…`)
    const result = await window.app.testLlmConnection({ presetId, model })
    setStatus(result.message ?? (result.ok ? `「${model}」连接成功` : `「${model}」连接失败`))
    setTesting(false)
    setTestingModel('')
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
      await window.app.setSkillEnabled(id, enabled, skillListMode)
      setStatus(enabled ? 'Skill 已启用' : 'Skill 已禁用')
    } catch {
      await loadData()
      setStatus('Skill 状态更新失败')
    }
  }

  async function handleSaveSkill(): Promise<void> {
    if (editingSkill?.bundled) {
      setStatus('内置 Skill 为只读，请使用列表开关启用或禁用')
      return
    }
    if (!editingSkill?.name.trim()) {
      setStatus('请填写 Skill 名称')
      return
    }
    setSaving(true)
    try {
      await window.app.saveSkill(editingSkill, skillListMode === 'writing-style' ? 'create' : skillListMode)
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

  async function handleSaveLlmPresets(): Promise<void> {
    if (!config) return
    await handleSaveConfig({
      llmPresets: config.llmPresets
    })
  }

  async function handlePersistLlmPresets(presets: LlmPreset[]): Promise<void> {
    if (!config) return
    const next = await window.app.saveConfig({ llmPresets: presets })
    setConfig(next)
    onConfigSaved?.()
  }

  async function handlePersistLlmRoleRouting(routing: AppConfig['llmRoleRouting']): Promise<void> {
    if (!config) return
    try {
      const next = await window.app.saveConfig({ llmRoleRouting: routing })
      setConfig(next)
      onConfigSaved?.()
    } catch {
      setStatus('多模型分工保存失败')
    }
  }

  async function handleSaveWindowClose(): Promise<void> {
    if (!config) return
    await handleSaveConfig({
      windowClose: config.windowClose
    })
  }

  async function handleSaveNetworkProxy(): Promise<void> {
    if (!config) return
    const networkProxy = config.networkProxy ?? {
      enabled: false,
      host: '127.0.0.1',
      port: 8889
    }
    await handleSaveConfig({ networkProxy })
  }

  async function handleSaveImageGen(): Promise<void> {
    if (!config) return
    const imageGen = config.imageGen ?? {
      apiUrl: 'https://uuapi.shop/v1/images/generations',
      apiKey: '',
      model: 'gpt-image-2',
      size: '1024x1024',
      defaultPrompt: ''
    }
    await handleSaveConfig({ imageGen })
  }

  async function handleSaveWordPress(): Promise<void> {
    if (!config) return
    await handleSaveConfig({ wordpress: config.wordpress })
  }

  function handleSelectEditingPreset(id: string): void {
    setEditingPresetId(id)
  }

  function handleAddLlmPreset(): void {
    if (!config) return
    const preset: LlmPreset = {
      id: crypto.randomUUID(),
      name: '新预设',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: [],
      temperature: 0.7
    }
    setConfig({
      ...config,
      llmPresets: [...config.llmPresets, preset]
    })
    setEditingPresetId(preset.id)
  }

  async function handleDeleteLlmPreset(id: string): Promise<void> {
    if (!config || config.llmPresets.length <= 1) return
    if (!confirm('确定删除该 LLM 预设？')) return

    const nextPresets = config.llmPresets.filter((item) => item.id !== id)
    const nextActive =
      config.activeLlmPresetId === id ? nextPresets[0].id : config.activeLlmPresetId

    setConfig({
      ...config,
      llmPresets: nextPresets,
      activeLlmPresetId: nextActive
    })
    setEditingPresetId(nextActive)
    await handleSaveConfig({ llmPresets: nextPresets, activeLlmPresetId: nextActive })
  }

  function handleResetPrompts(): void {
    if (!config) return
    void handleSaveConfig({
      prompts: {
        ...config.prompts,
        [pipelineMode]:
          pipelineMode === 'optimize' ? DEFAULT_OPTIMIZE_PROMPTS : DEFAULT_CREATE_PROMPTS
      }
    })
  }

  async function updateQuickPicks(updater: (items: QuickPickOption[]) => QuickPickOption[]): Promise<void> {
    if (!config) return
    const nextItems = updater(config.quickPicks.products)
    await handleSaveConfig({
      quickPicks: {
        ...config.quickPicks,
        products: nextItems
      }
    })
  }

  function handleAddQuickPick(label: string): void {
    const item: QuickPickOption = { id: crypto.randomUUID(), label: label.trim() }
    void updateQuickPicks((items) => [...items, item])
  }

  function handleRemoveQuickPick(id: string): void {
    void updateQuickPicks((items) => items.filter((item) => item.id !== id))
  }

  function handleBindProductWordPressPreset(
    productId: string,
    wordpressPresetId: string | undefined
  ): void {
    void updateQuickPicks((items) =>
      items.map((item) => {
        if (item.id !== productId) return item
        if (!wordpressPresetId) {
          const { wordpressPresetId: _ignored, ...rest } = item
          return rest
        }
        return { ...item, wordpressPresetId }
      })
    )
  }

  async function handleDefaultOutputLanguageChange(code: OutputLanguageCode): Promise<void> {
    if (!config) return
    await handleSaveConfig({
      quickPicks: {
        ...config.quickPicks,
        defaultOutputLanguage: code
      }
    })
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
      <nav className="settings-nav" role="tablist" aria-label="配置分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'llm'}
          className={tab === 'llm' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('llm')}
        >
          LLM 配置
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tokenLog'}
          className={tab === 'tokenLog' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('tokenLog')}
        >
          Token 日志
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'research'}
          className={tab === 'research' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('research')}
        >
          竞品调研
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shortcuts'}
          className={tab === 'shortcuts' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('shortcuts')}
        >
          产品配置
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prompts'}
          className={tab === 'prompts' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('prompts')}
        >
          提示词
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'skills'}
          className={tab === 'skills' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('skills')}
        >
          Skill 管理
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'knowledge'}
          className={tab === 'knowledge' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('knowledge')}
        >
          知识库
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'illustrations'}
          className={tab === 'illustrations' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('illustrations')}
        >
          插图库
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'imageGen'}
          className={tab === 'imageGen' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('imageGen')}
        >
          绘图
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'wordpress'}
          className={tab === 'wordpress' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('wordpress')}
        >
          WordPress
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'general'}
          className={tab === 'general' ? 'settings-nav-item active' : 'settings-nav-item'}
          onClick={() => switchTab('general')}
        >
          通用
        </button>
      </nav>

      <div className="settings-content">
      <div className="settings-tab-pane" key={tab}>
      {tab === 'llm' && config && (
        <section className="panel">
          <h2 className="section-title">LLM 预设</h2>
          <p className="section-desc">
            配置多个 OpenAI 兼容 API 预设，并在各预设下添加可用模型；新对话中可自由选择模型。
          </p>

          <LlmPresetPanel
            config={config}
            editingPresetId={editingPresetId}
            saving={saving}
            testing={testing}
            testingModel={testingModel}
            onConfigChange={setConfig}
            onSave={() => void handleSaveLlmPresets()}
            onPersistPresets={(presets) => handlePersistLlmPresets(presets)}
            onStatus={setStatus}
            onTest={(presetId, model) => void handleTestConnection(presetId, model)}
            onSelectPreset={handleSelectEditingPreset}
            onAddPreset={handleAddLlmPreset}
            onDeletePreset={(id) => void handleDeleteLlmPreset(id)}
          />

          <div className="settings-subsection">
            <h3 className="subsection-title">多模型分工</h3>
            <p className="section-desc">
              启用后可为工作流指定两套模型：一套处理正文前分析与 Meta，一套处理大纲、正文撰写与润色。
            </p>
            <LlmRoleRoutingPanel
              config={config}
              onConfigChange={setConfig}
              onPersistRouting={(routing) => void handlePersistLlmRoleRouting(routing)}
            />
          </div>
        </section>
      )}

      {tab === 'tokenLog' && <TokenLogPanel onStatus={setStatus} />}

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
            description="创作页「产品名称」下拉选项。选中后会自动写入补充要求（Product name: …）。可点击「绑定」关联 WordPress 站点预设，创作时选中该产品后推送草稿将默认使用对应预设。"
            items={config.quickPicks.products}
            wordpressPresets={normalizeWordPressSettings(config.wordpress).presets}
            disabled={saving}
            onAdd={handleAddQuickPick}
            onRemove={handleRemoveQuickPick}
            onBindWordPressPreset={handleBindProductWordPressPreset}
          />
          <section className="panel quick-pick-panel">
            <h2 className="section-title">文本语言</h2>
            <p className="section-desc">
              创作页默认输出语言，仅规范 AI 终稿文本语言，不影响界面显示语言。
            </p>
            <label className="field-inline">
              <span>默认语言</span>
              <select
                value={config.quickPicks.defaultOutputLanguage ?? 'en'}
                disabled={saving}
                onChange={(e) => void handleDefaultOutputLanguageChange(e.target.value as OutputLanguageCode)}
              >
                {OUTPUT_LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </>
      )}

      {tab === 'prompts' && (
        <section className="panel">
          <h2 className="section-title">提示词模板</h2>
          <p className="section-desc">
            文章创作与文章优化使用独立的提示词配置，分别作用于对应 Pipeline。
          </p>
          {renderPipelineModeTabs(PIPELINE_MODE_OPTIONS, pipelineMode, (mode) =>
            setPipelineMode(mode as SettingsPipelineMode)
          )}
          <p className="section-desc">
            {pipelineMode === 'optimize' ? (
              <>
                可用变量：<code>{'{{skills}}'}</code>、<code>{'{{research}}'}</code>、
                <code>{'{{sourceUrl}}'}</code>、<code>{'{{extraInstructions}}'}</code>
              </>
            ) : (
              <>
                可用变量：<code>{'{{skills}}'}</code>、<code>{'{{research}}'}</code>、
                <code>{'{{topic}}'}</code>、<code>{'{{extraInstructions}}'}</code>
              </>
            )}
          </p>

          <label htmlFor="systemPrompt">System 提示词</label>
          <textarea
            id="systemPrompt"
            rows={8}
            value={config.prompts[pipelineMode].systemPrompt}
            onChange={(e) =>
              setConfig({
                ...config,
                prompts: {
                  ...config.prompts,
                  [pipelineMode]: {
                    ...config.prompts[pipelineMode],
                    systemPrompt: e.target.value
                  }
                }
              })
            }
          />

          <label htmlFor="userPrompt">User 提示词</label>
          <textarea
            id="userPrompt"
            rows={8}
            value={config.prompts[pipelineMode].userPrompt}
            onChange={(e) =>
              setConfig({
                ...config,
                prompts: {
                  ...config.prompts,
                  [pipelineMode]: {
                    ...config.prompts[pipelineMode],
                    userPrompt: e.target.value
                  }
                }
              })
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
                  文章创作不含优化类与写作风格 Skill；文章优化仅 article-optimizer；页面批量优化仅
                  page-batch-optimizer；写作风格为文风类 Skill 清单。创作时是否套用文风，以对话页「文风」下拉为准，与此处开关无关。
                </p>
              </div>
              <div className="section-actions">
                <button type="button" className="secondary" onClick={() => void loadData()}>
                  刷新列表
                </button>
                {skillListMode === 'create' ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditingSkill({ ...EMPTY_SKILL })}
                  >
                    新建 Skill
                  </button>
                ) : null}
              </div>
            </div>

            {renderSkillListModeTabs(SKILL_LIST_MODE_OPTIONS, skillListMode, (mode) => {
              setSkillListMode(mode)
              void window.app.listSkills(mode).then(setSkills)
            })}

            {skillListMode === 'writing-style' ? (
              <p className="empty-hint">
                explainer-voice 由创作页「文风」下拉选择。Humanizer 在文章创作的「润色并降低 AI 味」阶段强制注入，不可关闭。
              </p>
            ) : null}

            {skills.length === 0 ? (
              <p className="empty-hint">
                {skillListMode === 'writing-style'
                  ? '暂无写作风格 Skill。'
                  : '暂无 Skill，点击「新建 Skill」添加。'}
              </p>
            ) : (
              <ul className="skill-list">
                {skills.map((skill) => (
                  <li key={skill.id} className="skill-item">
                    <label className="skill-toggle">
                      <input
                        type="checkbox"
                        className="toggle-input"
                        checked={skill.enabled}
                        disabled={Boolean(skill.forced)}
                        onChange={(e) => void handleToggleSkill(skill.id, e.target.checked)}
                      />
                      <span className="toggle-switch" aria-hidden="true" />
                      <span className="toggle-label">
                        {skill.forced ? '润色强制' : skill.enabled ? '已启用' : '已禁用'}
                      </span>
                    </label>
                    <div className="skill-meta">
                      <strong>
                        {skill.name}
                        {skill.bundled ? <span className="skill-badge">内置</span> : null}
                        {skill.forced ? <span className="skill-badge">润色强制</span> : null}
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
              <h2 className="section-title">
                {editingSkill.bundled ? '查看 Skill' : editingSkill.id ? '编辑 Skill' : '新建 Skill'}
              </h2>

              <label htmlFor="skillName">名称</label>
              <input
                id="skillName"
                value={editingSkill.name}
                readOnly={editingSkill.bundled}
                onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
                placeholder="my-custom-skill"
              />

              <label htmlFor="skillDesc">描述</label>
              <textarea
                id="skillDesc"
                rows={2}
                value={editingSkill.description}
                readOnly={editingSkill.bundled}
                onChange={(e) => setEditingSkill({ ...editingSkill, description: e.target.value })}
                placeholder="简要说明该 Skill 的用途"
              />

              <label htmlFor="skillContent">Skill 内容（Markdown）</label>
              <textarea
                id="skillContent"
                rows={12}
                className="code-area"
                value={editingSkill.content}
                readOnly={editingSkill.bundled}
                onChange={(e) => setEditingSkill({ ...editingSkill, content: e.target.value })}
                placeholder="# 写作规范&#10;&#10;1. ..."
              />

              {!editingSkill.bundled ? (
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
              ) : (
                <p className="field-hint">内置 Skill 为只读；启用或禁用请使用上方列表中的开关。</p>
              )}

              <div className="actions">
                {!editingSkill.bundled ? (
                  <button type="button" disabled={saving} onClick={() => void handleSaveSkill()}>
                    保存 Skill
                  </button>
                ) : null}
                <button type="button" className="secondary" onClick={() => setEditingSkill(null)}>
                  {editingSkill.bundled ? '关闭' : '取消'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'knowledge' && (
        <KnowledgeBasePanel
          visible={visible}
          saving={saving}
          onSavingChange={setSaving}
          onStatus={setStatus}
        />
      )}

      {tab === 'illustrations' && (
        <IllustrationLibraryPanel
          visible={visible}
          saving={saving}
          quickPicks={config.quickPicks?.products ?? []}
          onSavingChange={setSaving}
          onStatus={setStatus}
        />
      )}

      {tab === 'imageGen' && config && (
        <section className="panel">
          <h2 className="section-title">绘图接口</h2>
          <p className="section-desc">
            配置图片生成 API（OpenAI Images 兼容）。左侧栏进入绘图后，将使用此处参数发起请求。
          </p>
          <ImageGenPanel
            config={config}
            saving={saving}
            onConfigChange={setConfig}
            onSave={() => void handleSaveImageGen()}
          />
        </section>
      )}

      {tab === 'wordpress' && config && (
        <section className="panel">
          <h2 className="section-title">WordPress 草稿</h2>
          <p className="section-desc">
            可配置多个 WordPress 站点预设。文章生成后在正文下方手动推送为草稿；推送时可选择目标预设。批量创作与批量优化不会自动推送。
          </p>
          <WordPressPanel
            config={config}
            saving={saving}
            onConfigChange={setConfig}
            onSave={() => void handleSaveWordPress()}
            onStatus={setStatus}
          />
        </section>
      )}

      {tab === 'general' && config && (
        <>
          <section className="panel">
            <h2 className="section-title">网络代理</h2>
            <p className="section-desc">
              配置应用出站 HTTP 代理。默认直连；开启后走下方主机与端口（默认 8889）。
            </p>
            <NetworkProxyPanel
              config={config}
              saving={saving}
              onConfigChange={setConfig}
              onSave={() => void handleSaveNetworkProxy()}
            />
          </section>
          <section className="panel">
            <h2 className="section-title">关闭窗口</h2>
            <p className="section-desc">
              设置点击右上角关闭按钮时的默认行为，可与关闭确认弹窗中的「以后不再提示」联动。
            </p>
            <WindowClosePanel
              config={config}
              saving={saving}
              onConfigChange={setConfig}
              onSave={() => void handleSaveWindowClose()}
            />
          </section>
        </>
      )}

      </div>
      </div>

      {status ? (
        <div
          className={`settings-toast${
            status.includes('成功') ||
            status.includes('已保存') ||
            status.includes('已连接') ||
            status.includes('已清空') ||
            status.includes('已删除') ||
            status.includes('已启用') ||
            status.includes('已禁用') ||
            status.includes('已导入') ||
            status.includes('已将') ||
            status.includes('已清除')
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
