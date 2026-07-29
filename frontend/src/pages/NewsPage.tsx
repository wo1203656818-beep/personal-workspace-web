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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { toast } from 'sonner'

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

const newsApi = {
  list: (params: { category?: string; search?: string; page?: number; pageSize?: number }) =>
    api.get('news', { searchParams: params }).json<{ items: FeedItem[]; pagination: { page: number; pageSize: number; total: number } }>(),
  refresh: (category: string, offset = 0) => api.post(`news/refresh?category=${encodeURIComponent(category)}&offset=${offset}`).json<{ ok: boolean; fetched: number; errors?: string[]; sourceCount?: number; category?: string; hasMore?: boolean; nextOffset?: number; error?: string }>(),
  refreshStatus: () => api.get('news/refresh-status').json<{ status: RefreshStatus | null }>(),
  process: () => api.post('news/process', { json: { limit: 5 } }).json<{ ok: boolean; processed: number; failed: number }>(),
  feedback: (body: { targetType: 'item' | 'brief'; targetId: string; feedback: 'up' | 'down' | 'save'; reason?: string }) =>
    api.post('news/feedback', { json: body }).json<{ ok: boolean }>(),
  feedbackList: () => api.get('news/feedback').json<FeedbackRow[]>(),
}

function NewsPage() {
  const [category, setCategory] = useState<string>('全部')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus | null>(null)
  const queryClient = useQueryClient()

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

  const feedbackMap = new Map<string, string>()
  feedbackList?.forEach(f => {
    if (f.targetType === 'item') feedbackMap.set(f.targetId, f.feedback)
  })

  const handleFeedback = (item: FeedItem, type: 'up' | 'down') => {
    const current = feedbackMap.get(item.id)
    if (current === type) {
      toast.info('已反馈过')
      return
    }
    feedbackMutation.mutate({ targetType: 'item', targetId: item.id, feedback: type })
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
                    <button
                      onClick={() => handleFeedback(item, 'down')}
                      className={cn(
                        'p-1.5 rounded hover:bg-muted transition-colors',
                        feedbackMap.get(item.id) === 'down' ? 'text-red-500' : 'text-muted-foreground'
                      )}
                      title="没用"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
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
    </div>
  )
}

export default NewsPage