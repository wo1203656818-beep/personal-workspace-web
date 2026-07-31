import { Suspense, lazy, useState, useRef, useEffect } from 'react'
import { Sparkles, Plus, History, X, SlidersHorizontal, Copy, RefreshCw } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { copyChatAsMarkdown, downloadChatMarkdown, exportChatPdf } from '@/lib/chat-export'
import { cn } from '@/lib/utils'

import type { Msg } from './chat/types'
import { sessionStore, splitThink } from './chat/types'
import { useChatStream } from './chat/useChatStream'
import { useChatSessions } from './chat/useChatSessions'
import { useVoiceInput } from './chat/useVoiceInput'
import { CodeBlock } from './chat/CodeBlock'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ChatHistorySidebar } from './chat/ChatHistorySidebar'
import { ChatInputArea } from './chat/ChatInputArea'
import { ChatSettingsModal } from './chat/ChatSettingsModal'

const ChatMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }, { default: rehypeHighlight }] =
    await Promise.all([
      import('react-markdown'),
      import('remark-gfm'),
      import('rehype-highlight'),
    ])
  return {
    default: ({ content }: { content: string }) => (
      <div className="prose-invert max-w-none text-[14px] leading-relaxed [overflow-wrap:anywhere] prose-headings:text-white/90 prose-headings:font-semibold prose-p:text-white/75 prose-li:text-white/75 prose-strong:text-white/90 prose-code:text-white/80 prose-a:text-primary/80 prose-pre:rounded-xl prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 [&_p]:text-[14px] [&_li]:text-[14px] [&_td]:text-[13px] [&_th]:text-[13px] [&_blockquote]:text-white/60 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:text-[13px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{ pre: CodeBlock }}
        >
          {content}
        </ReactMarkdown>
      </div>
    ),
  }
})

function BuiltinAIChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>(sessionStore.messages)
  const [input, setInput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(sessionStore.sessionId)
  const [deepThink, setDeepThink] = useState<boolean>(sessionStore.deepThink)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>(
    () => localStorage.getItem('chat_sysprompt') || '',
  )
  const [images, setImages] = useState<{ id: string; dataUrl: string; name: string }[]>([])

  const customPromptRef = useRef<string>(customPrompt)
  customPromptRef.current = customPrompt
  useEffect(() => {
    localStorage.setItem('chat_sysprompt', customPrompt)
  }, [customPrompt])

  const imagesRef = useRef(images)
  imagesRef.current = images

  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(sessionId)
  const deepThinkRef = useRef<boolean>(deepThink)
  sessionIdRef.current = sessionId
  deepThinkRef.current = deepThink

  // 同步到模块级 store，跨开/关保留
  useEffect(() => {
    sessionStore.messages = messages
  }, [messages])
  useEffect(() => {
    sessionStore.sessionId = sessionId
  }, [sessionId])
  useEffect(() => {
    sessionStore.deepThink = deepThink
  }, [deepThink])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const { loading, send, stop, regenerate, abortRef } = useChatStream({
    sessionIdRef,
    deepThinkRef,
    customPromptRef,
    imagesRef,
    setMessages,
    setSessionId,
  })

  const { sessions, newChat, openSession, removeSession, togglePin, saveTags } = useChatSessions({
    open,
    historyOpen,
    setHistoryOpen,
    setMessages,
    setSessionId,
  })

  const { listening, speechSupported, toggleVoice } = useVoiceInput({ setInput })

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Sparkles className="size-4" />
          <span className="sr-only">AI 助手</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="flex w-[420px] max-w-[100vw] flex-col gap-0 bg-[#0a0a0a] p-0 sm:w-[520px]"
        showCloseButton={false}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/5 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-white/90">
            <Sparkles className="size-4 text-primary" />
            AI 助手
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/60 hover:text-white"
              title="聊天历史"
              onClick={() => {
                setHistoryOpen((v) => !v)
              }}
            >
              <History className="size-4" />
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/60 hover:text-white"
                title="更多"
                onClick={() => setExportOpen((v) => !v)}
              >
                <SlidersHorizontal className="size-4" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-white/10 bg-[#1a1a1a] p-1 shadow-xl shadow-black/40">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      setSettingsOpen(true)
                      setExportOpen(false)
                    }}
                  >
                    <SlidersHorizontal className="size-3.5" /> 回复偏好
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      copyChatAsMarkdown(messages)
                      setExportOpen(false)
                    }}
                  >
                    复制为 Markdown
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      downloadChatMarkdown(messages, '会话记录')
                      setExportOpen(false)
                    }}
                  >
                    导出 .md
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      exportChatPdf(messages, '会话记录')
                      setExportOpen(false)
                    }}
                  >
                    导出 PDF
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => {
                      newChat(abortRef)
                      setExportOpen(false)
                    }}
                  >
                    <Plus className="size-3.5" /> 新对话
                  </button>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/60 hover:text-white"
              title="关闭"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="relative flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                  <Sparkles className="size-7" />
                </div>
                <p className="text-base font-medium text-white/90">有什么想聊的？</p>
                <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-white/40">
                  问答、写作、翻译、代码、闲聊，随时找我
                </p>
                <div className="mt-6 flex items-center gap-3 text-[11px] text-white/25">
                  <span className="flex items-center gap-1">深度思考</span>
                </div>
              </div>
            ) : (
              <div className="space-y-6 px-4 py-6">
                {messages.map((m, idx) => {
                  const isUser = m.role === 'user'
                  const { think, rest } = isUser
                    ? { think: '', rest: m.content }
                    : splitThink(m.content)
                  const reasoningText = [m.reasoning, think].filter(Boolean).join('\n\n')
                  const isLastAi = !isUser && idx === messages.length - 1
                  return (
                    <div
                      key={m.id}
                      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                    >
                      <div className={cn('max-w-[88%] space-y-2', isUser && 'max-w-[80%]')}>
                        {isUser ? (
                          <div className="rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-[14px] leading-relaxed text-white/90">
                            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {m.content}
                            </span>
                          </div>
                        ) : (
                          <div className="group relative space-y-3">
                            {reasoningText && <ThinkingBlock text={reasoningText} />}
                            {rest ? (
                              <Suspense
                                fallback={
                                  <div className="text-[13px] text-white/40">加载中…</div>
                                }
                              >
                                <ChatMarkdown content={rest} />
                              </Suspense>
                            ) : m.pending ? (
                              <span className="inline-flex gap-1.5 text-white/40">
                                <span className="inline-block size-1.5 animate-round animate-pulse rounded-full bg-white/50" />
                                <span
                                  className="inline-block size-1.5 animate-pulse rounded-full bg-white/50"
                                  style={{ animationDelay: '0.2s' }}
                                />
                                <span
                                  className="inline-block size-1.5 animate-pulse rounded-full bg-white/50"
                                  style={{ animationDelay: '0.4s' }}
                                />
                              </span>
                            ) : null}
                            <button
                              onClick={() => navigator.clipboard.writeText(rest || m.content)}
                              className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white"
                              title="复制"
                            >
                              <Copy className="size-3.5" />
                            </button>
                            {isLastAi && !m.pending && rest && (
                              <button
                                onClick={() => regenerate()}
                                disabled={loading}
                                className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{' '}
                                重新生成
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {historyOpen && (
            <ChatHistorySidebar
              sessions={sessions}
              onClose={() => setHistoryOpen(false)}
              onOpen={openSession}
              onRemove={(id, e) => removeSession(id, sessionId, e)}
              onTogglePin={togglePin}
              onSaveTags={saveTags}
            />
          )}
        </div>

        <ChatInputArea
          input={input}
          setInput={setInput}
          loading={loading}
          deepThink={deepThink}
          setDeepThink={setDeepThink}
          images={images}
          setImages={setImages}
          speechSupported={speechSupported}
          listening={listening}
          onToggleVoice={toggleVoice}
          onSend={send}
          onStop={stop}
        />
      </SheetContent>

      <ChatSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        customPrompt={customPrompt}
        setCustomPrompt={setCustomPrompt}
      />
    </Sheet>
  )
}

function LobeChatFrame({ url }: { url: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Sparkles className="size-4" />
          <span className="sr-only">AI 助手</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        className="flex w-[420px] max-w-[100vw] flex-col gap-0 bg-[#0a0a0a] p-0 sm:w-[520px]"
        showCloseButton={false}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/5 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-white/90">
            <Sparkles className="size-4 text-primary" />
            AI 助手
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/60 hover:text-white"
            title="关闭"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>
        <iframe
          src={url}
          title="AI 助手"
          className="h-full w-full flex-1 border-0 bg-background"
          allow="microphone; clipboard-write"
        />
      </SheetContent>
    </Sheet>
  )
}

const LOBECHAT_URL = (import.meta.env.VITE_LOBECHAT_URL as string | undefined)?.trim() || ''

export function AIChatSheet() {
  if (LOBECHAT_URL) return <LobeChatFrame url={LOBECHAT_URL} />
  return <BuiltinAIChat />
}
