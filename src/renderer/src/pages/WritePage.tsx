import { useEffect, useRef, useState } from 'react'

import type { GenerateProgressEvent, QuickPicksConfig } from '../env.d'
import {
  ARTICLE_TYPE_STORAGE_KEY,
  REVIEW_SKILL_ID,
  type ArticleType
} from '../constants/articleTypes'
import { type WriteMode } from '../constants/writeMode'
import {
  DEFAULT_OUTPUT_LANGUAGE,
  OUTPUT_LANGUAGE_STORAGE_KEY,
  isOutputLanguageCode,
  type OutputLanguageCode
} from '../constants/outputLanguage'
import { syncReviewSkillForArticleType } from '../utils/writeModeSkills'
import {
  buildExtraInstructions,
  formatOptimizeUserMessageContent,
  formatUserMessageContent
} from '../utils/extraInstructions'

import ChatSidebar from './write/ChatSidebar'

import ChatThread from './write/ChatThread'

import Composer from './write/Composer'

import WriteModePickerDialog from './write/WriteModePickerDialog'

import { createMessage, createSession, getSessionDisplayTitle, sessionTitleFromPrompt, sessionTitleFromUrl, type ChatSession } from './write/types'



interface WritePageProps {
  onOpenSettings: () => void
  configRevision: number
}

export default function WritePage({ onOpenSettings, configRevision }: WritePageProps) {

  const [sessions, setSessions] = useState<ChatSession[]>([])

  const [activeSessionId, setActiveSessionId] = useState<string>('')

  const [hydrated, setHydrated] = useState(false)

  const [draftTopic, setDraftTopic] = useState('')

  const [draftExtra, setDraftExtra] = useState('')
  const [quickPicks, setQuickPicks] = useState<QuickPicksConfig>({
    products: [],
    defaultOutputLanguage: DEFAULT_OUTPUT_LANGUAGE
  })
  const [selectedProductId, setSelectedProductId] = useState('')
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE)
  const [articleType, setArticleType] = useState<ArticleType>('how-to')
  const [modePickerOpen, setModePickerOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [sectionEditing, setSectionEditing] = useState(false)
  const [runningSessionId, setRunningSessionId] = useState('')

  const [toast, setToast] = useState('')

  const generatingSessionIdRef = useRef<string>('')

  const saveTimerRef = useRef<number | null>(null)



  const activeSession =

    sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null

  const activeWriteMode: WriteMode = activeSession?.writeMode ?? 'create'



  useEffect(() => {

    let cancelled = false



    void window.app.loadChatStore().then((store) => {

      if (cancelled) return



      if (store.sessions.length > 0) {

        setSessions(
          store.sessions.map((session) => ({
            ...session,
            writeMode: session.writeMode === 'optimize' ? 'optimize' : 'create'
          }))
        )

        setActiveSessionId(store.activeSessionId || store.sessions[0].id)

      } else {

        const session = createSession()

        setSessions([session])

        setActiveSessionId(session.id)

      }



      setHydrated(true)

    })



    return () => {

      cancelled = true

    }

  }, [])

  useEffect(() => {
    if (!hydrated) return
    void window.app.getConfig().then((config) => {
      const picks = config.quickPicks ?? { products: [], defaultOutputLanguage: DEFAULT_OUTPUT_LANGUAGE }
      setQuickPicks(picks)
      setSelectedProductId((prev) => (picks.products.some((item) => item.id === prev) ? prev : ''))
      const storedLang = localStorage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY)
      const defaultLang = isOutputLanguageCode(picks.defaultOutputLanguage)
        ? picks.defaultOutputLanguage
        : DEFAULT_OUTPUT_LANGUAGE
      setOutputLanguage(isOutputLanguageCode(storedLang) ? storedLang : defaultLang)
    })
  }, [hydrated, configRevision])

  useEffect(() => {
    if (!hydrated) return
    const storedType = localStorage.getItem(ARTICLE_TYPE_STORAGE_KEY)
    const initialType: ArticleType = storedType === 'review' ? 'review' : 'how-to'
    setArticleType(initialType)
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || activeWriteMode !== 'create') return
    void syncReviewSkillForArticleType(articleType)
  }, [hydrated, activeWriteMode, articleType])

  useEffect(() => {

    if (!hydrated) return



    if (saveTimerRef.current) {

      window.clearTimeout(saveTimerRef.current)

    }



    saveTimerRef.current = window.setTimeout(() => {

      void window.app.saveChatStore({

        activeSessionId,

        sessions

      })

    }, 400)



    return () => {

      if (saveTimerRef.current) {

        window.clearTimeout(saveTimerRef.current)

      }

    }

  }, [sessions, activeSessionId, hydrated])



  useEffect(() => {

    const unsubscribe = window.app.onProgress((event: GenerateProgressEvent) => {

      if (event.type === 'status' && event.message) {

        upsertStatusMessage(event.message)

      }

      if (event.type === 'research' && event.researchSummary) {

        upsertResearchMessage(event.researchSummary)

      }

      if (event.type === 'planning' && event.planningSummary) {

        upsertPlanningMessage(event.planningSummary)

      }

      if (event.type === 'reset') {

        resetAssistantContent()

      }

      if (event.type === 'prepend' && event.text) {

        prependAssistantContent(event.text)

      }

      if (event.type === 'chunk' && event.text) {

        appendAssistantChunk(event.text)

      }

      if (event.type === 'error' && event.message) {

        markAssistantError(event.message)
        setIsRunning(false)
        setRunningSessionId('')
        generatingSessionIdRef.current = ''
      }

      if (event.type === 'done') {
        finalizeAssistantMessage()
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }

    })

    return unsubscribe

  }, [activeSessionId])



  function updateSession(sessionId: string, updater: (session: ChatSession) => ChatSession): void {

    setSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)))

  }



  function getTargetSessionId(): string {

    return generatingSessionIdRef.current || activeSessionId

  }



  function upsertStatusMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = [...session.messages]

      const last = messages[messages.length - 1]

      if (last?.role === 'status') {

        messages[messages.length - 1] = { ...last, content }

      } else {

        messages.push(createMessage('status', content))

      }

      return { ...session, messages, updatedAt: Date.now() }

    })

  }



  function upsertResearchMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const withoutStatus = session.messages.filter((item) => item.role !== 'status')

      const withoutResearch = withoutStatus.filter((item) => item.role !== 'research')

      const researchMessage = createMessage('research', content)

      const last = withoutResearch[withoutResearch.length - 1]



      if (last?.role === 'assistant') {

        return {

          ...session,

          messages: [...withoutResearch.slice(0, -1), researchMessage, last],

          updatedAt: Date.now()

        }

      }



      return {

        ...session,

        messages: [...withoutResearch, researchMessage],

        updatedAt: Date.now()

      }

    })

  }



  function upsertPlanningMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const withoutStatus = session.messages.filter((item) => item.role !== 'status')

      const withoutPlanning = withoutStatus.filter((item) => item.role !== 'planning')

      const planningMessage = createMessage('planning', content)

      const last = withoutPlanning[withoutPlanning.length - 1]



      if (last?.role === 'assistant') {

        return {

          ...session,

          messages: [...withoutPlanning.slice(0, -1), planningMessage, last],

          updatedAt: Date.now()

        }

      }



      return {

        ...session,

        messages: [...withoutPlanning, planningMessage],

        updatedAt: Date.now()

      }

    })

  }



  function resetAssistantContent(): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming' ? { ...item, content: '' } : item

        ),

      updatedAt: Date.now()

    }))

  }



  function appendAssistantChunk(text: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = [...session.messages]

      const filtered = messages.filter((item) => item.role !== 'status')

      const last = filtered[filtered.length - 1]

      if (last?.role === 'assistant' && last.status === 'streaming') {

        filtered[filtered.length - 1] = { ...last, content: last.content + text }

      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }

  function prependAssistantContent(text: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = [...session.messages]

      const filtered = messages.filter((item) => item.role !== 'status')

      const last = filtered[filtered.length - 1]

      if (last?.role === 'assistant' && last.status === 'streaming') {

        filtered[filtered.length - 1] = { ...last, content: text + last.content }

      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }



  function markAssistantError(message: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming'

            ? { ...item, status: 'error' as const, content: item.content || message }

            : item

        )

      return { ...session, messages, updatedAt: Date.now() }

    })

  }



  function finalizeAssistantMessage(): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming' ? { ...item, status: 'done' as const } : item

        ),

      updatedAt: Date.now()

    }))

  }



  function handleNewChat(): void {
    setModePickerOpen(true)
  }

  async function handleModePick(mode: WriteMode): Promise<void> {
    setModePickerOpen(false)

    const session = createSession(mode)

    setSessions((prev) => [session, ...prev])

    setActiveSessionId(session.id)

    setDraftTopic('')

    setDraftExtra('')

  }



  function handleSelectSession(id: string): void {
    setActiveSessionId(id)
  }

  function handleClearSession(id: string): void {
    if (generatingSessionIdRef.current === id) {
      setToast('该对话正在生成，无法清空')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? { ...session, title: '新对话', messages: [], updatedAt: Date.now() }
          : session
      )
    )

    if (activeSessionId === id) {
      setDraftTopic('')
      setDraftExtra('')
    }
  }

  function handleDeleteSession(id: string): void {
    if (generatingSessionIdRef.current === id) {
      setToast('该对话正在生成，无法删除')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id)
      if (next.length === 0) {
        const fresh = createSession()
        setActiveSessionId(fresh.id)
        return [fresh]
      }

      if (activeSessionId === id) {
        const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt)
        setActiveSessionId(sorted[0].id)
      }

      return next
    })
  }

  async function handleArticleTypeChange(type: ArticleType): Promise<void> {
    setArticleType(type)
    localStorage.setItem(ARTICLE_TYPE_STORAGE_KEY, type)
    if (activeWriteMode === 'create') {
      await window.app.setSkillEnabled(REVIEW_SKILL_ID, type === 'review', 'create')
    }
  }

  function handleOutputLanguageChange(code: OutputLanguageCode): void {
    setOutputLanguage(code)
    localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, code)
  }

  async function handleSubmit(topic: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return

    await window.app.setSkillEnabled(REVIEW_SKILL_ID, articleType === 'review', 'create')

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({
      product,
      manual: manualExtra,
      articleType
    })
    const userContent = formatUserMessageContent(topic, extraInstructions, articleType)
    const userMessage = createMessage('user', userContent)

    const assistantMessage = createMessage('assistant', '')

    const sessionId = activeSession.id



    updateSession(sessionId, (session) => ({

      ...session,

      title: session.messages.length === 0 ? sessionTitleFromPrompt(topic) : session.title,

      messages: [...session.messages, userMessage, assistantMessage],

      updatedAt: Date.now()

    }))



    setDraftTopic('')

    setDraftExtra('')

    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)



    const result = await window.app.generateArticle({
      topic,
      extraInstructions: extraInstructions || undefined,
      outputLanguage
    })



    if (!result.ok) {

      markAssistantError(result.message ?? '生成失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  async function handleOptimizeSubmit(sourceUrl: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({ product, manual: manualExtra })
    const userContent = formatOptimizeUserMessageContent(sourceUrl, extraInstructions)
    const userMessage = createMessage('user', userContent)
    const assistantMessage = createMessage('assistant', '')
    const sessionId = activeSession.id

    updateSession(sessionId, (session) => ({
      ...session,
      title: session.messages.length === 0 ? sessionTitleFromUrl(sourceUrl) : session.title,
      messages: [...session.messages, userMessage, assistantMessage],
      updatedAt: Date.now()
    }))

    setDraftTopic('')
    setDraftExtra('')
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.optimizeArticle({
      sourceUrl,
      extraInstructions: extraInstructions || undefined,
      outputLanguage
    })

    if (!result.ok) {
      markAssistantError(result.message ?? '优化失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  function handleComposerSubmit(input: string, manualExtra: string): void {
    if (activeWriteMode === 'optimize') {
      void handleOptimizeSubmit(input, manualExtra)
    } else {
      void handleSubmit(input, manualExtra)
    }
  }



  function handleSuggest(text: string): void {

    setDraftTopic(text)

  }



  async function handleCopy(content: string): Promise<void> {

    await navigator.clipboard.writeText(content)

    setToast('已复制到剪贴板')

    window.setTimeout(() => setToast(''), 1800)

  }

  function handleSectionEditApply(messageId: string, content: string): void {
    if (!activeSession) return

    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId ? { ...message, content } : message
      ),
      updatedAt: Date.now()
    }))

    setToast('已更新文章片段')
    window.setTimeout(() => setToast(''), 1800)
  }

  const sectionEditTopic =
    activeSession?.messages.find((message) => message.role === 'user')?.content ?? ''



  if (!hydrated || !activeSession) {

    return (

      <div className="write-shell">

        <main className="write-main">

          <header className="write-topbar">

            <div>

              <h1>加载中…</h1>

            </div>

          </header>

        </main>

      </div>

    )

  }



  return (

    <div className="write-shell">

      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSession.id}
        runningSessionId={runningSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
        onClear={handleClearSession}
        onDelete={handleDeleteSession}
        onOpenSettings={onOpenSettings}
      />



      <main className="write-main">

        <header className="write-topbar">
          <h1>{getSessionDisplayTitle(activeSession)}</h1>
        </header>



        <ChatThread
          messages={activeSession.messages}
          onCopy={(content) => void handleCopy(content)}
          onSuggest={handleSuggest}
          sectionEditDisabled={isRunning || sectionEditing}
          sectionEditTopic={sectionEditTopic}
          outputLanguage={outputLanguage}
          onSectionEditApply={handleSectionEditApply}
          onSectionEditBusyChange={setSectionEditing}
        />



        <div className="composer-area">
          <Composer
            disabled={isRunning || sectionEditing}
            writeMode={activeWriteMode}
            quickPicks={quickPicks}
            selectedProductId={selectedProductId}
            outputLanguage={outputLanguage}
            articleType={articleType}
            onProductChange={setSelectedProductId}
            onOutputLanguageChange={handleOutputLanguageChange}
            onArticleTypeChange={(type) => void handleArticleTypeChange(type)}
            onSubmit={(input, extra) => handleComposerSubmit(input, extra)}
            draftInput={draftTopic}
            draftExtra={draftExtra}
            onDraftInputChange={setDraftTopic}
            onDraftExtraChange={setDraftExtra}
          />

          <footer className="write-statusbar">
            <span className="write-status-label">
              {activeWriteMode === 'optimize' ? '文章优化' : '文章创作'}
            </span>
            {isRunning ? (
              <span className="write-status-running">
                <span className="status-pill-dot" aria-hidden="true" />
                Pipeline 运行中
              </span>
            ) : (
              <span className="write-status-idle">就绪</span>
            )}
          </footer>
        </div>



        {toast ? <div className="toast">{toast}</div> : null}

        <WriteModePickerDialog
          open={modePickerOpen}
          onSelect={(mode) => void handleModePick(mode)}
          onClose={() => setModePickerOpen(false)}
        />

      </main>

    </div>

  )

}

