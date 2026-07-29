import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Newspaper,
  ExternalLink,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  RefreshCw,
  Loader2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Settings,
  Rss,
  CalendarDays,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'

interface RefreshStatus {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt?: number
  finishedAt?: number
  totalFetched: number
  totalErrors: string[]
  categories: Array<{
    name: string
    status: 'pending' | 'running' | 'done' | 'failed'
    fetched?: number
    errors?: string[]
    sourceCount?: number
  }>
}

interface FeedItem {
  id: string
  sourceId: string
  title: string
  titleZh: string | null
  url: string
  summary: string | null
  category: string
  aiScore: number
  aiSummary: string | null
  aiReason: string | null
  aiTags: string | null
  briefedAt: string | null
  publishedAt: string | null
  fetchedAt: string
}

interface FeedbackRow {
  id: string
  targetType: string
  targetId: string
  feedback: string
  reason: string | null
}

interface NewsSource {
  id: string
  name: string
  url: string
  type: string
  category: string
  lang: string
  enabled: boolean
  weight: number
}

interface TodayBrief {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

interface DigestItem {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

const newsApi = {
  list: (params: { category?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get('news', { searchParams: params }).json<{ items: FeedItem[]; pagination: { page: number; pageSize: number; total: number } }>(),
  refresh: (category: string, offset = 0) => api.post(`news/refresh?category=${encodeURIComponent(category)}&offset=${offset}`).json<{ ok: boolean; fetched: number; errors?: string[]; sourceCount?: number; category?: string; hasMore?: boolean; nextOffset?: number; error?: string }>(),
  refreshStatus: () => api.get('news/refresh-status').json<{ status: RefreshStatus | null }>(),
  process: () => api.post('news/process', { json: { limit: 5 } }).json<{ ok: boolean; processed: number; failed: number }>(),
  feedback: (body: { targetType: 'item' | 'brief'; targetId: string; feedback: 'up' | 'down' | 'save'; reason?: string }) =>
    api.post('news/feedback', { json: body }).json<{ ok: boolean }>(),
  feedbackList: () => api.get('news/feedback').json<FeedbackRow[]>(),
  sources: () => api.get('news/sources').json<NewsSource[]>(),
  updateSources: (body: Array<{ id: string; enabled: boolean }>) => api.put('news/sources', { json: body }).json<{ ok: boolean }>(),
  addSource: (body: { name: string; url: string; type: string; category: string; lang: string; enabled: boolean }) =>
    api.post('news/sources', { json: body }).json<{ ok: boolean; id: string }>(),
  deleteSource: (id: string) => api.delete(`news/sources/${id}`).json<{ ok: boolean }>(),
  today: () => api.get('news/today').json<TodayBrief | null>(),
  digests: () => api.get('news/digests').json<DigestItem[]>(),
}

function NewsPage() {
  const [category, setCategory] = useState<string>('全部')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null)
  const queryClient = useQueryClient()

  // 功能1：订阅源管理
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', url: '', type: 'rss', category: '综合', lang: 'en', enabled: true })

  // 功能2：历史简报
  const [digestDialogOpen, setDigestDialogOpen] = useState(false)
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null)

  // 功能3：反馈原因 Popover
  const [downvotePopoverId, setDownvotePopoverId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['news', 'list', category, search, page],
    queryFn: () => newsApi.list({ category: category === '全部' ? undefined : category, search: search || undefined, page, pageSize: 30 }),
  })

  const { data: feedbackList } = useQuery({
    queryKey: ['news', 'feedback'],
    queryFn: newsApi.feedbackList,
  })

  const feedbackMutation = useMutation({
    mutationFn: newsApi.feedback,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'feedback'] })
    },
  })

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const categories = ['加密', '财经', '科技', '综合']
      const initialStatus: RefreshStatus = {
        status: 'running',
        startedAt: Date.now(),
        totalFetched: 0,
        totalErrors: [],
        categories: categories.map(name => ({ name, status: 'pending' as const })),
      }
      setRefreshStatus(initialStatus)

      const results: Array<{ category: string; fetched: number; errors: string[]; failed: boolean }> = []
      for (const cat of categories) {
        if (cat !== categories[0]) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        setRefreshStatus(prev => {
          if (!prev) return prev
          return {
            ...prev,
            categories: prev.categories.map(c => c.name === cat ? { ...c, status: 'running' as const } : c),
          }
        })
        let catFetched = 0
        let catErrors: string[] = []
        let catFailed = false
        let offset = 0
        let consecutiveFailures = 0
        while (true) {
          let r: Awaited<ReturnType<typeof newsApi.refresh>> | null = null
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              r = await newsApi.refresh(cat, offset)
              break
            } catch (e: any) {
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)))
              } else {
                catErrors.push(`${cat} offset=${offset}: ${e?.message || String(e)}`)
                consecutiveFailures++
              }
            }
          }
          if (r) {
            consecutiveFailures = 0
            catFetched += r.fetched || 0
            catErrors.push(...(r.errors || []))
            if (r.hasMore && r.nextOffset !== undefined) {
              offset = r.nextOffset
              await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000))
            } else {
              break
            }
          } else {
            if (consecutiveFailures >= 2) {
              catFailed = true
              break
            }
            offset += 10
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
        results.push({ category: cat, fetched: catFetched, errors: catErrors, failed: catFailed })
        setRefreshStatus(prev => {
          if (!prev) return prev
          return {
            ...prev,
            totalFetched: prev.totalFetched + catFetched,
            totalErrors: [...prev.totalErrors, ...catErrors.slice(0, 3)],
            categories: prev.categories.map(c => c.name === cat ? { ...c, status: catFailed ? 'failed' as const : 'done' as const, fetched: catFetched, errors: catErrors.slice(0, 3) } : c),
          }
        })
      }

      setRefreshStatus(prev => prev ? { ...prev, status: 'done', finishedAt: Date.now() } : prev)
      return results
    },
    onSuccess: (results) => {
      const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
      const failedCount = results.filter(r => r.failed).length
      toast.success(`抓取完成：${totalFetched} 条新闻${failedCount > 0 ? `，${failedCount} 个分类失败` : ''}`)
      queryClient.invalidateQueries({ queryKey: ['news', 'list'] })
      setTimeout(() => setRefreshStatus(null), 10000)
    },
    onError: (e: any) => {
      toast.error(`抓取失败: ${e.message}`)
      setRefreshStatus(prev => prev ? { ...prev, status: 'failed', finishedAt: Date.now() } : prev)
    },
  })

  const processMutation = useMutation({
    mutationFn: async () => {
      const results = []
      for (let i = 0; i < 3; i++) {
        try {
          const r = await newsApi.process()
          results.push(r)
          if (r.processed === 0) break
        } catch (e) {
          results.push({ processed: 0, failed: 0 })
          break
        }
      }
      return results
    },
    onSuccess: (results) => {
      const totalProcessed = results.reduce((sum, r) => sum + (r.processed || 0), 0)
      if (totalProcessed > 0) {
        toast.success(`AI 已处理 ${totalProcessed} 条新闻`)
        queryClient.invalidateQueries({ queryKey: ['news', 'list'] })
      } else {
        toast.info('没有待处理的新闻')
      }
    },
    onError: (e: any) => toast.error(`处理失败: ${e.message}`),
  })

  // 功能1：订阅源 queries / mutations
  const { data: sources } = useQuery({
    queryKey: ['news', 'sources'],
    queryFn: newsApi.sources,
    enabled: sourcesOpen,
  })

  const updateSourcesMutation = useMutation({
    mutationFn: newsApi.updateSources,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      toast.success('已更新')
    },
    onError: (e: any) => toast.error(`更新失败: ${e.message}`),
  })

  const addSourceMutation = useMutation({
    mutationFn: newsApi.addSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      setNewSource({ name: '', url: '', type: 'rss', category: '综合', lang: 'en', enabled: true })
      toast.success('已添加')
    },
    onError: (e: any) => toast.error(`添加失败: ${e.message}`),
  })

  const deleteSourceMutation = useMutation({
    mutationFn: newsApi.deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      toast.success('已删除')
    },
    onError: (e: any) => toast.error(`删除失败: ${e.message}`),
  })

  const handleSourceToggle = (source: NewsSource, enabled: boolean) => {
    updateSourcesMutation.mutate([{ id: source.id, enabled }])
  }

  const handleAddSource = () => {
    if (!newSource.name || !newSource.url) {
      toast.error('名称和 URL 不能为空')
      return
    }
    addSourceMutation.mutate(newSource)
  }

  // 功能1：按分类分组
  const sourcesByCategory = (sources || []).reduce<Record<string, NewsSource[]>>((acc, s) => {
    const cat = s.category || '未分类'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  // 功能2：今日简报 & 历史简报
  const { data: todayBrief } = useQuery({
    queryKey: ['news', 'today'],
    queryFn: newsApi.today,
  })

  const { data: digests } = useQuery({
    queryKey: ['news', 'digests'],
    queryFn: newsApi.digests,
    enabled: digestDialogOpen,
  })

  const feedbackMap = new Map<string, string>()
  feedbackList?.forEach(f => {
    if (f.targetType === 'item') feedbackMap.set(f.targetId, f.feedback)
  })

  const handleFeedback = (item: FeedItem, type: 'up' | 'down', reason?: string) => {
    const current = feedbackMap.get(item.id)
    if (current === type) {
      toast.info('已反馈过')
      return
    }
    feedbackMutation.mutate({ targetType: 'item', targetId: item.id, feedback: type, reason })
    toast.success(type === 'up' ? '已标记"有用"' : '已标记"没用"')
  }

  const handleSave = (item: FeedItem) => {
    feedbackMutation.mutate({ targetType: 'item', targetId: item.id, feedback: 'save' })
    toast.success('已收藏')
  }

  const items = data?.items || []
  const total = data?.pagination.total || 0
  const totalPages = Math.ceil(total / 30)

  const categories = ['全部', '加密', '财经', '科技', '综合']

  const isRefreshing = refreshStatus?.status === 'running'

  // 功能2：解析 topItems
  const parseTopItems = (json: string): Array<{ title: string; summary?: string; url?: string }> => {
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">资讯</h1>
          <p className="text-sm text-muted-foreground">全网爬虫实时抓取 · AI 自动评分筛选</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isRefreshing}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted flex items-center gap-2 disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isRefreshing ? '抓取中...' : '抓取最新'}
          </button>
          <button
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted flex items-center gap-2"
          >
            {processMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
            AI 分析
          </button>
          <button
            onClick={() => setSourcesOpen(true)}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted flex items-center gap-2"
          >
            <Rss className="w-4 h-4" />
            订阅源
          </button>
        </div>
      </div>

      {refreshStatus && (
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            {refreshStatus.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            {refreshStatus.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {refreshStatus.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
            <span className="text-sm font-medium">
              {refreshStatus.status === 'running' && '正在抓取...'}
              {refreshStatus.status === 'done' && `抓取完成（共 ${refreshStatus.totalFetched} 条）`}
              {refreshStatus.status === 'failed' && '抓取失败'}
            </span>
            {refreshStatus.startedAt && (
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {refreshStatus.finishedAt
                  ? `${Math.round((refreshStatus.finishedAt - refreshStatus.startedAt) / 1000)} 秒`
                  : `${Math.round((Date.now() - refreshStatus.startedAt) / 1000)} 秒`}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {refreshStatus.categories.map((cat) => (
              <div key={cat.name} className="text-xs border rounded-lg p-2 bg-background">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{cat.name}</span>
                  {cat.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                  {cat.status === 'done' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  {cat.status === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
                  {cat.status === 'pending' && <Clock className="w-3 h-3 text-muted-foreground" />}
                </div>
                <div className="text-muted-foreground">
                  {cat.status === 'pending' && '等待中'}
                  {cat.status === 'running' && '抓取中...'}
                  {cat.status === 'done' && `${cat.fetched ?? 0} 条`}
                  {cat.status === 'failed' && '失败'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 功能2：今日简报卡片 */}
      {todayBrief && (
        <div className="border rounded-xl p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold">{todayBrief.title || `今日简报 · ${todayBrief.date}`}</h2>
            </div>
            <button
              onClick={() => setDigestDialogOpen(true)}
              className="px-2.5 py-1 text-xs border rounded-lg hover:bg-muted flex items-center gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              查看历史
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{todayBrief.overview}</p>
          <div className="space-y-2">
            {parseTopItems(todayBrief.topItems).slice(0, 3).map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  {t.url ? (
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{t.title}</a>
                  ) : (
                    <span className="font-medium">{t.title}</span>
                  )}
                  {t.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(1) }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full border transition-colors',
                category === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:bg-muted border-border'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索新闻..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">加载中...</span>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Newspaper className="w-8 h-8 text-destructive mb-2" />
          <p className="text-muted-foreground">加载失败，请重试</p>
        </div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground mb-2">
            共 {total} 条新闻
          </div>
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline truncate block">
                      {item.titleZh || item.title}
                    </a>
                    {item.summary && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-muted">{item.category}</span>
                      {item.aiScore > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Lightbulb className="w-3 h-3 text-yellow-500" />
                          {item.aiScore}
                        </span>
                      )}
                      {item.publishedAt && (
                        <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: zhCN })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleFeedback(item, 'up')}
                      className={cn(
                        'p-1.5 rounded hover:bg-muted transition-colors',
                        feedbackMap.get(item.id) === 'up' ? 'text-green-500' : 'text-muted-foreground'
                      )}
                      title="有用"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    {/* 功能3：👎 带原因选择器 */}
                    <Popover open={downvotePopoverId === item.id} onOpenChange={(open) => setDownvotePopoverId(open ? item.id : null)}>
                      <PopoverTrigger asChild>
                        <button
                          className={cn(
                            'p-1.5 rounded hover:bg-muted transition-colors',
                            feedbackMap.get(item.id) === 'down' ? 'text-red-500' : 'text-muted-foreground'
                          )}
                          title="没用"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-2">
                        <p className="text-xs text-muted-foreground mb-2 px-1">选择原因：</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['重复', '无关', '低质', '已知道'].map(reason => (
                            <button
                              key={reason}
                              onClick={() => {
                                handleFeedback(item, 'down', reason)
                                setDownvotePopoverId(null)
                              }}
                              className="px-2.5 py-1 text-xs rounded-full border hover:bg-muted transition-colors"
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button
                      onClick={() => handleSave(item)}
                      className={cn(
                        'p-1.5 rounded hover:bg-muted transition-colors',
                        feedbackMap.get(item.id) === 'save' ? 'text-blue-500' : 'text-muted-foreground'
                      )}
                      title="收藏"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* 功能1：订阅源管理 Sheet */}
      <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              订阅源管理
            </SheetTitle>
            <SheetDescription>管理新闻订阅源的启用状态，或添加新的订阅源。</SheetDescription>
          </SheetHeader>

          <div className="px-4 space-y-4 flex-1 overflow-y-auto">
            {/* 源列表 */}
            {sources ? (
              Object.entries(sourcesByCategory).map(([cat, catSources]) => (
                <div key={cat}>
                  <h3 className="text-sm font-semibold mb-2">{cat}</h3>
                  <div className="space-y-1.5">
                    {catSources.map(source => (
                      <div key={source.id} className="flex items-center gap-2 p-2 rounded-lg border bg-background text-sm">
                        <Switch
                          checked={source.enabled}
                          onCheckedChange={(checked) => handleSourceToggle(source, checked)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate">{source.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{source.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                        </div>
                        <button
                          onClick={() => deleteSourceMutation.mutate(source.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* 添加订阅源表单 */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                添加订阅源
              </h3>
              <div className="space-y-2">
                <Input
                  placeholder="名称"
                  value={newSource.name}
                  onChange={(e) => setNewSource(s => ({ ...s, name: e.target.value }))}
                />
                <Input
                  placeholder="URL"
                  value={newSource.url}
                  onChange={(e) => setNewSource(s => ({ ...s, url: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newSource.type} onValueChange={(v) => setNewSource(s => ({ ...s, type: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rss">RSS</SelectItem>
                      <SelectItem value="rsshub">RSSHub</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={newSource.category} onValueChange={(v) => setNewSource(s => ({ ...s, category: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="加密">加密</SelectItem>
                      <SelectItem value="财经">财经</SelectItem>
                      <SelectItem value="科技">科技</SelectItem>
                      <SelectItem value="综合">综合</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="语言 (如 en, zh)"
                  value={newSource.lang}
                  onChange={(e) => setNewSource(s => ({ ...s, lang: e.target.value }))}
                />
                <button
                  onClick={handleAddSource}
                  disabled={addSourceMutation.isPending}
                  className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addSourceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  添加
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 功能2：历史简报 Dialog */}
      <Dialog open={digestDialogOpen} onOpenChange={setDigestDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              历史简报
            </DialogTitle>
            <DialogDescription>浏览过往的每日资讯简报。</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            {digests && digests.length > 0 ? (
              digests.map(digest => {
                const topItems = parseTopItems(digest.topItems)
                const isExpanded = expandedDigestId === digest.id
                return (
                  <div key={digest.id} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedDigestId(isExpanded ? null : digest.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-xs text-muted-foreground">{digest.date}</span>
                        <p className="font-medium text-sm truncate">{digest.title}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {isExpanded ? '收起' : '展开'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t">
                        <p className="text-sm text-muted-foreground mt-2 mb-2">{digest.overview}</p>
                        <div className="space-y-1.5">
                          {topItems.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                              <div className="min-w-0">
                                {t.url ? (
                                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{t.title}</a>
                                ) : (
                                  <span className="font-medium">{t.title}</span>
                                )}
                                {t.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.summary}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                {digests ? '暂无历史简报' : <Loader2 className="w-5 h-5 animate-spin" />}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NewsPage
