import { useState, useRef, useEffect, Suspense, useCallback } from 'react'
import { Sparkles, Plus, History, SlidersHorizontal, Copy, RefreshCw, Pencil, Trash2, Lightbulb, ListChecks, PenLine, MessageSquareQuote, Bot, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { copyChatAsMarkdown, downloadChatMarkdown, exportChatPdf } from '@/lib/chat-export'
import { cn } from '@/lib/utils'
import { lazyImport } from '@/lib/lazy'
import { aiApi, aiConfigsApi, type AiConfig } from '@/lib/api'
import { toast } from 'sonner'

import type { Msg } from '@/components/chat/types'
import { sessionStore, splitThink } from '@/components/chat/types'
import { useChatStream } from '@/components/chat/useChatStream'
import { useChatSessions } from '@/components/chat/useChatSessions'
import { useVoiceInput } from '@/components/chat/useVoiceInput'
import { CodeBlock } from '@/components/chat/CodeBlock'
import { ThinkingBlock } from '@/components/chat/ThinkingBlock'
import { ChatHistorySidebar } from '@/components/chat/ChatHistorySidebar'
import { ChatInputArea } from '@/components/chat/ChatInputArea'
import { ChatSettingsModal } from '@/components/chat/ChatSettingsModal'
import { usePageTitle } from '@/hooks/use-page-title'

const ChatMarkdown = lazyImport(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }, { default: rehypeHighlight }] =
    await Promise.all([
      import('react-markdown'),
      import('remark-gfm'),
      import('rehype-highlight'),
    ])
  return {
    default: ({ content }: { content: string }) => (
      <div className="prose-invert max-w-none text-[14px] leading-relaxed [overflow-wrap:anywhere] prose-headings:text-white/90 prose-headings:font-semibold prose-p:text-white/75 prose-li:text-white/75 prose-strong:text-white/90 prose-code:text-white/80 prose-a:text-primary/80 prose-pre:rounded-xl prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 [&_p]:text-[14px] [&_li]:text-[14px] [&_td]:text-[13px] [&_th]:text-[13px] [&_blockquote]:text-white/60 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:text-[13px] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
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

export function ChatPage() {
  usePageTitle('AI 聊天')
  const [messages, setMessages] = useState<Msg[]>(sessionStore.messages)
  const [input, setInput] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(sessionStore.sessionId)
  const [deepThink, setDeepThink] = useState<boolean>(sessionStore.deepThink)
  const [webSearch, setWebSearch] = useState<boolean>(sessionStore.webSearch)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>(
    () => localStorage.getItem('chat_sysprompt') || '',
  )
  const [images, setImages] = useState<{ id: string; dataUrl: string; name: string }[]>([])
  const [currentSessionTitle, setCurrentSessionTitle] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [configs, setConfigs] = useState<AiConfig[]>([])
  const [configId, setConfigId] = useState('default')

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
  const webSearchRef = useRef<boolean>(webSearch)
  sessionIdRef.current = sessionId
  deepThinkRef.current = deepThink
  webSearchRef.current = webSearch

  // Sync to module-level store
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
    sessionStore.webSearch = webSearch
  }, [webSearch])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const { loading, send, stop, regenerate, abortRef } = useChatStream({
    sessionIdRef,
    deepThinkRef,
    webSearchRef,
    customPromptRef,
    imagesRef,
    setMessages,
    setSessionId,
  })

  const { sessions, newChat, openSession, removeSession, togglePin, saveTags } = useChatSessions({
    open: true,
    historyOpen,
    setHistoryOpen,
    setMessages,
    setSessionId,
  })

  useEffect(() => {
    if (sessionId && sessions.length > 0) {
      const found = sessions.find((s) => s.id === sessionId)
      if (found) setCurrentSessionTitle(found.title)
    }
  }, [sessionId, sessions])

  // 加载 AI 配置列表
  useEffect(() => {
    aiConfigsApi
      .list()
      .then((list) => {
        setConfigs(list)
        const def = list.find((c) => c.isDefault)
        if (def && configId === 'default') setConfigId(def.id)
      })
      .catch(() => {})
  }, [])

  // 会话切换时同步绑定的配置
  useEffect(() => {
    if (sessionId && sessions.length > 0) {
      const found = sessions.find((s) => s.id === sessionId)
      if (found) setConfigId(found.configId || 'default')
    }
  }, [sessionId, sessions])

  const handleConfigChange = (id: string) => {
    setConfigId(id)
    if (sessionId) {
      aiApi.updateChatSession(sessionId, { configId: id === 'default' ? null : id }).catch(() => {})
    }
  }

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) send(lastUser.content)
  }, [messages, send])

  const { listening, speechSupported, toggleVoice } = useVoiceInput({ setInput })

  return (
    <div className="page-layout">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 md:size-10">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">AI 助手</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">问答、写作、翻译、代码、闲聊</p>
          </div>
        </div>
        <div className="page-header-right">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg text-muted-foreground hover:text-foreground sm:size-8"
            title="聊天历史"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <History className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg text-muted-foreground hover:text-foreground sm:size-8"
            title="新对话"
            onClick={() => newChat(abortRef)}
          >
            <Plus className="size-4" />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-lg text-muted-foreground hover:text-foreground sm:size-8"
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
                <div className="my-1 h-px bg-white/5" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  onClick={() => {
                    setRenameTitle(currentSessionTitle)
                    setRenameDialogOpen(true)
                    setExportOpen(false)
                  }}
                >
                  <Pencil className="size-3.5" /> 重命名当前对话
                </button>
                <div className="my-1 h-px bg-white/5" />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-400/70 transition-colors hover:bg-white/5 hover:text-red-400"
                  onClick={() => {
                    setDeleteAllDialogOpen(true)
                    setExportOpen(false)
                  }}
                >
                  <Trash2 className="size-3.5" /> 删除所有会话
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
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

              {/* Quick actions */}
              <div className="mt-8 grid w-full max-w-md grid-cols-2 gap-2">
                <QuickActionButton
                  icon={Lightbulb}
                  label="头脑风暴"
                  prompt="帮我做一个头脑风暴，主题是："
                  setInput={setInput}
                />
                <QuickActionButton
                  icon={ListChecks}
                  label="总结要点"
                  prompt="请总结以下内容的要点："
                  setInput={setInput}
                />
                <QuickActionButton
                  icon={PenLine}
                  label="翻译"
                  prompt="请将以下内容翻译成中文："
                  setInput={setInput}
                />
                <QuickActionButton
                  icon={MessageSquareQuote}
                  label="润色文本"
                  prompt="请润色以下文本，使其更通顺专业："
                  setInput={setInput}
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m, idx) => {
                const isUser = m.role === 'user'
                const { think, rest } = isUser
                  ? { think: '', rest: m.content }
                  : splitThink(m.content)
                const reasoningText = [m.reasoning, think].filter(Boolean).join('\n\n')
                const isLastAi = !isUser && idx === messages.length - 1
                const isError = !isUser && !m.pending && m.content.startsWith('⚠️')
                const isEditing = editingMsgId === m.id
                return (
                  <div
                    key={m.id}
                    className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
                  >
                    <div className={cn('max-w-[88%] space-y-2', isUser && 'max-w-[80%]')}>
                      {isUser ? (
                        <div className="group relative">
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                className="w-full rounded-2xl rounded-br-md border border-white/10 bg-white/10 px-4 py-2.5 text-[14px] leading-relaxed text-white/90 placeholder:text-white/30 focus-visible:outline-none focus-visible:border-white/20 resize-none"
                                rows={3}
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-[12px] text-white/60"
                                  onClick={() => setEditingMsgId(null)}
                                >
                                  取消
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-[12px]"
                                  onClick={() => {
                                    if (editingContent.trim()) {
                                      setMessages((prev) =>
                                        prev.map((msg) =>
                                          msg.id === m.id
                                            ? { ...msg, content: editingContent.trim() }
                                            : msg,
                                        ),
                                      )
                                      setEditingMsgId(null)
                                    }
                                  }}
                                >
                                  保存
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-[14px] leading-relaxed text-white/90">
                              <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                {m.content}
                              </span>
                            </div>
                          )}
                          {!isEditing && (
                            <button
                              onClick={() => {
                                setEditingMsgId(m.id)
                                setEditingContent(m.content)
                              }}
                              className="absolute -left-8 top-1 flex size-8 items-center justify-center rounded-lg text-white/40 transition-opacity hover:text-white md:opacity-0 md:group-hover:opacity-100"
                              title="编辑"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="group relative space-y-3">
                          {reasoningText && <ThinkingBlock text={reasoningText} />}
                          {/* Tool calls */}
                          {m.tools && m.tools.length > 0 && (
                            <div className="space-y-1.5">
                              {m.tools.map((tool, ti) => (
                                <div
                                  key={ti}
                                  className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                                >
                                  <Bot className="mt-0.5 size-3.5 shrink-0 text-primary/60" />
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[12px] font-medium text-primary/70">
                                      {tool.name}
                                    </span>
                                    <p className="mt-0.5 truncate text-[11px] text-white/35">
                                      {tool.observation}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Sources */}
                          {m.sources && m.sources.length > 0 && (
                            <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                              <p className="mb-1.5 text-[11px] font-medium text-white/40">来源</p>
                              <div className="flex flex-wrap gap-1.5">
                                {m.sources.map((src, si) => (
                                  <a
                                    key={si}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
                                  >
                                    <ExternalLink className="size-3" />
                                    {src.title}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
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
                            className="absolute -right-9 top-0 flex size-8 items-center justify-center rounded-lg text-white/40 transition-opacity hover:text-white md:opacity-0 md:group-hover:opacity-100"
                            title="复制"
                          >
                            <Copy className="size-3.5" />
                          </button>
                          {isError && (
                            <button
                              onClick={() => retryLast()}
                              disabled={loading}
                              className="flex items-center gap-1.5 text-[12px] text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{' '}
                              重试
                            </button>
                          )}
                          {isLastAi && !m.pending && rest && !isError && (
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

      <div className="mx-auto w-full max-w-3xl border-t border-white/5">
        <ChatInputArea
          input={input}
          setInput={setInput}
          loading={loading}
          deepThink={deepThink}
          setDeepThink={setDeepThink}
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          images={images}
          setImages={setImages}
          speechSupported={speechSupported}
          listening={listening}
          configs={configs}
          configId={configId}
          onConfigChange={handleConfigChange}
          onToggleVoice={toggleVoice}
          onSend={send}
          onStop={stop}
        />
      </div>

      <ChatSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        customPrompt={customPrompt}
        setCustomPrompt={setCustomPrompt}
      />

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="border-white/10 bg-[#1a1a1a]">
          <DialogHeader>
            <DialogTitle className="text-white/90">重命名对话</DialogTitle>
            <DialogDescription className="text-white/40">
              输入新的对话标题
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (renameTitle.trim() && sessionId) {
                  aiApi.updateChatSession(sessionId, { title: renameTitle.trim() })
                  setRenameDialogOpen(false)
                  toast.success('已重命名')
                }
              }
            }}
            placeholder="输入新标题"
            className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" className="text-white/60">
                取消
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (renameTitle.trim() && sessionId) {
                  aiApi.updateChatSession(sessionId, { title: renameTitle.trim() })
                  setRenameDialogOpen(false)
                  toast.success('已重命名')
                }
              }}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all sessions dialog */}
      <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <DialogContent className="border-white/10 bg-[#1a1a1a]">
          <DialogHeader>
            <DialogTitle className="text-white/90">删除所有会话</DialogTitle>
            <DialogDescription className="text-white/40">
              确定删除所有会话？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" className="text-white/60">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                const allSessions = [...sessions]
                for (const s of allSessions) {
                  try {
                    await aiApi.deleteChatSession(s.id)
                  } catch {}
                }
                newChat(abortRef)
                setDeleteAllDialogOpen(false)
                toast.success('已删除所有会话')
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  prompt,
  setInput,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  prompt: string
  setInput: (v: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        setInput(prompt)
        // Focus the input after setting value
        const inputEl = document.querySelector<HTMLTextAreaElement>('[data-chat-input]')
        inputEl?.focus()
      }}
      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white/90"
    >
      <Icon className="size-4 shrink-0 text-primary/70" />
      <span>{label}</span>
    </button>
  )
}