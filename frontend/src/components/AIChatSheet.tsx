import { useState, useRef, useEffect, useCallback } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Send, Sparkles, Plus, History, Trash2, Square, Cpu, X, Brain, Pin, Tag, Mic, AtSign, SlidersHorizontal, Paperclip, Globe } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'
import { aiApi, notesApi, tasksApi, type ChatSessionPreview } from '@/lib/api'
import { copyChatAsMarkdown, downloadChatMarkdown, exportChatPdf } from '@/lib/chat-export'
import { cn } from '@/lib/utils'

type ToolCall = { name: string; observation: string }
type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: ToolCall[]
  sources?: { title: string; url: string }[]
  reasoning?: string
  pending?: boolean
}

// 跨开/关持久化（Sheet 关闭会卸载内容，用模块级变量保留当前会话）
const sessionStore: { sessionId: string | null; messages: Msg[]; deepThink: boolean } = {
  sessionId: null,
  messages: [],
  deepThink: false,
}

// 把模型以 <think>...</think> 内联输出的思考过程抽出来（兼容 Qwen 等把思考写进正文的模型）
function splitThink(raw: string): { think: string; rest: string } {
  const start = raw.indexOf('<think>')
  const end = raw.indexOf('</think>')
  if (start === -1 || end === -1 || end < start) return { think: '', rest: raw }
  const think = raw.slice(start + '<think>'.length, end).trim()
  const rest = (raw.slice(0, start) + raw.slice(end + '</think>'.length)).trim()
  return { think, rest }
}

const SUGGESTIONS = [
  '帮我加个任务：明天下午3点交周报',
  '今天的任务完成情况怎么样？',
  '记条笔记：刚想到的产品灵感…',
  '搜一下今天 AI 圈有什么重要新闻',
]

const TOOL_LABEL: Record<string, string> = {
  create_task: '创建任务',
  search_tasks: '搜索任务',
  complete_task: '标记完成',
  delete_task: '删除任务',
  update_task: '更新任务',
  create_task_list: '新建列表',
  update_task_list: '修改列表',
  delete_task_list: '删除列表',
  create_subtask: '添加子任务',
  toggle_subtask: '勾选子任务',
  delete_subtask: '删除子任务',
  get_overview: '查看概览',
  add_note: '保存笔记',
  update_note: '修改笔记',
  delete_note: '删除笔记',
  search_notes: '搜索笔记',
  search_knowledge: '搜索知识库',
  summarize_knowledge: '总结文档',
  ask_knowledge: '知识库问答',
  get_ai_config: '查看 AI 配置',
  update_ai_config: '修改 AI 配置',
  set_theme: '切换主题',
  navigate: '页面跳转',
  coin_flip: '抛硬币',
  web_search: '联网搜索',
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// 代码块：在右上角加一键复制按钮（hover 显示）
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const text = ref.current?.innerText || ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <div className="not-prose group relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

// 把"建/查"类工具映射到可跳转的模块路由
function toolTarget(t: ToolCall): string | null {
  if (t.name === 'create_task' || t.name === 'create_subtask' || t.name === 'create_task_list' || t.name === 'search_tasks') return '/tasks'
  if (t.name === 'add_note' || t.name === 'update_note' || t.name === 'search_notes') return '/notes'
  if (t.name === 'search_knowledge' || t.name === 'summarize_knowledge' || t.name === 'ask_knowledge') return '/knowledge'
  return null
}

function BuiltinAIChat() {
  const { setTheme } = useTheme()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>(sessionStore.messages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSessionPreview[]>([])
  const [sessionId, setSessionId] = useState<string | null>(sessionStore.sessionId)
  const [deepThink, setDeepThink] = useState<boolean>(sessionStore.deepThink)
  const [webSearch, setWebSearch] = useState<boolean>(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState<string>(() => localStorage.getItem('chat_sysprompt') || '')
  const customPromptRef = useRef<string>(customPrompt)
  customPromptRef.current = customPrompt
  useEffect(() => { localStorage.setItem('chat_sysprompt', customPrompt) }, [customPrompt])
  const [atOpen, setAtOpen] = useState(false)
  const [images, setImages] = useState<{ id: string; dataUrl: string; name: string }[]>([])
  const imagesRef = useRef<{ id: string; dataUrl: string; name: string }[]>(images)
  imagesRef.current = images
  const fileRef = useRef<HTMLInputElement>(null)
  const [atQuery, setAtQuery] = useState('')
  const [atResults, setAtResults] = useState<{ kind: 'note' | 'task'; id: string; title: string; content: string }[]>([])
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const [speechSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef<string | null>(sessionId)
  const deepThinkRef = useRef<boolean>(deepThink)
  const webSearchRef = useRef<boolean>(webSearch)
  sessionIdRef.current = sessionId
  deepThinkRef.current = deepThink
  webSearchRef.current = webSearch

  // 同步到模块级 store，跨开/关保留
  useEffect(() => { sessionStore.messages = messages }, [messages])
  useEffect(() => { sessionStore.sessionId = sessionId }, [sessionId])
  useEffect(() => { sessionStore.deepThink = deepThink }, [deepThink])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const loadSessions = useCallback(async () => {
    try {
      const list = await aiApi.listChatSessions()
      setSessions(list)
    } catch {}
  }, [])

  useEffect(() => {
    if (open && historyOpen) loadSessions()
  }, [open, historyOpen, loadSessions])

  const applyAction = useCallback((action: any) => {
    if (!action) return
    if (action.type === 'theme') setTheme(action.payload as 'light' | 'dark' | 'system')
    else if (action.type === 'navigate') navigate(action.payload)
  }, [setTheme, navigate])

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const remain = 4 - imagesRef.current.length
    if (remain <= 0) return
    Array.from(files).slice(0, remain).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setImages((prev) => [...prev, { id: genId(), dataUrl, name: file.name }])
      }
      reader.readAsDataURL(file)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  const send = useCallback((text: string) => {
    const t = text.trim()
    if (!t || loading) return
    const imgs = imagesRef.current.map((i) => i.dataUrl)
    setInput('')
    setImages([])
    const userMsg: Msg = { id: genId(), role: 'user', content: t }
    const aiMsg: Msg = { id: genId(), role: 'assistant', content: '', tools: [], pending: true }
    setMessages((m) => [...m, userMsg, aiMsg])
    setLoading(true)

    const ctrl = aiApi.chatStream(t, sessionIdRef.current, {
      deepThink: deepThinkRef.current,
      webSearch: webSearchRef.current,
      systemPrompt: customPromptRef.current,
      images: imgs,
      onDelta: (chunk) => {
        setMessages((m) => m.map((msg) => msg.id === aiMsg.id ? { ...msg, content: msg.content + chunk } : msg))
      },
      onReasoning: (chunk) => {
        setMessages((m) => m.map((msg) => msg.id === aiMsg.id ? { ...msg, reasoning: (msg.reasoning || '') + chunk } : msg))
      },
      onTool: ({ name, observation }) => {
        setMessages((m) => m.map((msg) => msg.id === aiMsg.id
          ? { ...msg, tools: [...(msg.tools || []), { name, observation }] }
          : msg))
      },
      onSources: (sources) => {
        setMessages((m) => m.map((msg) => msg.id === aiMsg.id
          ? { ...msg, sources: [...(msg.sources || []), ...sources] }
          : msg))
      },
      onDone: (ev) => {
        setMessages((m) => m.map((msg) => msg.id === aiMsg.id ? { ...msg, pending: false } : msg))
        if (ev.sessionId) setSessionId(ev.sessionId)
        if (ev.refresh) queryClient.invalidateQueries()
        applyAction(ev.action)
        setLoading(false)
      },
      onError: (msg) => {
        setMessages((m) => m.map((msg2) => msg2.id === aiMsg.id
          ? { ...msg2, content: msg2.content || `⚠️ ${msg}`, pending: false }
          : msg2))
        setLoading(false)
      },
    })
    abortRef.current = ctrl
  }, [loading, applyAction, queryClient])

  const newChat = () => {
    abortRef.current?.abort()
    setSessionId(null)
    setMessages([])
    setHistoryOpen(false)
  }

  const openSession = async (id: string) => {
    try {
      const { messages: rows } = await aiApi.getChatSession(id)
      const restored: Msg[] = rows.map((r) => {
        const tools = r.toolCalls ? JSON.parse(r.toolCalls) : undefined
        const sources = (tools || []).flatMap((t: any) => t.sources || []).filter(Boolean)
        return {
          id: genId(),
          role: r.role === 'assistant' ? 'assistant' : 'user',
          content: r.content || '',
          tools,
          sources: sources.length ? sources : undefined,
          reasoning: undefined,
          pending: false,
        }
      })
      setSessionId(id)
      setMessages(restored)
      setHistoryOpen(false)
    } catch {}
  }

  const removeSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await aiApi.deleteChatSession(id)
      setSessions((s) => s.filter((x) => x.id !== id))
      if (id === sessionId) newChat()
    } catch {}
  }

  const togglePin = async (s: ChatSessionPreview) => {
    const next = s.pinned ? 0 : 1
    try {
      await aiApi.updateChatSession(s.id, { pinned: !!next })
      setSessions((list) => [...list.map((x) => x.id === s.id ? { ...x, pinned: next } : x)]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)))
    } catch {}
  }

  const addTag = async (s: ChatSessionPreview) => {
    const input = window.prompt('给会话加标签（多个用空格分隔）：', (s.tags || []).join(' '))
    if (input == null) return
    const tags = input.split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 10)
    try {
      await aiApi.updateChatSession(s.id, { tags })
      setSessions((list) => list.map((x) => x.id === s.id ? { ...x, tags } : x))
    } catch {}
  }

  const stop = () => {
    abortRef.current?.abort()
    setLoading(false)
    setMessages((m) => m.map((msg) => ({ ...msg, pending: false })))
  }

  // 语音输入：浏览器原生 Web Speech API（零后端）
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || ''
      if (text) setInput((v) => (v ? v + ' ' : '') + text)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    try { rec.start(); setListening(true) } catch {}
  }

  // @ 引用：把笔记/任务作为上下文注入到下一条消息
  const openMention = async () => {
    setAtOpen(true)
    try {
      const [notes, tasks] = await Promise.all([notesApi.list(), tasksApi.list()])
      setAtResults([
        ...(notes || []).slice(0, 20).map((n: any) => ({ kind: 'note' as const, id: n.id, title: n.title, content: n.content || '' })),
        ...(tasks || []).slice(0, 20).map((t: any) => ({ kind: 'task' as const, id: t.id, title: t.title, content: '' })),
      ])
    } catch {}
  }
  const selectMention = (item: { kind: 'note' | 'task'; title: string; content: string }) => {
    const ref = item.kind === 'note'
      ? `\n\n参考笔记《${item.title}》：${(item.content || '').slice(0, 600)}`
      : `\n\n参考任务：${item.title}`
    setInput((v) => (v ? v + '\n' : '') + ref)
    setAtOpen(false)
    setAtQuery('')
  }
  const filteredMention = atResults.filter((r) =>
    !atQuery.trim() || r.title.toLowerCase().includes(atQuery.trim().toLowerCase())
  )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Sparkles className="size-4" />
          <span className="sr-only">AI 助手</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-[420px] max-w-[100vw] flex-col gap-0 bg-[#0a0a0a] p-0 sm:w-[520px]" showCloseButton={false}>
        {/* ── 极简顶栏 ── */}
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/5 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-white/90">
            <Sparkles className="size-4 text-primary" />
            AI 助手
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" title="聊天历史" onClick={() => { setHistoryOpen(v => !v); }}>
              <History className="size-4" />
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" title="更多" onClick={() => setExportOpen(v => !v)}>
                <SlidersHorizontal className="size-4" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border border-white/10 bg-[#1a1a1a] p-1 shadow-xl shadow-black/40">
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => { setSettingsOpen(true); setExportOpen(false); }}>
                    <SlidersHorizontal className="size-3.5" /> 回复偏好
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => { copyChatAsMarkdown(messages); setExportOpen(false); }}>复制为 Markdown</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => { downloadChatMarkdown(messages, '会话记录'); setExportOpen(false); }}>导出 .md</button>
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => { exportChatPdf(messages, '会话记录'); setExportOpen(false); }}>导出 PDF</button>
                  <div className="my-1 h-px bg-white/5" />
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white" onClick={() => { newChat(); setExportOpen(false); }}>
                    <Plus className="size-3.5" /> 新对话
                  </button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" title="关闭" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* ── 消息区（沉浸式暗色）── */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
            {messages.length === 0 ? (
              /* ── 空状态：DeepSeek 风格居中布局 ── */
              <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                  <Cpu className="size-7" />
                </div>
                <p className="text-base font-medium text-white/90">有什么要我做的？</p>
                <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-white/40">
                  说一句话，我就能直接替你操作工作台：建任务、记笔记、查知识库、联网搜索……当然也能随便聊
                </p>
                {/* 快捷操作 chip */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.slice(0, 4).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={loading}
                      onClick={() => send(s)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white/90 disabled:opacity-40"
                    >
                      {s.length > 16 ? s.slice(0, 14) + '…' : s}
                    </button>
                  ))}
                </div>
                {/* 模式提示 */}
                <div className="mt-6 flex items-center gap-3 text-[11px] text-white/25">
                  <span className="flex items-center gap-1"><Brain className="size-3" /> 深度思考</span>
                  <span className="flex items-center gap-1"><Globe className="size-3" /> 联网搜索</span>
                  <span className="flex items-center gap-1"><AtSign className="size-3" /> 引用笔记</span>
                </div>
              </div>
            ) : (
              /* ── 消息流（无气泡，padding 分隔）── */
              <div className="space-y-6 px-4 py-6">
                {messages.map((m) => {
                  const isUser = m.role === 'user'
                  const { think, rest } = isUser ? { think: '', rest: m.content } : splitThink(m.content)
                  const reasoningText = [m.reasoning, think].filter(Boolean).join('\n\n')
                  return (
                    <div key={m.id} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[88%] space-y-2',
                        isUser && 'max-w-[80%]'
                      )}>
                        {/* 用户消息：右侧对齐，淡色底 */}
                        {isUser ? (
                          <div className="rounded-2xl rounded-br-md bg-white/10 px-4 py-2.5 text-[14px] leading-relaxed text-white/90">
                            <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</span>
                          </div>
                        ) : (
                          /* AI 消息：左侧，无背景，直接渲染 */
                          <div className="space-y-3">
                            {reasoningText && <ThinkingBlock text={reasoningText} />}
                            {m.tools && m.tools.length > 0 && (
                              <div className="space-y-1.5">
                                {m.tools.map((t, i) => (
                                  <div key={i} className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-white/60">
                                    <span className="mt-0.5 shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary/80">
                                      {TOOL_LABEL[t.name] || t.name}
                                    </span>
                                    <span className="break-words leading-relaxed">{t.observation}</span>
                                    {toolTarget(t) && (
                                      <button
                                        type="button"
                                        onClick={() => navigate(toolTarget(t)!)}
                                        className="mt-0.5 shrink-0 rounded-md px-1.5 text-[12px] font-medium text-primary/70 hover:text-primary"
                                      >
                                        查看 →
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {rest ? (
                              <div className="prose-invert max-w-none text-[14px] leading-relaxed [overflow-wrap:anywhere] prose-headings:text-white/90 prose-headings:font-semibold prose-p:text-white/75 prose-li:text-white/75 prose-strong:text-white/90 prose-code:text-white/80 prose-a:text-primary/80 prose-pre:rounded-xl prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 [&_p]:text-[14px] [&_li]:text-[14px] [&_td]:text-[13px] [&_th]:text-[13px] [&_blockquote]:text-white/60 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:text-[13px]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: CodeBlock }}>
                                  {rest}
                                </ReactMarkdown>
                              </div>
                            ) : m.pending ? (
                              <span className="inline-flex gap-1.5 text-white/40">
                                <span className="inline-block size-1.5 animate-round animate-pulse rounded-full bg-white/50" />
                                <span className="inline-block size-1.5 animate-pulse rounded-full bg-white/50" style={{ animationDelay: '0.2s' }} />
                                <span className="inline-block size-1.5 animate-pulse rounded-full bg-white/50" style={{ animationDelay: '0.4s' }} />
                              </span>
                            ) : null}
                            {m.sources && m.sources.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[11px] text-white/30">来源</span>
                                {m.sources.map((s, i) => (
                                  <a key={i} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="max-w-[160px] truncate rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/40 transition-colors hover:bg-white/10 hover:text-white/60">
                                    {s.title || s.url}
                                  </a>
                                ))}
                              </div>
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

          {/* 历史侧栏 */}
          {historyOpen && (
            <div className="absolute inset-0 z-10 flex flex-col bg-[#0a0a0a]">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <span className="text-sm font-medium text-white/90">聊天历史</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" onClick={() => setHistoryOpen(false)}>
                  <Square className="size-3.5" />
                </Button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {sessions.length === 0 && (
                  <p className="px-2 py-6 text-center text-[13px] text-white/30">还没有历史会话</p>
                )}
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => togglePin(s)}
                      className="shrink-0"
                      title={s.pinned ? '取消固定' : '固定到顶部'}
                    >
                      <Pin className={cn('size-3.5', s.pinned ? 'fill-primary text-primary' : 'text-white/30')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openSession(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[13px] font-medium text-white/80">{s.title}</div>
                      {s.tags && s.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {s.tags.map((t) => (
                            <span key={t} className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary/70">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="truncate text-[11px] text-white/30">{s.preview || '（空）'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => addTag(s)}
                      className="shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100"
                      title="加标签"
                    >
                      <Tag className="size-3.5" />
                    </button>
                    <Trash2
                      className="size-3.5 shrink-0 text-white/30 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => removeSession(s.id, e)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 输入区：DeepSeek 风格全宽圆角输入栏 ── */}
        <div className="border-t border-white/5 px-3 py-3">
          {/* @ 引用面板 */}
          {atOpen && (
            <div className="mb-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
              <input
                value={atQuery}
                onChange={(e) => setAtQuery(e.target.value)}
                placeholder="搜索要引用的笔记 / 任务…"
                className="mb-2 w-full rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              />
              <div className="max-h-36 space-y-0.5 overflow-y-auto">
                {filteredMention.length === 0 && (
                  <p className="px-1 py-2 text-center text-[12px] text-white/30">没有可引用的笔记 / 任务</p>
                )}
                {filteredMention.map((r) => (
                  <button
                    key={r.kind + r.id}
                    type="button"
                    onClick={() => selectMention(r)}
                    className="block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
                  >
                    <span className="mr-1.5 rounded bg-primary/10 px-1 text-[10px] text-primary/70">{r.kind === 'note' ? '笔记' : '任务'}</span>
                    {r.title}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAtOpen(false)} className="mt-1.5 w-full text-center text-[11px] text-white/30 hover:text-white/50">关闭</button>
            </div>
          )}

          {/* / 快捷指令 */}
          {input.startsWith('/') && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[['/task', '建任务'], ['/note', '记笔记'], ['/search', '搜索']].map(([cmd, label]) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setInput(`${cmd} `)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
                >
                  {cmd} {label}
                </button>
              ))}
              <button
                type="button"
                onClick={newChat}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
              >
                /clear 清屏
              </button>
            </div>
          )}

          {/* 图片预览 */}
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative">
                  <img src={img.dataUrl} alt={img.name} className="h-14 w-14 rounded-lg border border-white/10 object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((p) => p.filter((x) => x.id !== img.id))}
                    className="absolute -right-1 -top-1 rounded-full bg-white/10 p-0.5 text-white/60 shadow-sm hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

          {/* 全宽输入栏容器：DeepSeek 式 — 输入在上，开关与操作在下 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 pb-2 pt-2 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.07]">
            {/* 上：textarea 全宽 */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              rows={1}
              placeholder="有问题，尽管问"
              className="max-h-32 min-h-[36px] w-full resize-none bg-transparent py-1 text-[14px] leading-relaxed text-white placeholder:text-white/30 focus-visible:outline-none"
            />

            {/* 下：左侧模式开关 pill + 右侧操作图标 */}
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDeepThink((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    deepThink
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/70'
                  )}
                  title="开启后 AI 会先一步步推理再回答，适合复杂问题（更慢）"
                >
                  <Brain className="size-3.5" /> 深度思考
                </button>
                <button
                  type="button"
                  onClick={() => setWebSearch((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    webSearch
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/70'
                  )}
                  title="开启后 AI 会先上网查最新资料再回答"
                >
                  <Globe className="size-3.5" /> 联网搜索
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {speechSupported && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('size-8 text-white/40 hover:text-white', listening && 'text-primary')}
                    title={listening ? '停止语音输入' : '语音输入'}
                    onClick={toggleVoice}
                  >
                    <Mic className="size-4" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="icon" className="size-8 text-white/40 hover:text-white" title="上传图片" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="size-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-white/40 hover:text-white" title="引用笔记/任务" onClick={openMention}>
                  <AtSign className="size-4" />
                </Button>
                {loading ? (
                  <Button size="icon" className="size-8 shrink-0 rounded-xl" onClick={stop} title="停止">
                    <Square className="size-3.5" />
                  </Button>
                ) : (
                  <Button size="icon" className="size-8 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none" disabled={!input.trim()} onClick={() => send(input)}>
                    <Send className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 底部极简提示 */}
          <p className="mt-1.5 px-1 text-center text-[10px] leading-relaxed text-white/20">
            Enter 发送 · Shift+Enter 换行 · 支持图片 / 语音 / 引用笔记
          </p>
        </div>
      </SheetContent>

      {/* 回复偏好弹窗 — 用 Portal 渲染到 body，避免被 Sheet 动画的 transform 破坏 fixed 定位 */}
      {settingsOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div className="relative w-80 rounded-2xl border border-white/10 bg-[#1a1a1a] p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              title="关闭"
              className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <X className="size-4" />
            </button>
            <div className="mb-1 pr-6 text-[14px] font-medium text-white/90">回复偏好</div>
            <p className="mb-3 text-[12px] leading-relaxed text-white/40">
              告诉 AI 你希望它怎么回答你，之后每次对话都会自动生效。不填就用默认方式回答。
            </p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {['回答尽量简短', '多用列表和表格', '解释得通俗一点', '像朋友一样聊天'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCustomPrompt((v) => v.includes(s) ? v : (v ? v + '；' : '') + s)}
                  className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
                >
                  + {s}
                </button>
              ))}
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
              placeholder="例如：回答尽量简短；专业术语要解释…"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
            />
            <div className="mt-3 flex gap-2">
              {customPrompt && (
                <button type="button" onClick={() => setCustomPrompt('')} className="rounded-xl border border-white/10 px-3 py-2 text-[12px] text-white/50 hover:border-white/20 hover:text-white/70">清空</button>
              )}
              <button type="button" onClick={() => setSettingsOpen(false)} className="flex-1 rounded-xl bg-primary py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90">完成</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Sheet>
  )
}

// LobeChat 嵌入模式：把成熟的 LobeChat 聊天界面用 iframe 嵌进我们的 AI 助手面板
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
      <SheetContent className="flex w-[420px] max-w-[100vw] flex-col gap-0 bg-[#0a0a0a] p-0 sm:w-[520px]" showCloseButton={false}>
        <SheetHeader className="flex flex-row items-center justify-between border-b border-white/5 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-white/90">
            <Sparkles className="size-4 text-primary" />
            AI 助手
          </SheetTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" title="关闭" onClick={() => setOpen(false)}>
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

// 入口：配置了 LobeChat 地址就嵌入它（专业 UI + 接我们 MCP），否则回退到内置手搓聊天
export function AIChatSheet() {
  if (LOBECHAT_URL) return <LobeChatFrame url={LOBECHAT_URL} />
  return <BuiltinAIChat />
}

// 思考过程折叠块（DeepSeek 风格：暗色沉浸）
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[12px] font-medium text-white/50 transition-colors hover:text-white/70"
      >
        <Brain className="size-3.5" />
        <span>思考过程</span>
        <span className="ml-auto text-white/30">{open ? '收起 ▾' : '展开 ▸'}</span>
      </button>
      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[12px] leading-relaxed text-white/35">
          {text}
        </div>
      )}
    </div>
  )
}
