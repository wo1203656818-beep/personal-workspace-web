import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useUndo } from '@/lib/use-undo'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Plus, Trash2, ArrowLeft, Search, Save, Sparkles, Columns2, Copy, Pin, PinOff, Grid3X3, LayoutList, Loader2, MessageCircle } from 'lucide-react'
import { notesApi, imaApi, tasksApi, taskListsApi, aiApi, type NoteSummary, type Note } from '@/lib/api'
import { STALE_TIME } from '@/lib/query'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { DetailSkeleton } from '@/components/PageSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { useIsMobile } from '@/hooks/use-mobile'
import { ImportNoteForm } from '@/components/notes/ImportNoteForm'
import { MarkdownToolbar } from '@/components/notes/MarkdownToolbar'
import { NotePageContent } from '@/components/notes/NotePageContent'
import { TocSidebar, MobileTocDropdown } from '@/components/notes/TocSidebar'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageTitle } from '@/hooks/use-page-title'
import { AIQaPanel } from '@/components/ai/AIQaPanel'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

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

export function NotesPage() {
  usePageTitle('笔记')
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
  const [qaOpen, setQaOpen] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingDeleteNoteRef = useRef<import('@/lib/api').Note | null>(null)

  // Recently viewed notes
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('notes_recently_viewed') || '[]') } catch { return [] }
  })
  const trackView = useCallback((noteId: string) => {
    setRecentlyViewed(prev => {
      const next = [noteId, ...prev.filter(id => id !== noteId)].slice(0, 5)
      localStorage.setItem('notes_recently_viewed', JSON.stringify(next))
      return next
    })
  }, [])

  // Pinned notes
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('notes_pinned') || '[]') } catch { return [] }
  })
  const togglePin = useCallback((noteId: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(noteId) ? prev.filter(id => id !== noteId) : [noteId, ...prev]
      localStorage.setItem('notes_pinned', JSON.stringify(next))
      return next
    })
  }, [])

  // View mode: grid | list
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('notes_view_mode') as 'grid' | 'list') || 'grid'
  })
  useEffect(() => { localStorage.setItem('notes_view_mode', viewMode) }, [viewMode])

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)

  const [aiOpen, setAiOpen] = useState(false)
  const [aiAction, setAiAction] = useState<'summary' | 'points' | 'to-task'>('summary')
  const [aiResult, setAiResult] = useState('')
  const parsedAiTasks = useMemo(
    () =>
      aiResult
        .split('\n')
        .map((s) => s.replace(/^[-*\d.\s、]+/, '').trim())
        .filter(Boolean)
        .filter((t) => t.length < 200),
    [aiResult],
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

  const { data: notes = [] } = useQuery<NoteSummary[]>({
    queryKey: ['notes'],
    queryFn: notesApi.listSummary,
    enabled: trimmedQuery.length === 0,
    staleTime: STALE_TIME,
  })

  const { data: searchResults = [] } = useQuery<Note[]>({
    queryKey: ['notes', 'search', trimmedQuery],
    queryFn: () => notesApi.search(trimmedQuery),
    enabled: trimmedQuery.length > 0,
    staleTime: STALE_TIME,
  })

  const displayedNotes = useMemo<NoteSummary[]>(() => {
    const data = trimmedQuery ? searchResults : notes
    return (Array.isArray(data) ? data : []).map((n) => ({
      id: n.id,
      title: n.title,
      sourceFile: n.sourceFile,
      importedAt: n.importedAt,
      updatedAt: n.updatedAt,
      snippet:
        'snippet' in n ? n.snippet : (n.content || '').replace(/[#*`>[\]-]/g, '').slice(0, 100),
    })).sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id)
      const bPinned = pinnedIds.includes(b.id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return 0
    })
  }, [trimmedQuery, searchResults, notes, pinnedIds])

  const { data: selectedNote, isLoading: noteLoading } = useQuery({
    queryKey: ['note', id],
    queryFn: () => notesApi.get(id!),
    enabled: !!id,
    staleTime: STALE_TIME,
  })

  useEffect(() => {
    if (selectedNote) {
      setEditableContent(selectedNote.content ?? '')
      setAppendContent('')
      setEditableTitle(selectedNote.title ?? '')
      setActiveTab(selectedNote.sourceFile === 'ima_openapi' ? 'preview' : 'edit')
      trackView(selectedNote.id)
    }
  }, [selectedNote, trackView])

  const tocItems = useMemo(() => extractToc(editableContent), [editableContent])

  useEffect(() => {
    if (!previewRef.current || activeTab !== 'preview') return
    const headings = previewRef.current.querySelectorAll('h1, h2, h3')
    headings.forEach((h, i) => {
      if (tocItems[i]) h.id = tocItems[i].slug
    })
  }, [tocItems, activeTab, editableContent])

  const createNoteMutation = useMutation({
    mutationFn: () => notesApi.import({ title: '未命名笔记', content: '' }),
    onSuccess: (note: { id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      navigate(`/notes/${note.id}`)
      toast.success('已创建新笔记')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      pendingDeleteNoteRef.current = await notesApi.get(noteId)
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

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const noteId of ids) {
        await notesApi.delete(noteId)
      }
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      setSelectedIds(new Set())
      toast.success(`已删除 ${ids.length} 条笔记`)
    },
    onError: (err: Error) => toast.error(`批量删除失败: ${err.message}`),
  })

  const updateNoteMutation = useMutation({
    mutationFn: (data: { title?: string; content?: string }) => notesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', id] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast.success('已保存')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

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
      const toAppend = appendContent.trim()
      if (!toAppend) return
      appendImaMutation.mutate(
        { id: id!, content: toAppend },
        {
          onSuccess: () => {
            setAppendContent('')
            setEditableContent((prev) => (prev ? prev + '\n\n' + toAppend : toAppend))
          },
        },
      )
    } else {
      updateNoteMutation.mutate({ content: editableContent, title: editableTitle })
    }
  }

  const isDirty =
    selectedNote &&
    ((selectedNote.sourceFile === 'ima_openapi'
      ? appendContent.trim().length > 0
      : editableContent !== (selectedNote.content ?? '')) ||
      editableTitle !== (selectedNote.title ?? ''))

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!selectedNote || !isDirty) return
    if (selectedNote.sourceFile === 'ima_openapi') return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      updateNoteMutation.mutate({ title: editableTitle, content: editableContent })
    }, 1500)
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableContent, editableTitle, selectedNote])

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
      { rootMargin: '-20px 0px -70% 0px', threshold: 0 },
    )

    headings.forEach((h) => {
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
        <div className="page-layout">
          <div className="page-header">
            <div className="page-header-left min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-lg"
                onClick={() => navigate('/notes')}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <div className="icon-badge size-9 shrink-0 bg-gradient-to-br from-primary to-primary/80 md:size-10">
                <FileText className="size-5" />
              </div>
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
                className="min-w-0 flex-1 border-0 px-0 text-lg font-semibold tracking-tight focus-visible:ring-0 sm:text-xl md:text-2xl"
              />
            </div>
            <div className="page-header-right">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={
                  updateNoteMutation.isPending ||
                  appendImaMutation.isPending ||
                  (selectedNote?.sourceFile === 'ima_openapi' && !appendContent.trim())
                }
                className={cn(
                  "h-8 gap-2 rounded-lg transition-all sm:h-9",
                  (updateNoteMutation.isPending || appendImaMutation.isPending) && "animate-pulse bg-primary/80"
                )}
              >
                {updateNoteMutation.isPending || appendImaMutation.isPending ? (
                  <><Loader2 className="size-4 animate-spin" /> 保存中...</>
                ) : (
                  <><Save className="size-4" />
                  {selectedNote?.sourceFile === 'ima_openapi'
                    ? appendContent.trim()
                      ? '追加*'
                      : '追加'
                    : isDirty
                      ? '保存*'
                      : '保存'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAi('summary')}
                disabled={noteAiMutation.isPending}
                className="h-8 gap-1 rounded-lg sm:h-9"
              >
                <Sparkles className="size-3.5" /> 总结
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAi('points')}
                disabled={noteAiMutation.isPending}
                className="h-8 rounded-lg sm:h-9"
              >
                要点
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAi('to-task')}
                disabled={noteAiMutation.isPending}
                className="h-8 rounded-lg sm:h-9"
              >
                转任务
              </Button>
            </div>
          </div>
          <div className="page-content-wide">
          <div className="flex flex-1 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 md:p-6">
                <MobileTocDropdown
                  items={tocItems}
                  activeSlug={activeSlug}
                  onTocClick={handleTocClick}
                  mobileOpen={showMobileToc}
                  onMobileToggle={() => setShowMobileToc((v) => !v)}
                  onMobileItemClick={() => setShowMobileToc(false)}
                />
                <Tabs
                  value={splitView ? 'split' : activeTab}
                  onValueChange={(v) => {
                    if (v !== 'split') {
                      setSplitView(false)
                      setActiveTab(v)
                    }
                  }}
                >
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
                      <MarkdownToolbar onInsert={insertMarkdown} />
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
                  {splitView && (
                    <div className="mt-4 flex gap-4">
                      <div className="flex-1 min-w-0 space-y-3">
                        {selectedNote?.sourceFile !== 'ima_openapi' && (
                          <MarkdownToolbar onInsert={insertMarkdown} />
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
                          <div ref={previewRef} className="max-h-[75vh] overflow-auto">
                            {selectedNote && <NotePageContent note={selectedNote} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Tabs>
                {/* Word count */}
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>
                    {editableContent.length} 字
                    {editableContent.trim() && <span className="ml-2">· {editableContent.trim().split(/\s+/).filter(Boolean).length} 词</span>}
                  </span>
                  <span className="text-[10px]">
                    {selectedNote?.sourceFile !== 'ima_openapi' && (isDirty ? '未保存' : '已保存')}
                  </span>
                </div>
              </div>
            </ScrollArea>
            <TocSidebar items={tocItems} activeSlug={activeSlug} onTocClick={handleTocClick} />
          </div>
          </div>
        </div>

        <Dialog open={aiOpen} onOpenChange={setAiOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                {aiAction === 'summary'
                  ? '笔记总结'
                  : aiAction === 'points'
                    ? '关键要点'
                    : '可转任务'}
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
                  {createFromAiMutation.isPending
                    ? '创建中...'
                    : `创建 ${parsedAiTasks.length} 个任务`}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(aiResult)}
                  className="gap-2"
                >
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
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-primary to-primary/80 md:size-10">
            <FileText className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">笔记</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">记录想法、知识与灵感</p>
          </div>
        </div>
        <div className="page-header-right">
          <Button
            size="sm"
            onClick={() => createNoteMutation.mutate()}
            disabled={createNoteMutation.isPending}
            className="h-8 gap-1 rounded-lg sm:h-9"
          >
            <FileText className="size-3.5 sm:size-4" /> 新建笔记
          </Button>
          <Button size="sm" onClick={() => setShowImport(!showImport)} className="h-8 gap-1 rounded-lg sm:h-9">
            <Plus className="size-3.5 sm:size-4" /> 导入
          </Button>
        </div>
      </div>
      <div className="page-content-wide">

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

      {showImport && (
        <ImportNoteForm
          onDone={() => {
            setShowImport(false)
            queryClient.invalidateQueries({ queryKey: ['notes'] })
          }}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2 md:p-4">
          {/* Toolbar: view toggle and select all */}
          {!trimmedQuery && displayedNotes.length > 0 && (
            <div className="flex items-center justify-between px-1 py-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => {
                  if (selectedIds.size === displayedNotes.length) setSelectedIds(new Set())
                  else setSelectedIds(new Set(displayedNotes.map(n => n.id)))
                }}>
                  <Checkbox
                    checked={selectedIds.size === displayedNotes.length && displayedNotes.length > 0}
                    className="mr-1"
                  />
                  {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
                </Button>
                {selectedIds.size > 0 && (
                  <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setBatchDeleteConfirm(true)}>
                    <Trash2 className="size-3" /> 删除 ({selectedIds.size})
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" className="size-7 p-0" onClick={() => setViewMode('grid')}>
                  <Grid3X3 className="size-3.5" />
                </Button>
                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" className="size-7 p-0" onClick={() => setViewMode('list')}>
                  <LayoutList className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Recently viewed */}
          {!trimmedQuery && recentlyViewed.length > 0 && (
            <div className="px-1 pb-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">最近查看</p>
              <div className="flex flex-wrap gap-2">
                {recentlyViewed.map(id => {
                  const note = notes.find(n => n.id === id)
                  if (!note) return null
                  return (
                    <button
                      key={id}
                      onClick={() => navigate(`/notes/${id}`)}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <FileText className="size-3" />
                      {note.title}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!displayedNotes || displayedNotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={trimmedQuery ? '未找到匹配的笔记' : '暂无笔记'}
              description={
                trimmedQuery
                  ? '尝试更换关键词'
                  : '点击「IMA 同步」拉取笔记，或「导入」本地 Markdown'
              }
            />
          ) : (
            <div className={cn(
              viewMode === 'grid' ? 'grid gap-3 md:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-1'
            )}>
              {(displayedNotes || []).map((note: NoteSummary) => {
                const isIma = note.sourceFile === 'ima_openapi'
                const isPinned = pinnedIds.includes(note.id)
                const isSelected = selectedIds.has(note.id)
                return (
                  <div
                    key={note.id}
                    className={cn(
                      'group surface-card flex transition-colors',
                      viewMode === 'grid' ? 'flex-col gap-3 cursor-pointer hover:bg-accent/50' : 'flex-row items-center gap-3 cursor-pointer rounded-lg px-3 py-2 hover:bg-accent',
                      isPinned && 'border-l-2 border-primary/40',
                      isSelected && 'bg-accent/60'
                    )}
                    onClick={() => navigate(`/notes/${note.id}`)}
                  >
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev)
                            if (checked) next.add(note.id)
                            else next.delete(note.id)
                            return next
                          })
                        }}
                        className="size-3.5"
                      />
                    </div>
                    <div className={cn('flex items-start gap-3 flex-1 min-w-0', viewMode === 'grid' ? '' : '')}>
                      <div
                        className={cn(
                          'icon-badge size-9 shrink-0',
                          isIma
                            ? 'bg-gradient-to-br from-sky-500 to-blue-500'
                            : 'bg-gradient-to-br from-primary to-primary/80',
                        )}
                      >
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isPinned && <Pin className="size-3 text-primary/60 shrink-0" />}
                          <p className="truncate text-sm font-medium">{note.title}</p>
                        </div>
                        {note.snippet && (
                          <p className={cn('mt-1 text-xs text-muted-foreground', viewMode === 'grid' ? 'line-clamp-2' : 'truncate')}>
                            {note.snippet.replace(/[#*`>[\]-]/g, '').slice(0, 100)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={cn('flex items-center gap-1', viewMode === 'grid' ? 'justify-between pt-1' : 'shrink-0')}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            isIma
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {isIma ? 'IMA' : '本地'}
                        </span>
                        {viewMode === 'grid' && (
                          <span className="text-xs text-muted-foreground">
                            {note.importedAt ? formatCST(note.importedAt, 'date') : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 md:opacity-0 md:group-hover:opacity-100" onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/notes/${note.id}`)
                              toast.success('链接已复制')
                            }}>
                              <Copy className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>复制链接</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 md:opacity-0 md:group-hover:opacity-100" onClick={() => togglePin(note.id)}>
                              {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isPinned ? '取消置顶' : '置顶'}</TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 md:opacity-0 md:group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirmId(note.id)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
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

      <AlertDialog open={batchDeleteConfirm} onOpenChange={setBatchDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除笔记</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedIds.size} 条笔记吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBatchDeleteConfirm(false)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                batchDeleteMutation.mutate(Array.from(selectedIds))
                setBatchDeleteConfirm(false)
              }}
              disabled={batchDeleteMutation.isPending}
            >
              {batchDeleteMutation.isPending ? '删除中...' : `删除 (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        className="fixed bottom-20 right-6 z-50 size-12 rounded-full shadow-lg md:bottom-6"
        onClick={() => setQaOpen(true)}
      >
        <MessageCircle className="size-5" />
      </Button>
      <AIQaPanel open={qaOpen} onOpenChange={setQaOpen} />
      </div>
    </div>
  )
}
