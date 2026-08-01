import { useState, useRef, useEffect, Suspense, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from 'react-router-dom'
import { BookHeart, Plus, Loader2, Trash2, ChevronLeft, ChevronRight, Save, Eye, EyeOff, CalendarDays, X, Check, Download, List, Brain, RefreshCw, Lightbulb, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { journalApi, type JournalEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { lazyImport } from '@/lib/lazy'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { useSwipeGesture } from '@/hooks/use-swipe-gesture'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePageTitle } from '@/hooks/use-page-title'

const JournalPreview = lazyImport(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] =
    await Promise.all([import('react-markdown'), import('remark-gfm')])
  return {
    default: ({ content }: { content: string }) => (
      <div className="prose prose-sm prose-invert max-w-none [overflow-wrap:anywhere] prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    ),
  }
})

const MOODS = [
  { emoji: '😊', label: '开心', value: 'happy' },
  { emoji: '😐', label: '平静', value: 'neutral' },
  { emoji: '😢', label: '难过', value: 'sad' },
  { emoji: '😡', label: '生气', value: 'angry' },
  { emoji: '😴', label: '疲惫', value: 'tired' },
]

export function JournalPage() {
  usePageTitle('日记')
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [showEntries, setShowEntries] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [preview, setPreview] = useState(false)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved')
  const dirtyRef = useRef(false)
  const lastSavedTimeRef = useRef<number>(Date.now())
  const [savedAgo, setSavedAgo] = useState<string>('')
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [routeLeaveOpen, setRouteLeaveOpen] = useState(false)
  const routeLeaveResolverRef = useRef<((ok: boolean) => void) | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Route leave blocker
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setRouteLeaveOpen(true)
      routeLeaveResolverRef.current = (ok: boolean) => {
        if (ok) blocker.proceed()
        else blocker.reset()
        setRouteLeaveOpen(false)
      }
    }
  }, [blocker])

  // Track dirty state
  useEffect(() => {
    if (content || title || mood) {
      setSaveStatus('unsaved')
      dirtyRef.current = true
    }
  }, [content, title, mood, tags])

  // "Saved X seconds ago" updater
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - lastSavedTimeRef.current) / 1000)
      if (secs < 5) setSavedAgo('刚刚保存')
      else if (secs < 60) setSavedAgo(`${secs}秒前保存`)
      else setSavedAgo('')
    }, 1000)
    return () => clearInterval(interval)
  }, [saveStatus])

  const today = new Date().toISOString().slice(0, 10)

  // Auto-save with debounce
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dirtyRef.current) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      if (content.trim() || title) {
        saveMutation.mutate()
      }
    }, 3000)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [content, title, mood, selectedDate, tags, editId])

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (content.trim() || title) {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
          saveMutation.mutate()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [content, title, mood, selectedDate, tags, editId])

  const { data: entries, isLoading, isError, refetch } = useQuery({
    queryKey: ['journal'],
    queryFn: () => journalApi.list(),
  })

  const { data: journalAiAnalysis, isLoading: journalAiLoading, refetch: refetchJournalAi } = useQuery({
    queryKey: ['journal', 'ai-analysis'],
    queryFn: () => journalApi.aiAnalysis(),
    staleTime: 5 * 60 * 1000,
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      setSaveStatus('saving')
      const data = { title: title || undefined, content, mood: mood || undefined, date: selectedDate, tags: tags.length > 0 ? tags : undefined }
      return editId
        ? journalApi.update(editId, data)
        : journalApi.create(data)
    },
    onSuccess: (result) => {
      setSaveStatus('saved')
      dirtyRef.current = false
      lastSavedTimeRef.current = Date.now()
      setSavedAgo('刚刚保存')
      if (!editId && result?.id) setEditId(result.id)
      queryClient.invalidateQueries({ queryKey: ['journal'] })
    },
    onError: (err: Error) => {
      setSaveStatus('unsaved')
      toast.error(`保存失败: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => journalApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] })
      toast.success('已删除')
      setEditId(null)
      setTitle('')
      setContent('')
      setMood('')
      setTags([])
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const loadEntry = (entry: JournalEntry) => {
    setEditId(entry.id)
    setTitle(entry.title)
    setContent(entry.content)
    setMood(entry.mood || '')
    setSelectedDate(entry.date)
    try {
      const parsed = entry.tags ? JSON.parse(entry.tags) : []
      setTags(Array.isArray(parsed) ? parsed : [])
    } catch {
      setTags([])
    }
  }

  const newEntry = () => {
    setEditId(null)
    setTitle('')
    setContent('')
    setMood('')
    setTags([])
    setSelectedDate(today)
  }

  const changeDate = (days: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    const ds = d.toISOString().slice(0, 10)
    setSelectedDate(ds)
    setShowCalendar(false)
    const entry = entries?.find(e => e.date === ds)
    if (entry) {
      loadEntry(entry)
    } else {
      newEntry()
      setSelectedDate(ds)
    }
  }

  // Image paste handler
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          setContent((prev) => prev + `\n![粘贴的图片](${dataUrl})\n`)
        }
        reader.readAsDataURL(file)
        toast.success('图片已粘贴到内容中')
        return
      }
    }
  }, [])

  // Export single entry as Markdown
  const exportMarkdown = useCallback(() => {
    const header = title ? `# ${title}\n\n` : ''
    const dateLine = `> 日期: ${selectedDate}\n\n`
    const moodLine = mood ? `> 心情: ${MOODS.find(m => m.value === mood)?.emoji} ${MOODS.find(m => m.value === mood)?.label}\n\n` : ''
    const tagsLine = tags.length > 0 ? `> 标签: ${tags.join(', ')}\n\n` : ''
    const md = `${header}${dateLine}${moodLine}${tagsLine}${content}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || '日记'}_${selectedDate}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('已导出为 Markdown')
  }, [title, content, selectedDate, mood, tags])

  // Mood history for past 7 days from entries
  const moodHistory = useMemo(() => {
    const result: { date: string; mood: string }[] = []
    const todayDate = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayDate)
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().slice(0, 10)
      const entry = entries?.find(e => e.date === ds)
      if (entry?.mood) {
        result.push({ date: ds, mood: entry.mood })
      } else {
        result.push({ date: ds, mood: '' })
      }
    }
    return result
  }, [entries])

  // Swipe gesture for mobile sidebar
  const swipeHandlers = useSwipeGesture({
    onSwipeRight: () => setShowMobileSidebar(true),
    onSwipeLeft: () => setShowMobileSidebar(false),
    threshold: 60,
  })

  // Collect all unique tags from entries
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    entries?.forEach(e => {
      try {
        const parsed = e.tags ? JSON.parse(e.tags) : []
        if (Array.isArray(parsed)) parsed.forEach((t: string) => tagSet.add(t))
      } catch {}
    })
    return Array.from(tagSet).sort()
  }, [entries])

  // Filter entries by search term and tag
  const filteredEntries = useMemo(() => {
    let result = entries ?? []
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q)
      )
    }
    if (filterTag) {
      result = result.filter(e => {
        try {
          const parsed = e.tags ? JSON.parse(e.tags) : []
          return Array.isArray(parsed) && parsed.includes(filterTag)
        } catch { return false }
      })
    }
    return result
  }, [entries, searchTerm, filterTag])

  const groupedFiltered = filteredEntries.reduce<Record<string, JournalEntry[]>>((acc, e) => {
    const month = e.date.slice(0, 7)
    if (!acc[month]) acc[month] = []
    acc[month].push(e)
    return acc
  }, {})

  // Calendar helpers
  const calendarDate = new Date(selectedDate)
  const calYear = calendarDate.getFullYear()
  const calMonth = calendarDate.getMonth()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay()
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  // Entries with dates for calendar highlighting
  const entryDates = useMemo(() => {
    const set = new Set<string>()
    entries?.forEach(e => set.add(e.date))
    return set
  }, [entries])

  const hasEntry = (dateStr: string) => entryDates.has(dateStr)

  return (
    <div className="flex h-full flex-col" {...swipeHandlers}>
      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileSidebar(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r shadow-xl">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-4">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-xs font-medium text-muted-foreground">日记列表</span>
                  <Button variant="ghost" size="icon" className="size-6" onClick={() => setShowMobileSidebar(false)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="px-3">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索日记..."
                    className="h-8 text-xs rounded-lg"
                  />
                </div>
                {/* Tag filter */}
                {allTags.length > 0 && (
                  <div className="px-3">
                    <div className="flex flex-wrap gap-1">
                      {filterTag && (
                        <button onClick={() => setFilterTag(null)} className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[9px]">
                          全部 <X className="size-2.5" />
                        </button>
                      )}
                      {allTags.map(t => (
                        <button key={t} onClick={() => setFilterTag(filterTag === t ? null : t)} className={cn('rounded-full px-2 py-0.5 text-[9px] transition-colors', filterTag === t ? 'bg-primary/20 text-primary' : 'bg-primary/5 text-primary/60 hover:bg-primary/10')}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Quick mood widget */}
                <div className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">近7天心情</p>
                  <div className="flex items-center gap-1.5 justify-center">
                    {moodHistory.map((item) => {
                      const moodInfo = MOODS.find(m => m.value === item.mood)
                      const dayNames = ['日', '一', '二', '三', '四', '五', '六']
                      return (
                        <div key={item.date} className={cn('flex flex-col items-center gap-0.5', !item.mood && 'opacity-30')}>
                          <span className="text-sm">{moodInfo?.emoji || '—'}</span>
                          <span className="text-[9px] text-muted-foreground">{dayNames[new Date(item.date).getDay()]}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="px-3"><div className="border-t" /></div>
                {filteredEntries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { loadEntry(e); setShowMobileSidebar(false) }}
                    className={cn('w-full text-left rounded-lg px-3 py-2 text-xs transition-colors hover:bg-accent', e.id === editId && 'bg-accent')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{e.date.slice(5)}</span>
                      {e.mood && <span>{MOODS.find(m => m.value === e.mood)?.emoji}</span>}
                    </div>
                    <p className="truncate font-medium mt-0.5">{e.title || '(无标题)'}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-amber-500 to-orange-500 md:size-10">
            <BookHeart className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              日记
              {entries?.find(e => e.date === today && e.mood) && (
                <span className="ml-2 text-lg" title={MOODS.find(m => m.value === entries.find(e => e.date === today)?.mood)?.label}>
                  {MOODS.find(m => m.value === entries.find(e => e.date === today)?.mood)?.emoji}
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">记录每日心情与思考</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowMobileSidebar(true)} className="md:hidden">
            <List className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowEntries(!showEntries)} className="hidden md:flex">
            {showEntries ? '隐藏列表' : '显示列表'}
          </Button>
          <Button size="sm" onClick={newEntry} className="gap-1 rounded-lg">
            <Plus className="size-4" />新日记
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with entries list */}
        {showEntries && (
          <div className="hidden w-64 shrink-0 border-r md:block">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-4">
                <div className="px-3 pt-2 pb-1">
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索日记..."
                    className="h-8 text-xs rounded-lg"
                  />
                </div>

                {/* Tag filter */}
                {allTags.length > 0 && (
                  <div className="px-3">
                    <div className="flex flex-wrap gap-1">
                      {filterTag && (
                        <button
                          onClick={() => setFilterTag(null)}
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[9px]"
                        >
                          全部 <X className="size-2.5" />
                        </button>
                      )}
                      {allTags.map(t => (
                        <button
                          key={t}
                          onClick={() => setFilterTag(filterTag === t ? null : t)}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[9px] transition-colors',
                            filterTag === t
                              ? 'bg-primary/20 text-primary'
                              : 'bg-primary/5 text-primary/60 hover:bg-primary/10'
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick mood widget - past 7 days */}
                <div className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-2">近7天心情</p>
                  <div className="flex items-center gap-1.5 justify-center">
                    {moodHistory.map((item) => {
                      const moodInfo = MOODS.find(m => m.value === item.mood)
                      const dayLabel = new Date(item.date).getDay()
                      const dayNames = ['日', '一', '二', '三', '四', '五', '六']
                      return (
                        <Tooltip key={item.date}>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              'flex flex-col items-center gap-0.5',
                              !item.mood && 'opacity-30'
                            )}>
                              <span className="text-sm">{moodInfo?.emoji || '—'}</span>
                              <span className="text-[9px] text-muted-foreground">{dayNames[dayLabel]}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-[10px]">{item.date} {moodInfo ? `- ${moodInfo.label}` : '- 无记录'}</p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
                <div className="px-3"><div className="border-t" /></div>

                {isLoading ? (
                  <div className="space-y-2 px-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="space-y-1.5 py-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2 w-24" />
                      </div>
                    ))}
                  </div>
                ) : isError ? (
                  <ErrorState title="加载失败" description="无法加载日记列表" onRetry={() => refetch()} />
                ) : !entries || entries.length === 0 ? (
                  <EmptyState
                    icon={BookHeart}
                    title="暂无日记"
                    description="记录今天的想法和感受，开始你的日记之旅"
                    action={
                      <Button size="sm" onClick={() => {
                        setSelectedDate(new Date().toISOString().slice(0, 10))
                        setEditId(null)
                        setTitle('')
                        setContent('')
                        setMood('')
                        setTags([])
                      }} className="gap-1 rounded-lg">
                        <Plus className="size-4" />
                        写第一篇日记
                      </Button>
                    }
                  />
                ) : filteredEntries.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">无搜索结果</p>
                ) : (
                  Object.entries(groupedFiltered).map(([month, monthEntries]) => (
                    <div key={month}>
                      <p className="text-xs font-medium text-muted-foreground mb-2">{month}</p>
                      <div className="space-y-1">
                        {monthEntries.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => loadEntry(e)}
                            className={cn(
                              'w-full text-left rounded-lg px-3 py-2 text-xs transition-colors hover:bg-accent',
                              e.id === editId && 'bg-accent'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{e.date.slice(5)}</span>
                              {e.mood && <span>{MOODS.find(m => m.value === e.mood)?.emoji}</span>}
                            </div>
                            <p className="truncate font-medium mt-0.5">{e.title || '(无标题)'}</p>
                            <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                              {e.content.slice(0, 50)}{e.content.length > 50 ? '...' : ''}
                            </p>
                            {e.tags && (() => {
                              try {
                                const parsed = JSON.parse(e.tags)
                                return Array.isArray(parsed) && parsed.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {parsed.slice(0, 3).map((t: string) => (
                                      <span key={t} className="text-[9px] rounded-full bg-primary/5 text-primary/60 px-1.5">{t}</span>
                                    ))}
                                  </div>
                                ) : null
                              } catch { return null }
                            })()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main editor area */}
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
              {/* AI 情绪分析 */}
              {journalAiLoading ? (
                <Card>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ) : journalAiAnalysis ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Brain className="size-3.5 text-purple-500" />
                      AI 情绪分析
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {journalAiAnalysis.fromCache && (
                        <span className="text-[10px] text-muted-foreground">缓存</span>
                      )}
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => refetchJournalAi()} disabled={journalAiLoading}>
                        <RefreshCw className={cn('size-3.5', journalAiLoading && 'animate-spin')} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <p className="text-sm">{journalAiAnalysis.report.summary}</p>
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <TrendingUp className="size-3" /> 情绪趋势
                      </div>
                      <p className="text-sm">{journalAiAnalysis.report.pattern}</p>
                    </div>
                    {journalAiAnalysis.report.suggestions.length > 0 && (
                      <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                          <Lightbulb className="size-3" /> AI 建议
                        </div>
                        <ul className="space-y-1">
                          {journalAiAnalysis.report.suggestions.map((s, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-purple-500" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      分析基于最近日记数据 · 生成于 {journalAiAnalysis.generatedAt.slice(0, 16)}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
              {/* Date navigation with calendar */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" onClick={() => changeDate(-1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="relative flex items-center gap-2">
                  <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
                  >
                    <CalendarDays className="size-4" />
                    {selectedDate}
                  </button>
                  {selectedDate === today && (
                    <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">今天</span>
                  )}
                  {/* Calendar popover */}
                  {showCalendar && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl border bg-card p-3 shadow-xl">
                      <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => {
                          const d = new Date(calYear, calMonth - 1, 1)
                          setSelectedDate(d.toISOString().slice(0, 10))
                        }}>
                          <ChevronLeft className="size-3.5" />
                        </Button>
                        <span className="text-xs font-medium">{calYear}年{calMonth + 1}月</span>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => {
                          const d = new Date(calYear, calMonth + 1, 1)
                          setSelectedDate(d.toISOString().slice(0, 10))
                        }}>
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-7 gap-0.5 text-center">
                        {weekDays.map(d => (
                          <span key={d} className="text-[10px] text-muted-foreground py-1">{d}</span>
                        ))}
                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                          <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                          const day = i + 1
                          const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                          const isSelected = dateStr === selectedDate
                          const isToday = dateStr === today
                          const hasEntryToday = hasEntry(dateStr)
                          return (
                            <button
                              key={day}
                              onClick={() => {
                                setSelectedDate(dateStr)
                                setShowCalendar(false)
                                const entry = entries?.find(e => e.date === dateStr)
                                if (entry) loadEntry(entry)
                                else newEntry()
                              }}
                              className={cn(
                                'relative size-7 rounded-lg text-xs transition-colors',
                                isSelected && 'bg-primary text-primary-foreground',
                                !isSelected && isToday && 'border border-primary/50',
                                !isSelected && !isToday && 'hover:bg-accent',
                              )}
                            >
                              {day}
                              {hasEntryToday && !isSelected && (
                                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary/60" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => changeDate(1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Mood selector */}
              <div className="flex items-center gap-2 justify-center">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMood(m.value === mood ? '' : m.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl p-2 transition-all',
                      mood === m.value ? 'bg-primary/10 scale-110' : 'hover:bg-accent opacity-60 hover:opacity-100'
                    )}
                    title={m.label}
                  >
                    <span className="text-xl">{m.emoji}</span>
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Tags input */}
              <div className="flex items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      e.preventDefault()
                      setTags((prev) => [...prev, tagInput.trim()])
                      setTagInput('')
                    }
                  }}
                  placeholder="添加标签，回车确认"
                  className="h-8 text-xs rounded-lg flex-1"
                />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">
                        {t}
                        <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="hover:text-primary/80">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Title */}
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="标题（可选）"
                className="text-lg font-medium border-0 px-0 focus-visible:ring-0"
              />

              {/* Content - Edit / Preview toggle */}
              <div className="flex items-center justify-between border-b pb-2">
                <p className="text-xs text-muted-foreground">支持 Markdown 语法</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setPreview(!preview)}
                >
                  {preview ? <><EyeOff className="size-3.5" /> 编辑</> : <><Eye className="size-3.5" /> 预览</>}
                </Button>
              </div>
              {preview ? (
                <div className="min-h-[300px] rounded-lg border border-border/50 bg-muted/30 p-4">
                  {content.trim() ? (
                    <Suspense fallback={<p className="text-sm text-muted-foreground">加载中...</p>}>
                      <JournalPreview content={content} />
                    </Suspense>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无内容</p>
                  )}
                </div>
              ) : (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="今天发生了什么？写下你的想法...（支持粘贴图片）"
                  rows={12}
                  className="min-h-[300px] resize-y border-0 px-0 focus-visible:ring-0 text-base leading-relaxed"
                />
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  <span>{content.length} 字</span>
                  <span className="ml-2">·</span>
                  <span className="ml-2">{content.trim() ? content.trim().split(/\s+/).filter(Boolean).length : 0} 词</span>
                </p>
                <div className="flex items-center gap-2">
                  {saveStatus === 'saving' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> 保存中...
                    </span>
                  )}
                  {saveStatus === 'saved' && !dirtyRef.current && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <Check className="size-3" /> {savedAgo || '已保存'}
                    </span>
                  )}
                  {saveStatus === 'unsaved' && (
                    <span className="text-xs text-amber-500">未保存</span>
                  )}
                </div>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-2 justify-end">
                {(content.trim() || title) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={exportMarkdown} className="gap-1 rounded-lg">
                        <Download className="size-4" /> 导出
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>导出为 Markdown 文件</TooltipContent>
                  </Tooltip>
                )}
                {editId && (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmId(editId)} disabled={deleteMutation.isPending}>
                    <Trash2 className="size-4 mr-1" />删除
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
                    saveMutation.mutate()
                  }}
                  disabled={saveMutation.isPending || !content.trim()}
                  className="gap-1 rounded-lg"
                >
                  {saveMutation.isPending ? (
                    <><Loader2 className="size-4 animate-spin" /> 保存中...</>
                  ) : (
                    <><Save className="size-4" /> 保存 <span className="hidden text-[10px] text-muted-foreground md:inline">Ctrl+S</span></>
                  )}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Route leave confirmation */}
      <AlertDialog open={routeLeaveOpen} onOpenChange={(open) => { if (!open && routeLeaveResolverRef.current) { routeLeaveResolverRef.current(false); routeLeaveResolverRef.current = null } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的更改</AlertDialogTitle>
            <AlertDialogDescription>你有未保存的更改，确定要离开吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { routeLeaveResolverRef.current?.(false); routeLeaveResolverRef.current = null }}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { routeLeaveResolverRef.current?.(true); routeLeaveResolverRef.current = null }}>离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除日记？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，日记将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId)
              setDeleteConfirmId(null)
            }} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}