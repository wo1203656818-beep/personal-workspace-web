import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { Newspaper, Lightbulb, RefreshCw, Loader2, Rss, ArrowUp, List, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  newsApi,
  type NewsFeedItem,
  type NewsRefreshStatus,
  type NewsSource,
} from '@/lib/api/news'

import { RefreshProgressCard } from '@/components/news/RefreshProgressCard'
import { TodayBriefCard } from '@/components/news/TodayBriefCard'
import { NewsFilterBar } from '@/components/news/NewsFilterBar'
import { NewsItemList } from '@/components/news/NewsItemList'
import { SourcesSheet } from '@/components/news/SourcesSheet'
import { DigestDialog } from '@/components/news/DigestDialog'
import { usePageTitle } from '@/hooks/use-page-title'

function NewsPage() {
  usePageTitle('资讯')
  const [category, setCategory] = useState<string>('全部')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<string>('score')
  const [showSaved, setShowSaved] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<NewsRefreshStatus | null>(null)
  const queryClient = useQueryClient()
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [digestDialogOpen, setDigestDialogOpen] = useState(false)
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [compactView, setCompactView] = useState(() => localStorage.getItem('news-compact-view') === 'true')

  const READ_KEY = 'news-read-items'
  const getReadItems = (): Set<string> => {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'))
    } catch {
      return new Set()
    }
  }
  const [readItems, setReadItems] = useState<Set<string>>(getReadItems)

  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { data: dynamicCategories } = useQuery({
    queryKey: ['news', 'categories'],
    queryFn: newsApi.categories,
  })
  const categories = ['全部', ...(dynamicCategories || []), '收藏']

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['news', 'list', category, search, sort, showSaved],
    queryFn: ({ pageParam = 1 }) =>
      newsApi.list({
        category: category === '全部' || category === '收藏' ? undefined : category,
        search: search || undefined,
        page: pageParam,
        pageSize: 20,
        sort: sort || undefined,
        saved: showSaved ? '1' : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, pageSize, total } = lastPage.pagination
      return page * pageSize < total ? page + 1 : undefined
    },
  })

  const items = infiniteData?.pages.flatMap((p) => p.items) || []
  const total = infiniteData?.pages[0]?.pagination.total || 0

  const todayCount = items.filter((item) => {
    if (!item.publishedAt) return false
    const d = new Date(item.publishedAt)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const scrollSentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setShowScrollTop(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        if (!refreshMutation.isPending && !isRefreshing) {
          refreshMutation.mutate()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const scrollToTop = () => {
    scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const markAllAsRead = () => {
    const ids = items.map((i) => i.id)
    const newRead = new Set([...getReadItems(), ...ids])
    localStorage.setItem(READ_KEY, JSON.stringify([...newRead]))
    setReadItems(newRead)
    toast.success(`已标记 ${ids.length} 条为已读`)
  }

  const toggleRead = (id: string) => {
    const newRead = new Set(getReadItems())
    if (newRead.has(id)) {
      newRead.delete(id)
      toast.success('已标记为未读')
    } else {
      newRead.add(id)
    }
    localStorage.setItem(READ_KEY, JSON.stringify([...newRead]))
    setReadItems(newRead)
  }

  const unreadCount = items.filter((i) => !readItems.has(i.id)).length

  const { data: feedbackList } = useQuery({
    queryKey: ['news', 'feedback'],
    queryFn: newsApi.feedbackList,
  })

  const feedbackMutation = useMutation({
    mutationFn: newsApi.feedback,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['news', 'feedback'] }),
  })

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const cats = categories.filter((c) => c !== '全部' && c !== '收藏')
      const initialStatus: NewsRefreshStatus = {
        status: 'running',
        startedAt: Date.now(),
        totalFetched: 0,
        totalErrors: [],
        categories: cats.map((name) => ({ name, status: 'pending' as const })),
      }
      setRefreshStatus(initialStatus)

      const results: Array<{
        category: string
        fetched: number
        errors: string[]
        failed: boolean
      }> = []
      for (const cat of cats) {
        if (cat !== cats[0]) await new Promise((r) => setTimeout(r, 1500))
        setRefreshStatus((prev) =>
          prev
            ? {
                ...prev,
                categories: prev.categories.map((c) =>
                  c.name === cat ? { ...c, status: 'running' as const } : c,
                ),
              }
            : prev,
        )

        let catFetched = 0,
          catErrors: string[] = [],
          catFailed = false,
          offset = 0,
          consecutiveFailures = 0
        while (true) {
          let r: Awaited<ReturnType<typeof newsApi.refresh>> | null = null
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              r = await newsApi.refresh(cat, offset)
              break
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e)
              if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
              else {
                catErrors.push(`${cat}: ${msg}`)
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
              await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000))
            } else break
          } else {
            if (consecutiveFailures >= 2) {
              catFailed = true
              break
            }
            offset += 10
            await new Promise((r) => setTimeout(r, 2000))
          }
        }
        results.push({ category: cat, fetched: catFetched, errors: catErrors, failed: catFailed })
        setRefreshStatus((prev) =>
          prev
            ? {
                ...prev,
                totalFetched: prev.totalFetched + catFetched,
                totalErrors: [...prev.totalErrors, ...catErrors.slice(0, 3)],
                categories: prev.categories.map((c) =>
                  c.name === cat
                    ? {
                        ...c,
                        status: catFailed ? ('failed' as const) : ('done' as const),
                        fetched: catFetched,
                        errors: catErrors.slice(0, 3),
                      }
                    : c,
                ),
              }
            : prev,
        )
      }
      setRefreshStatus((prev) =>
        prev ? { ...prev, status: 'done', finishedAt: Date.now() } : prev,
      )
      return results
    },
    onSuccess: (results) => {
      const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
      const failedCount = results.filter((r) => r.failed).length
      toast.success(
        `抓取完成：${totalFetched} 条新闻${failedCount > 0 ? `，${failedCount} 个分类失败` : ''}`,
      )
      queryClient.invalidateQueries({ queryKey: ['news', 'list'] })
      setTimeout(() => setRefreshStatus(null), 10000)
    },
    onError: (e: Error) => {
      toast.error(`抓取失败: ${e.message}`)
      setRefreshStatus((prev) =>
        prev ? { ...prev, status: 'failed', finishedAt: Date.now() } : prev,
      )
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
        } catch {
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
      } else toast.info('没有待处理的新闻')
    },
    onError: (e: Error) => toast.error(`处理失败: ${e.message}`),
  })

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
    onError: (e: Error) => toast.error(`更新失败: ${e.message}`),
  })
  const addSourceMutation = useMutation({
    mutationFn: newsApi.addSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      toast.success('已添加')
    },
    onError: (e: Error) => toast.error(`添加失败: ${e.message}`),
  })
  const deleteSourceMutation = useMutation({
    mutationFn: newsApi.deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      toast.success('已删除')
    },
    onError: (e: Error) => toast.error(`删除失败: ${e.message}`),
  })
  const resetSourcesMutation = useMutation({
    mutationFn: newsApi.resetSources,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] })
      toast.success(`重置完成：删除 ${data.deleted} 条旧源，新增 ${data.inserted} 条精选源`)
    },
    onError: (e: Error) => toast.error(`重置失败: ${e.message}`),
  })

  const handleSourceToggle = (source: NewsSource, enabled: boolean) =>
    updateSourcesMutation.mutate([{ id: source.id, enabled }])

  const { data: todayBrief } = useQuery({ queryKey: ['news', 'today'], queryFn: newsApi.today })
  const { data: digests } = useQuery({
    queryKey: ['news', 'digests'],
    queryFn: newsApi.digests,
    enabled: digestDialogOpen,
  })

  const feedbackMap = new Map<string, string>()
  feedbackList?.forEach((f) => {
    if (f.targetType === 'item') feedbackMap.set(f.targetId, f.feedback)
  })

  const handleFeedback = (item: NewsFeedItem, type: 'up' | 'down', reason?: string) => {
    if (feedbackMap.get(item.id) === type) {
      toast.info('已反馈过')
      return
    }
    feedbackMutation.mutate({ targetType: 'item', targetId: item.id, feedback: type, reason })
    toast.success(type === 'up' ? '已标记"有用"' : '已标记"没用"')
  }
  const handleSave = (item: NewsFeedItem) => {
    feedbackMutation.mutate({ targetType: 'item', targetId: item.id, feedback: 'save' })
    toast.success('已收藏')
  }

  const isRefreshing = refreshStatus?.status === 'running'

  const handleCategoryClick = (cat: string) => {
    if (cat === '收藏') {
      setShowSaved(true)
      setCategory('全部')
    } else {
      setShowSaved(false)
      setCategory(cat)
    }
  }

  return (
    <div className="page-layout">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-blue-500 to-indigo-500 md:size-10">
            <Newspaper className="size-5" />
          </div>
          <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
                资讯
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 align-middle">
                    未读 {unreadCount}
                  </span>
                )}
                {todayCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 align-middle">
                    今日 {todayCount}
                  </span>
                )}
              </h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              全网爬虫实时抓取 · AI 自动评分筛选 · {total} 条
            </p>
          </div>
        </div>
        <div className="page-header-right">
          {/* 桌⾯端显示全部按钮 */}
          <div className="hidden md:flex md:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompactView((v) => {
                const next = !v
                localStorage.setItem('news-compact-view', String(next))
                return next
              })}
              className="h-8 gap-2 rounded-lg sm:h-9"
            >
              <List className="size-3.5 sm:size-4" />
              {compactView ? '详细' : '紧凑'}
            </Button>
            {items.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="h-8 gap-2 rounded-lg sm:h-9"
              >
                全部已读
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isRefreshing}
              className="h-8 rounded-lg sm:h-9"
            >
              {isRefreshing ? (
                <Loader2 className="size-3.5 animate-spin sm:size-4" />
              ) : (
                <RefreshCw className="size-3.5 sm:size-4" />
              )}
              {isRefreshing ? '抓取中...' : '抓取'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending}
              className="h-8 rounded-lg sm:h-9"
            >
              {processMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin sm:size-4" />
              ) : (
                <Lightbulb className="size-3.5 sm:size-4" />
              )}
              AI 分析
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSourcesOpen(true)} className="h-8 gap-1 rounded-lg sm:h-9">
              <Rss className="size-3.5 sm:size-4" /> 订阅源
            </Button>
          </div>
          {/* 移动端：只保留核心操作，其余折叠到更多菜单 */}
          <div className="flex md:hidden gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isRefreshing}
              className="h-8 gap-1 rounded-lg sm:h-9"
            >
              {isRefreshing ? (
                <Loader2 className="size-3.5 animate-spin sm:size-4" />
              ) : (
                <RefreshCw className="size-3.5 sm:size-4" />
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg px-2 sm:h-9">
                  <MoreHorizontal className="size-3.5 sm:size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => {
                  setCompactView((v) => {
                    const next = !v
                    localStorage.setItem('news-compact-view', String(next))
                    return next
                  })
                }}>
                  <List className="w-4 h-4" />
                  {compactView ? '详细视图' : '紧凑视图'}
                </DropdownMenuItem>
                {items.length > 0 && (
                  <DropdownMenuItem onClick={markAllAsRead}>
                    全部已读
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => processMutation.mutate()} disabled={processMutation.isPending}>
                  <Lightbulb className="w-4 h-4" />
                  AI 分析
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSourcesOpen(true)}>
                  <Rss className="w-4 h-4" />
                  订阅源
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="page-content-wide">

      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-4 p-4 md:p-6">
          <div ref={scrollSentinelRef} />
          {refreshStatus && <RefreshProgressCard refreshStatus={refreshStatus} />}

          {todayBrief && (
            <TodayBriefCard
              todayBrief={todayBrief}
              onOpenDigest={() => setDigestDialogOpen(true)}
            />
          )}

          <NewsFilterBar
            categories={categories}
            category={category}
            showSaved={showSaved}
            sort={sort}
            search={search}
            onCategoryClick={handleCategoryClick}
            onSortChange={setSort}
            onSearchChange={setSearch}
          />

          <NewsItemList
            items={items}
            isLoading={isLoading}
            isError={isError}
            showSaved={showSaved}
            total={total}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            loadMoreRef={loadMoreRef}
            expandedItemId={expandedItemId}
            onExpandItem={setExpandedItemId}
            feedbackMap={feedbackMap}
            onFeedback={handleFeedback}
            onSave={handleSave}
            compactView={compactView}
            readItems={readItems}
            onToggleRead={toggleRead}
          />
        </div>
      </ScrollArea>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-6 z-50 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-6"
          title="返回顶部"
        >
          <ArrowUp className="size-5" />
        </button>
      )}

      <SourcesSheet
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        sources={sources}
        onToggle={handleSourceToggle}
        onAdd={(body) => addSourceMutation.mutate(body)}
        onDelete={(id) => deleteSourceMutation.mutate(id)}
        onReset={() => resetSourcesMutation.mutate()}
        isResetting={resetSourcesMutation.isPending}
        isAdding={addSourceMutation.isPending}
      />

      <DigestDialog
        open={digestDialogOpen}
        onOpenChange={setDigestDialogOpen}
        digests={digests}
        expandedDigestId={expandedDigestId}
        onToggleDigest={(id) => setExpandedDigestId(expandedDigestId === id ? null : id)}
      />
      </div>
    </div>
  )
}

export default NewsPage
