import { useEffect, useRef, useState } from 'react'

import type { GenerateProgressEvent, QuickPicksConfig } from '../env.d'
import {
  ARTICLE_TYPE_STORAGE_KEY,
  isArticleType,
  type ArticleType
} from '../constants/articleTypes'
import { type WriteMode } from '../constants/writeMode'
import {
  DEFAULT_OUTPUT_LANGUAGE,
  OUTPUT_LANGUAGE_STORAGE_KEY,
  isOutputLanguageCode,
  type OutputLanguageCode
} from '../constants/outputLanguage'
import { syncSkillsForArticleType } from '../utils/writeModeSkills'
import {
  buildExtraInstructions,
  formatOptimizeUserMessageContent,
  formatReviseUserMessageContent,
  formatUserMessageContent
} from '../utils/extraInstructions'

import ChatSidebar from './write/ChatSidebar'

import ChatThread from './write/ChatThread'

import Composer from './write/Composer'

import WriteModePickerDialog from './write/WriteModePickerDialog'

import { createMessage, createSession, getLatestDoneAssistantMessage, getSessionDisplayTitle, sessionHasPendingRevision, sessionIsInFollowUpMode, sessionTitleFromPrompt, sessionTitleFromUrl, type ChatSession, type ReviseArticleSelection } from './write/types'



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
  const [reviseSelection, setReviseSelection] = useState<ReviseArticleSelection | null>(null)
  const [runningSessionId, setRunningSessionId] = useState('')

  const [toast, setToast] = useState('')

  const generatingSessionIdRef = useRef<string>('')

  const revisionBaselineRef = useRef<{
    messageId: string
    content: string
    userMessageId: string
  } | null>(null)

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
    setArticleType(isArticleType(storedType) ? storedType : 'how-to')
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || activeWriteMode !== 'create') return
    void syncSkillsForArticleType(articleType)
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

      if (event.type === 'replace' && event.text) {

        replaceAssistantContent(event.text)

      }

      if (event.type === 'cancelled') {
        if (!abortRevisionAttempt()) {
          finalizeAssistantMessage()
        }
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
        setToast('已中止生成')
        window.setTimeout(() => setToast(''), 1800)
      }

      if (event.type === 'error' && event.message) {

        if (abortRevisionAttempt()) {
          setToast(event.message)
          window.setTimeout(() => setToast(''), 2200)
        } else {
          markAssistantError(event.message)
        }
        setIsRunning(false)
        setRunningSessionId('')
        generatingSessionIdRef.current = ''
      }

      if (event.type === 'done') {
        if (revisionBaselineRef.current) {
          finalizePendingRevision()
        } else {
          finalizeAssistantMessage()
        }
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

      const filtered = session.messages.filter((item) => item.role !== 'status')

      const index = filtered.findIndex(
        (item) => item.role === 'assistant' && item.status === 'streaming'
      )

      if (index >= 0) {
        const current = filtered[index]
        filtered[index] = { ...current, content: current.content + text }
      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }

  function replaceAssistantContent(text: string): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && (item.status === 'revising' || item.status === 'streaming')

            ? { ...item, content: text }

            : item

        ),

      updatedAt: Date.now()

    }))

  }

  function removeMessageById(messageId: string): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages.filter(

        (item) => item.role === 'status' || item.id !== messageId

      ),

      updatedAt: Date.now()

    }))

  }

  function abortRevisionAttempt(): boolean {

    const baseline = revisionBaselineRef.current

    if (!baseline) return false

    restoreRevisionBaseline()

    removeMessageById(baseline.userMessageId)

    revisionBaselineRef.current = null

    return true

  }

  function restoreRevisionBaseline(): boolean {

    const baseline = revisionBaselineRef.current

    if (!baseline) return false

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.id === baseline.messageId

            ? { ...item, content: baseline.content, status: 'done' as const }

            : item

        ),

      updatedAt: Date.now()

    }))

    return true

  }

  function finalizePendingRevision(): void {

    const baseline = revisionBaselineRef.current

    if (!baseline) {

      finalizeAssistantMessage()

      return

    }

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) => {

          if (item.id === baseline.messageId) {

            return {

              ...item,

              status: 'pendingApply' as const,

              revisionBaseline: baseline.content,

              revisionUserMessageId: baseline.userMessageId

            }

          }

          if (item.id === baseline.userMessageId) {

            return { ...item, revisionTargetAssistantId: baseline.messageId }

          }

          return item

        }),

      updatedAt: Date.now()

    }))

    revisionBaselineRef.current = null

  }

  function prependAssistantContent(text: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const filtered = session.messages.filter((item) => item.role !== 'status')

      const index = filtered.findIndex(
        (item) => item.role === 'assistant' && item.status === 'streaming'
      )

      if (index >= 0) {
        const current = filtered[index]
        filtered[index] = { ...current, content: text + current.content }
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

          item.role === 'assistant' && (item.status === 'streaming' || item.status === 'revising')

            ? { ...item, status: 'done' as const }

            : item

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
          ? { ...session, title: '新对话', customTitle: undefined, messages: [], updatedAt: Date.now() }
          : session
      )
    )

    if (activeSessionId === id) {
      setDraftTopic('')
      setDraftExtra('')
    }
  }

  function handleRenameSession(id: string, nextTitle: string): void {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              customTitle: nextTitle || undefined,
              updatedAt: Date.now()
            }
          : session
      )
    )
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
      await syncSkillsForArticleType(type)
    }
  }

  function handleOutputLanguageChange(code: OutputLanguageCode): void {
    setOutputLanguage(code)
    localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, code)
  }

  async function handleReviseSubmit(instruction: string): Promise<void> {
    if (isRunning || !activeSession) return

    if (sessionHasPendingRevision(activeSession)) {
      setToast('请先应用或取消当前修改')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    const articleMessage = getLatestDoneAssistantMessage(activeSession)
    if (!articleMessage) return

    const userMessage = createMessage(
      'user',
      formatReviseUserMessageContent(instruction, reviseSelection?.text)
    )
    const sessionId = activeSession.id
    const articleContent = articleMessage.content

    revisionBaselineRef.current = {
      messageId: articleMessage.id,
      content: articleContent,
      userMessageId: userMessage.id
    }

    updateSession(sessionId, (session) => {
      const filtered = session.messages.filter((item) => item.role !== 'status')
      const messages = filtered.map((item) =>
        item.id === articleMessage.id ? { ...item, status: 'revising' as const } : item
      )

      return {
        ...session,
        messages: [...messages, userMessage],
        updatedAt: Date.now()
      }
    })

    setDraftTopic('')
    setDraftExtra('')
    setReviseSelection(null)
    window.getSelection()?.removeAllRanges()
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.reviseArticle({
      article: articleContent,
      instruction,
      outputLanguage,
      pipeline: activeWriteMode,
      topic: activeSession.messages.find((message) => message.role === 'user')?.content,
      selection: reviseSelection ?? undefined
    })

    if (!result.ok && result.message !== '已中止生成') {
      if (!abortRevisionAttempt()) {
        markAssistantError(result.message ?? '修订失败')
      } else {
        setToast(result.message ?? '修订失败')
        window.setTimeout(() => setToast(''), 2200)
      }
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  function handleApplyRevision(assistantMessageId: string): void {
    if (!activeSession) return

    updateSession(activeSession.id, (session) => {
      const assistant = session.messages.find(
        (message) => message.id === assistantMessageId && message.status === 'pendingApply'
      )
      if (!assistant) return session

      const userMessageId = assistant.revisionUserMessageId

      return {
        ...session,
        messages: session.messages
          .filter((message) => message.role === 'status' || message.id !== userMessageId)
          .map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  status: 'done' as const,
                  revisionBaseline: undefined,
                  revisionUserMessageId: undefined
                }
              : message
          ),
        updatedAt: Date.now()
      }
    })

    setToast('已应用修改')
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleCancelRevision(assistantMessageId: string): void {
    if (!activeSession) return

    updateSession(activeSession.id, (session) => {
      const assistant = session.messages.find(
        (message) => message.id === assistantMessageId && message.status === 'pendingApply'
      )
      if (!assistant?.revisionBaseline) return session

      const userMessageId = assistant.revisionUserMessageId

      return {
        ...session,
        messages: session.messages
          .filter((message) => message.role === 'status' || message.id !== userMessageId)
          .map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: assistant.revisionBaseline ?? message.content,
                  status: 'done' as const,
                  revisionBaseline: undefined,
                  revisionUserMessageId: undefined
                }
              : message
          ),
        updatedAt: Date.now()
      }
    })

    setToast('已取消修改')
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleDeleteMessage(messageId: string): void {
    if (!activeSession || isRunning) return

    const linkedAssistant = activeSession.messages.find(
      (message) => message.status === 'pendingApply' && message.revisionUserMessageId === messageId
    )
    if (linkedAssistant) {
      handleCancelRevision(linkedAssistant.id)
      return
    }

    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.filter(
        (message) => message.role === 'status' || message.id !== messageId
      ),
      updatedAt: Date.now()
    }))
  }

  async function handleSubmit(topic: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return

    await syncSkillsForArticleType(articleType)

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



    if (!result.ok && result.message !== '已中止生成') {
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

    if (!result.ok && result.message !== '已中止生成') {
      markAssistantError(result.message ?? '优化失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  function handleComposerSubmit(input: string, manualExtra: string): void {
    if (activeSession && sessionIsInFollowUpMode(activeSession)) {
      void handleReviseSubmit(input)
      return
    }

    if (activeWriteMode === 'optimize') {
      void handleOptimizeSubmit(input, manualExtra)
    } else {
      void handleSubmit(input, manualExtra)
    }
  }

  function handleStopGeneration(): void {
    if (!isRunning) return
    void window.app.cancelArticle()
  }



  function handleSuggest(text: string): void {

    setDraftTopic(text)

  }



  async function handleCopy(content: string): Promise<void> {

    await navigator.clipboard.writeText(content)

    setToast('已复制到剪贴板')

    window.setTimeout(() => setToast(''), 1800)

  }

  function handleClearReviseSelection(): void {
    setReviseSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const composerShowOptions = activeSession ? !sessionIsInFollowUpMode(activeSession) : true
  const hasPendingRevision = activeSession ? sessionHasPendingRevision(activeSession) : false
  const latestArticleMessage = activeSession ? getLatestDoneAssistantMessage(activeSession) : null
  const reviseTargetMessageId =
    composerShowOptions || hasPendingRevision || isRunning ? null : latestArticleMessage?.id ?? null



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
        onRename={handleRenameSession}
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
          isRunning={isRunning}
          reviseTargetMessageId={reviseTargetMessageId}
          reviseSelection={reviseSelection}
          onReviseSelectionChange={setReviseSelection}
          onDeleteMessage={handleDeleteMessage}
          onApplyRevision={handleApplyRevision}
          onCancelRevision={handleCancelRevision}
        />



        <div className="composer-area">
          <Composer
            disabled={hasPendingRevision}
            isGenerating={isRunning}
            showOptions={composerShowOptions}
            writeMode={activeWriteMode}
            quickPicks={quickPicks}
            selectedProductId={selectedProductId}
            outputLanguage={outputLanguage}
            articleType={articleType}
            onProductChange={setSelectedProductId}
            onOutputLanguageChange={handleOutputLanguageChange}
            onArticleTypeChange={(type) => void handleArticleTypeChange(type)}
            onSubmit={(input, extra) => handleComposerSubmit(input, extra)}
            onStop={handleStopGeneration}
            draftInput={draftTopic}
            draftExtra={draftExtra}
            onDraftInputChange={setDraftTopic}
            onDraftExtraChange={setDraftExtra}
            reviseSelectionPreview={reviseSelection?.text ?? null}
            onClearReviseSelection={handleClearReviseSelection}
          />

          <footer className="write-statusbar">
            <span className="write-status-label">
              {activeWriteMode === 'optimize' ? '文章优化' : '文章创作'}
            </span>
            {isRunning ? (
              <span className="write-status-running">
                <span className="status-pill-dot" aria-hidden="true" />
                {composerShowOptions ? 'Pipeline 运行中' : '正在修订文章…'}
              </span>
            ) : hasPendingRevision ? (
              <span className="write-status-running">待确认修改</span>
            ) : (
              <span className="write-status-idle">
                {composerShowOptions
                  ? '就绪'
                  : reviseSelection
                    ? '已选中片段 · 输入修改说明后发送'
                    : '继续对话修改文章 · 可选中片段进行局部重写'}
              </span>
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

