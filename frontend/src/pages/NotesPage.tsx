import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { useUndo } from '@/lib/use-undo'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Plus, Trash2, ArrowLeft, RefreshCw, Search, Save, ChevronDown, Bold, Italic, Heading, Link as LinkIcon, List, Sparkles, Columns2, CheckCircle2, AlertCircle } from 'lucide-react'
import { notesApi, imaApi, tasksApi, taskListsApi, aiApi, type Note } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DetailSkeleton } from '@/components/PageSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { useIsMobile } from '@/hooks/use-mobile'

// Markdown 渲染包体积大，按页面懒加载
const MarkdownPreview = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }, { default: rehypeHighlight }, { default: rehypeRaw }] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('rehype-highlight'),
    import('rehype-raw'),
  ])
  return {
    default: ({ content }: { content: string }) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeRaw]}>
        {content}
      </ReactMarkdown>
    ),
  }
})

// 将标题文本转为锚点 id
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

// 从 Markdown 原文提取 h1/h2/h3 作为 TOC 条目
function extractToc(content: string): { level: number; text: string; slug: string }[] {
  const items: { level: number; text: string; slug: string }[] = []
  const usedSlugs = new Map<string, number>()
  const regex = /^(#{1,3})\s+(.+)$/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length
    const text = match[2].trim()
    let slug = slugify(text)
    const count = usedSlugs.get(slug) ?? 0
    usedSlugs.set(slug, count + 1)
    if (count > 0) slug = `${slug}-${count}`
    items.push({ level, text, slug })
  }
  return items
}

function NotePageContent({ note }: { note: Note }) {
  const isIma = note.sourceFile === 'ima_openapi'
  if (isIma && note.contentHtml) {
    return (
      <div
        className="break-words rounded-xl bg-muted/30 p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full"
        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
      />
    )
  }
  return (
    <div className="break-words rounded-xl bg-muted/30 p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
      <Suspense fallback={<div className="text-muted-foreground">加载预览中…</div>}>
        <MarkdownPreview content={note.content} />
      </Suspense>
    </div>
  )
}

export function NotesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { push: pushUndo } = useUndo()
  const isMobile = useIsMobile()
  const [showImport, setShowImport] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editableContent, setEditableContent] = useState('')
  const [appendContent, setAppendContent] = useState('')
  const [activeTab, setActiveTab] = useState('edit')
  const [splitView, setSplitView] = useState(false)
  const [editableTitle, setEditableTitle] = useState('')
  const [showMobileToc, setShowMobileToc] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState<string>('')
  const previewRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingDeleteNoteRef = useRef<Note | null>(null)

  // AI 辅助：总结 / 要点 / 转任务
  const [aiOpen, setAiOpen] = useState(false)
  const [aiAction, setAiAction] = useState<'summary' | 'points' | 'to-task'>('summary')
  const [aiResult, setAiResult] = useState('')
  const parsedAiTasks = useMemo(
    () => aiResult.split('\n').map((s) => s.replace(/^[-*\d.\s、]+/, '').trim()).filter(Boolean).filter((t) => t.length < 200),
    [aiResult]
  )

  const noteAiMutation = useMutation({
    mutationFn: (action: 'summary' | 'points' | 'to-task') => aiApi.noteSummary(id!, action),
    onSuccess: (data) => {
      setAiResult(data.result || '')
      setAiOpen(true)
    },
    onError: (e: Error) => toast.error('AI 请求失败: ' + e.message),
  })

  const createFromAiMutation = useMutation({
    mutationFn: async (lines: string[]) => {
      const lists = await taskListsApi.list()
      const listId = lists[0]?.id
      if (!listId) throw new Error('没有可用的任务列表')
      let n = 0
      for (const title of lines) {
        await tasksApi.create({ listId, title })
        n++
      }
      return n
    },
    onSuccess: (n) => {
      toast.success(`已创建 ${n} 个任务`)
      setAiOpen(false)
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
    },
    onError: (e: Error) => toast.error('创建失败: ' + e.message),
  })

  const handleAi = (action: 'summary' | 'points' | 'to-task') => {
    if (!selectedNote) return
    setAiAction(action)
    noteAiMutation.mutate(action)
  }

  const trimmedQuery = searchQuery.trim()

  const { data: notes = [] } = useQuery({
    queryKey: ['notes'],
    queryFn: notesApi.list,
    enabled: trimmedQuery.length === 0,
    staleTime: 2 * 60 * 1000,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['notes', 'search', trimmedQuery],
    queryFn: () => notesApi.search(trimmedQuery),
    enabled: trimmedQuery.length > 0,
    staleTime: 2 * 60 * 1000,
  })

  const displayedNotes = useMemo(() => {
    const data = trimmedQuery ? searchResults : notes
    return Array.isArray(data) ? data : []
  }, [trimmedQuery, searchResults, notes])

  const { data: selectedNote, isLoading: noteLoading } = useQuery({
    queryKey: ['note', id],
    queryFn: () => notesApi.get(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })

  // 进入详情页时把 selectedNote.content 同步到可编辑 state
  useEffect(() => {
    if (selectedNote) {
      setEditableContent(selectedNote.content ?? '')
      setAppendContent('')
      setEditableTitle(selectedNote.title ?? '')
      // IMA 笔记默认进"预览"Tab，渲染 markdown（含图片）；普通笔记进"编辑"Tab
      setActiveTab(selectedNote.sourceFile === 'ima_openapi' ? 'preview' : 'edit')
    }
  }, [selectedNote])

  const tocItems = useMemo(() => extractToc(editableContent), [editableContent])

  // 给预览区的 h1/h2/h3 注入 id（按 TOC 顺序对齐），便于锚点滚动
  useEffect(() => {
    if (!previewRef.current || activeTab !== 'preview') return
    const headings = previewRef.current.querySelectorAll('h1, h2, h3')
    headings.forEach((h, i) => {
      if (tocItems[i]) h.id = tocItems[i].slug
    })
  }, [tocItems, activeTab, editableContent])

  // IMA 笔记同步（就近反馈）
  const [imaSyncFeedback, setImaSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const imaFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(imaFeedbackTimerRef.current), [])

  const syncImaMutation = useMutation({
    mutationFn: () => imaApi.syncNotes(),
    onSuccess: (data: { ok: boolean; synced?: number; partial?: boolean; skipped?: number; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      const msg = data.partial
        ? `部分同步${data?.synced != null ? ` · ${data.synced} 条` : ''}，剩余 ${data.skipped ?? 0} 条`
        : `同步完成${data?.synced != null ? ` · ${data.synced} 条` : ''}`
      setImaSyncFeedback({ type: 'success', message: msg })
      clearTimeout(imaFeedbackTimerRef.current)
      imaFeedbackTimerRef.current = setTimeout(() => setImaSyncFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setImaSyncFeedback({ type: 'error', message: `同步失败: ${err.message}` })
    },
  })

  // 删除笔记（支持撤销恢复）
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => {
      pendingDeleteNoteRef.current = notes.find((n) => n.id === noteId) ?? null
      return notesApi.delete(noteId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      const note = pendingDeleteNoteRef.current
      if (note) {
        pushUndo({
          label: '笔记已删除',
          undo: async () => {
            await notesApi.import({
              title: note.title,
              content: note.content,
              sourceFile: note.sourceFile ?? undefined,
            })
            queryClient.invalidateQueries({ queryKey: ['notes'] })
            toast.success('已撤销删除')
          },
        })
      }
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // 保存笔记
  const updateNoteMutation = useMutation({
    mutationFn: (data: { title?: string; content?: string }) => notesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', id] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('已保存')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  // IMA 笔记追加（sourceFile === 'ima_openapi' 时保存走追加）
  const appendImaMutation = useMutation({
    mutationFn: (data: { id: string; content: string }) => imaApi.appendNote(data.id, data.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', id] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('已追加到 IMA 原笔记末尾')
    },
    onError: (err: Error) => toast.error(`IMA 追加失败: ${err.message}`),
  })

  const handleSave = () => {
    if (selectedNote?.sourceFile === 'ima_openapi') {
      // IMA 笔记：只追加新增内容，避免把原文整体复制一份
      const toAppend = appendContent.trim()
      if (!toAppend) return
      appendImaMutation.mutate(
        { id: id!, content: toAppend },
        {
          onSuccess: () => {
            setAppendContent('')
            setEditableContent((prev) => (prev ? prev + '\n\n' + toAppend : toAppend))
          },
        }
      )
    } else {
      updateNoteMutation.mutate({ content: editableContent, title: editableTitle })
    }
  }

  // P0: 自动保存 + 离开提醒
  const isDirty = selectedNote && (
    (selectedNote.sourceFile === 'ima_openapi'
      ? appendContent.trim().length > 0
      : editableContent !== (selectedNote.content ?? '')) ||
    editableTitle !== (selectedNote.title ?? '')
  )

  // debounce 1.5s 自动保存（仅普通笔记，IMA 笔记走手动追加）
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!selectedNote || !isDirty) return
    if (selectedNote.sourceFile === 'ima_openapi') return // IMA 笔记不自动保存
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      updateNoteMutation.mutate({ title: editableTitle, content: editableContent })
    }, 1500)
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableContent, editableTitle, selectedNote])

  // beforeunload：有未保存内容时浏览器层面提醒
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleTocClick = (slug: string) => {
    setActiveTab('preview')
    setTimeout(() => {
      document.getElementById(slug)?.scrollIntoView({ behavior: 'smooth' })
    }, 60)
  }

  // 在光标位置插入 Markdown 语法（P3-3 工具栏）
  const insertMarkdown = useCallback((type: 'bold' | 'italic' | 'heading' | 'link' | 'list') => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value
    const selected = value.slice(start, end)
    let inserted = ''
    let cursorOffset = 0

    switch (type) {
      case 'bold':
        inserted = `**${selected || '加粗'}**`
        cursorOffset = selected ? inserted.length : 2
        break
      case 'italic':
        inserted = `*${selected || '斜体'}*`
        cursorOffset = selected ? inserted.length : 1
        break
      case 'heading': {
        // 在当前行首插入 ##
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        inserted = `## ${selected || '标题'}`
        const before = value.slice(0, lineStart)
        const after = value.slice(end)
        const newValue = before + inserted + after
        setEditableContent(newValue)
        requestAnimationFrame(() => {
          ta.focus()
          const pos = lineStart + inserted.length
          ta.setSelectionRange(pos, pos)
        })
        return
      }
      case 'link':
        inserted = `[${selected || '链接文本'}](https://)`
        cursorOffset = selected ? inserted.length : 5
        break
      case 'list': {
        // 在当前行首插入 -
        const listLineStart = value.lastIndexOf('\n', start - 1) + 1
        inserted = `- ${selected || '列表项'}`
        const listBefore = value.slice(0, listLineStart)
        const listAfter = value.slice(end)
        const listNewValue = listBefore + inserted + listAfter
        setEditableContent(listNewValue)
        requestAnimationFrame(() => {
          ta.focus()
          const pos = listLineStart + inserted.length
          ta.setSelectionRange(pos, pos)
        })
        return
      }
    }

    const newValue = value.slice(0, start) + inserted + value.slice(end)
    setEditableContent(newValue)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + cursorOffset
      ta.setSelectionRange(pos, pos)
    })
  }, [])

  // TOC scrollspy：用 IntersectionObserver 监听预览区标题，高亮当前可见标题（P3-4）
  useEffect(() => {
    if (!previewRef.current || activeTab !== 'preview' || tocItems.length === 0) {
      setActiveSlug('')
      return
    }
    const container = previewRef.current
    const headings = container.querySelectorAll('h1, h2, h3')
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // 找到当前最靠上且可见的标题
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          const idx = Array.from(headings).indexOf(visible[0].target)
          if (idx >= 0 && tocItems[idx]) {
            setActiveSlug(tocItems[idx].slug)
          }
        }
      },
      { rootMargin: '-20px 0px -70% 0px', threshold: 0 }
    )

    headings.forEach((h) => {
      // 确保 id 已注入
      const idx = Array.from(headings).indexOf(h)
      if (tocItems[idx]) h.id = tocItems[idx].slug
      observer.observe(h)
    })

    return () => observer.disconnect()
  }, [tocItems, activeTab, editableContent])

  if (id && noteLoading) {
    return <DetailSkeleton />
  }

  if (id && selectedNote) {
    return (
      <>
        <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b bg-card/50 px-4 py-3 backdrop-blur-sm">
          <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => navigate('/notes')}>
            <ArrowLeft className="size-4" />
          </Button>
          <Input
            value={editableTitle}
            onChange={(e) => setEditableTitle(e.target.value)}
            onBlur={() => {
              const trimmed = editableTitle.trim()
              if (trimmed && trimmed !== selectedNote.title) {
                updateNoteMutation.mutate({ title: trimmed })
              } else if (!trimmed) {
                setEditableTitle(selectedNote.title)
              }
            }}
            className="flex-1 border-0 px-0 text-xl font-semibold tracking-tight focus-visible:ring-0"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={
              updateNoteMutation.isPending ||
              appendImaMutation.isPending ||
              (selectedNote?.sourceFile === 'ima_openapi' && !appendContent.trim())
            }
            className="gap-2 rounded-lg"
          >
            <Save className="size-4" />
            {selectedNote?.sourceFile === 'ima_openapi'
              ? (appendContent.trim() ? '追加*' : '追加')
              : (isDirty ? '保存*' : '保存')}
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => handleAi('summary')} disabled={noteAiMutation.isPending} className="gap-1 rounded-lg">
              <Sparkles className="size-3.5" /> 总结
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAi('points')} disabled={noteAiMutation.isPending} className="rounded-lg">
              要点
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAi('to-task')} disabled={noteAiMutation.isPending} className="rounded-lg">
              转任务
            </Button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 md:p-6">
              {tocItems.length > 0 && (
                <div className="mb-3 md:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMobileToc((v) => !v)}
                    className="w-full justify-between"
                  >
                    目录
                    <ChevronDown className={`size-4 transition-transform ${showMobileToc ? 'rotate-180' : ''}`} />
                  </Button>
                  {showMobileToc && (
                    <nav className="mt-2 space-y-1 rounded-xl bg-muted/30 p-2">
                      {tocItems.map((item) => (
                        <a
                          key={item.slug}
                          href={`#${item.slug}`}
                          onClick={(e) => {
                            e.preventDefault()
                            handleTocClick(item.slug)
                            setShowMobileToc(false)
                          }}
                          className={`block truncate text-xs transition-colors ${
                            activeSlug === item.slug
                              ? 'font-medium text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
                          title={item.text}
                        >
                          {item.text}
                        </a>
                      ))}
                    </nav>
                  )}
                </div>
              )}
              <Tabs value={splitView ? 'split' : activeTab} onValueChange={(v) => { if (v !== 'split') { setSplitView(false); setActiveTab(v) } }}>
                <div className="flex items-center gap-2">
                  <TabsList>
                    <TabsTrigger value="edit">编辑</TabsTrigger>
                    <TabsTrigger value="preview">预览</TabsTrigger>
                  </TabsList>
                  {!isMobile && (
                    <Button
                      variant={splitView ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-9 gap-1.5 text-xs"
                      onClick={() => setSplitView(!splitView)}
                    >
                      <Columns2 className="size-3.5" />
                      {splitView ? '关闭分屏' : '分屏预览'}
                    </Button>
                  )}
                </div>
                <TabsContent value="edit" className="mt-4">
                  {selectedNote?.sourceFile !== 'ima_openapi' && (
                  <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-muted/30 p-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => insertMarkdown('bold')}
                      title="粗体"
                    >
                      <Bold className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => insertMarkdown('italic')}
                      title="斜体"
                    >
                      <Italic className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => insertMarkdown('heading')}
                      title="标题"
                    >
                      <Heading className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => insertMarkdown('link')}
                      title="链接"
                    >
                      <LinkIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => insertMarkdown('list')}
                      title="列表"
                    >
                      <List className="size-4" />
                    </Button>
                  </div>
                  )}
                  {selectedNote?.sourceFile === 'ima_openapi' ? (
                    <div className="space-y-4">
                      <div className="rounded-xl bg-muted/30 p-4">
                        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <FileText className="size-3.5" /> 原文（只读，IMA 仅支持追加）
                        </p>
                        <Textarea
                          readOnly
                          className="min-h-[40vh] resize-none border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                          value={editableContent}
                        />
                      </div>
                      <div className="rounded-xl bg-muted/30 p-4">
                        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Plus className="size-3.5" /> 追加内容
                        </p>
                        <Textarea
                          ref={textareaRef}
                          className="min-h-[20vh] border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                          value={appendContent}
                          onChange={(e) => setAppendContent(e.target.value)}
                          placeholder="在此输入要追加到 IMA 原笔记末尾的内容..."
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted/30 p-4">
                      <Textarea
                        ref={textareaRef}
                        className="min-h-[60vh] border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                        value={editableContent}
                        onChange={(e) => setEditableContent(e.target.value)}
                        placeholder="在此编辑 Markdown 内容..."
                      />
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="preview" className="mt-4">
                  <div className="w-full overflow-x-hidden">
                    {selectedNote && <NotePageContent note={selectedNote} />}
                  </div>
                </TabsContent>
                {/* P0-3: 分屏预览模式 — 桌面端左右并列编辑+预览 */}
                {splitView && (
                  <div className="mt-4 flex gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      {selectedNote?.sourceFile !== 'ima_openapi' && (
                      <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-muted/30 p-1.5">
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => insertMarkdown('bold')} title="粗体">
                          <Bold className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => insertMarkdown('italic')} title="斜体">
                          <Italic className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => insertMarkdown('heading')} title="标题">
                          <Heading className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => insertMarkdown('link')} title="链接">
                          <LinkIcon className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => insertMarkdown('list')} title="列表">
                          <List className="size-4" />
                        </Button>
                      </div>
                      )}
                      <div className="rounded-xl bg-muted/30 p-4">
                        <Textarea
                          ref={textareaRef}
                          className="min-h-[60vh] border-0 bg-transparent font-mono text-sm shadow-none focus-visible:ring-0"
                          value={editableContent}
                          onChange={(e) => setEditableContent(e.target.value)}
                          placeholder="在此编辑 Markdown 内容..."
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="sticky top-4">
                        <div
                          ref={previewRef}
                          className="max-h-[75vh] overflow-auto"
                        >
                          {selectedNote && <NotePageContent note={selectedNote} />}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Tabs>
            </div>
          </ScrollArea>
          {tocItems.length > 0 && (
            <aside className="hidden w-64 shrink-0 overflow-y-auto p-4 md:block">
              <div className="rounded-xl bg-muted/30 p-4">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">目录</p>
                <nav className="space-y-1">
                  {tocItems.map((item) => (
                    <a
                      key={item.slug}
                      href={`#${item.slug}`}
                      onClick={(e) => {
                        e.preventDefault()
                        handleTocClick(item.slug)
                      }}
                      className={cn(
                        'block truncate border-l-2 border-transparent text-xs transition-colors',
                        activeSlug === item.slug
                          ? 'border-primary font-medium text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
                      title={item.text}
                    >
                      {item.text}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* AI 辅助结果弹窗 */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {aiAction === 'summary' ? '笔记总结' : aiAction === 'points' ? '关键要点' : '可转任务'}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm leading-relaxed">
            {aiResult || '（暂无内容）'}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {aiAction === 'to-task' ? (
              <Button
                disabled={createFromAiMutation.isPending || parsedAiTasks.length === 0}
                onClick={() => createFromAiMutation.mutate(parsedAiTasks)}
                className="gap-2"
              >
                {createFromAiMutation.isPending ? '创建中...' : `创建 ${parsedAiTasks.length} 个任务`}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(aiResult)} className="gap-2">
                复制
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-primary to-primary/80 md:size-10">
            <FileText className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">笔记</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">记录想法、知识与灵感</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncImaMutation.mutate()}
            disabled={syncImaMutation.isPending}
            className="gap-2 rounded-lg"
          >
            <RefreshCw className={`size-4 ${syncImaMutation.isPending ? 'animate-spin' : ''}`} />
            IMA 同步
          </Button>
          {imaSyncFeedback && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${
                imaSyncFeedback.type === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive cursor-pointer hover:underline'
              }`}
              onClick={imaSyncFeedback.type === 'error' ? () => syncImaMutation.mutate() : undefined}
            >
              {imaSyncFeedback.type === 'success'
                ? <CheckCircle2 className="size-3.5" />
                : <AlertCircle className="size-3.5" />}
              {imaSyncFeedback.message}
            </span>
          )}
          <Button size="sm" onClick={() => setShowImport(!showImport)} className="rounded-lg gap-1">
            <Plus className="size-4" /> 导入
          </Button>
        </div>
      </div>

      <div className="border-b px-4 py-3 md:px-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索笔记..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
      </div>

      {showImport && <ImportNoteForm onDone={() => { setShowImport(false); queryClient.invalidateQueries({ queryKey: ['notes'] }) }} />}

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2 md:p-4">
          {(!displayedNotes || displayedNotes.length === 0) ? (
            <EmptyState
              icon={FileText}
              title={trimmedQuery ? '未找到匹配的笔记' : '暂无笔记'}
              description={trimmedQuery ? '尝试更换关键词' : '点击「IMA 同步」拉取笔记，或「导入」本地 Markdown'}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(displayedNotes || []).map((note: Note) => {
                const isIma = note.sourceFile === 'ima_openapi'
                return (
                  <div
                    key={note.id}
                    className="group surface-card flex cursor-pointer flex-col gap-3 transition-colors hover:bg-accent/50"
                    onClick={() => navigate(`/notes/${note.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('icon-badge size-9', isIma ? 'bg-gradient-to-br from-sky-500 to-blue-500' : 'bg-gradient-to-br from-primary to-primary/80')}>
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{note.title}</p>
                        {note.content && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {note.content.replace(/[#*`>[\]-]/g, '').slice(0, 100)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', isIma ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-muted text-muted-foreground')}>
                          {isIma ? 'IMA' : '本地'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {note.importedAt ? formatCST(note.importedAt, 'date') : ''}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteConfirmId(note.id)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除笔记？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，笔记将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) deleteNoteMutation.mutate(deleteConfirmId)
                setDeleteConfirmId(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ImportNoteForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [zipImporting, setZipImporting] = useState(false)

  const importMutation = useMutation({
    mutationFn: (data: { title: string; content: string; sourceFile?: string }) => notesApi.import(data),
    onSuccess: onDone,
  })

  const handleFile = async (f: File) => {
    setFile(f)
    if (f.name.endsWith('.md') || f.name.endsWith('.markdown')) {
      const text = await f.text()
      setContent(text)
      if (!title) setTitle(f.name.replace(/\.md$/, '').replace(/\.markdown$/, ''))
    }
  }

  // ZIP 批量导入：使用 fflate 解压
  const handleZip = async (f: File) => {
    setZipImporting(true)
    try {
      const { unzipSync, strFromU8 } = await import('fflate')
      const buf = new Uint8Array(await f.arrayBuffer())
      const files = unzipSync(buf)
      for (const [path, data] of Object.entries(files)) {
        if (path.endsWith('.md') || path.endsWith('.markdown')) {
          const mdContent = strFromU8(data)
          const mdTitle = path.split('/').pop()!.replace(/\.md$/, '').replace(/\.markdown$/, '')
          await notesApi.import({ title: mdTitle, content: mdContent, sourceFile: path })
        }
      }
      onDone()
    } catch (e) {
      console.error('ZIP 解压失败:', e)
    } finally {
      setZipImporting(false)
    }
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-4 md:px-6">
      <div className="surface-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" /> 导入 Markdown 笔记
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">笔记标题</Label>
            <Input placeholder="输入笔记标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">上传 Markdown 文件</Label>
            <Input type="file" accept=".md,.markdown" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">或上传 ZIP 批量导入</Label>
          <Input type="file" accept=".zip" onChange={(e) => e.target.files?.[0] && handleZip(e.target.files[0])} disabled={zipImporting} />
          {zipImporting && <p className="text-xs text-muted-foreground">解压导入中...</p>}
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Markdown 内容</Label>
          <Textarea
            className="min-h-[120px]"
            placeholder="直接粘贴 Markdown 内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!title || !content}
            onClick={() => importMutation.mutate({ title, content, sourceFile: file?.name })}
          >
            确认导入
          </Button>
        </div>
      </div>
    </div>
  )
}
