import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  ListTodo,
  FileText,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  Calendar,
  Newspaper,
  Timer,
  BookHeart,
  Target,
  Flame,
  Check,
  TrendingUp,
  PartyPopper,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { tasksApi, notesApi, focusApi, habitsApi, journalApi, goalsApi, entertainmentApi, type Inspiration } from '@/lib/api'
import { STALE_TIME } from '@/lib/query'
import { newsApi } from '@/lib/api/news'
import { formatCST, parseStoredTime } from '@/lib/datetime'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageTitle } from '@/hooks/use-page-title'

interface NewsTopItem {
  title: string
  url: string
  summary: string
  reason?: string
  category?: string
}

export function DashboardPage() {
  usePageTitle('首页')
  const queries = useQueries({
    queries: [
      { queryKey: ['tasks', 'stats'], queryFn: tasksApi.stats, staleTime: STALE_TIME },
      { queryKey: ['tasks'], queryFn: tasksApi.list, staleTime: STALE_TIME },
      { queryKey: ['notes'], queryFn: notesApi.listSummary, staleTime: STALE_TIME },
      { queryKey: ['news', 'today'], queryFn: () => newsApi.today(), staleTime: 10 * 60 * 1000 },
      { queryKey: ['focus', 'stats'], queryFn: () => focusApi.stats(), staleTime: STALE_TIME },
      { queryKey: ['habits', 'dashboard'], queryFn: () => habitsApi.list(), staleTime: STALE_TIME },
      { queryKey: ['journal', 'today'], queryFn: () => journalApi.list({ date: new Date().toISOString().slice(0, 10) }), staleTime: STALE_TIME },
      { queryKey: ['journal', 'stats'], queryFn: () => journalApi.stats(), staleTime: STALE_TIME },
      { queryKey: ['goals', 'stats'], queryFn: () => goalsApi.stats(), staleTime: STALE_TIME },
      { queryKey: ['countdowns'], queryFn: () => goalsApi.countdowns.list(), staleTime: STALE_TIME },
      { queryKey: ['goals', 'list'], queryFn: () => goalsApi.list(), staleTime: STALE_TIME },
    ],
  })

  const [taskStatsQuery, allTasksQuery, notesQuery, todayNewsQuery, focusStatsQuery, habitsQuery, todayJournalQuery, journalStatsQuery, goalStatsQuery, countdownsQuery, allGoalsQuery] = queries

  const { data: taskStats, isLoading: taskStatsLoading, isError: taskStatsError } = taskStatsQuery
  const { data: allTasks = [], isLoading: recentTasksLoading } = allTasksQuery
  const { data: notes = [], isLoading: notesLoading, isError: notesError, refetch: refetchNotes } = notesQuery
  const { data: todayNews, isLoading: newsLoading, isError: newsError, refetch: refetchNews } = todayNewsQuery
  const { data: focusStatsData, isLoading: focusStatsLoading, isError: focusStatsError } = focusStatsQuery
  const { data: habitsData, isLoading: habitsLoading, isError: habitsError, refetch: refetchHabits } = habitsQuery
  const { data: todayJournal, isLoading: journalLoading, isError: journalError, refetch: refetchJournal } = todayJournalQuery
  const { data: journalStats, isLoading: journalStatsLoading, isError: journalStatsError } = journalStatsQuery
  const { data: goalStats, isLoading: goalStatsLoading, isError: goalStatsError } = goalStatsQuery
  const { data: countdowns = [], isLoading: countdownsLoading } = countdownsQuery
  const { data: allGoals = [], isLoading: goalsListLoading } = allGoalsQuery

  // 统一错误处理：任一查询出错时汇总
  const queryErrors = queries.filter((q) => q.isError).map((q) => q.error)
  if (queryErrors.length > 0) {
    console.warn('[DashboardPage] 部分查询加载失败:', queryErrors)
  }

  const [inspiration, setInspiration] = useState<Inspiration | null>(null)
  const { isFetching: inspFetching, refetch: fetchInspiration } = useQuery({
    queryKey: ['inspiration', 'daily-card'],
    queryFn: async () => {
      const result = await entertainmentApi.inspiration()
      setInspiration(result)
      return result
    },
    staleTime: 0,
    enabled: true,
  })

  const parsedTopItems = useMemo<NewsTopItem[]>(() => {
    if (!todayNews?.topItems) return []
    try {
      return JSON.parse(todayNews.topItems)
    } catch {
      return []
    }
  }, [todayNews])

  const stats = useMemo(() => {
    if (taskStats) {
      return {
        pendingTasks: taskStats.total - taskStats.completed,
        todayCompleted: taskStats.todayCompleted,
        overdue: taskStats.overdue,
      }
    }
    return { pendingTasks: 0, todayCompleted: 0, overdue: 0 }
  }, [taskStats])

  const recentTasks = useMemo(() => {
    return allTasks
      .filter((t) => !t.isCompleted)
      .sort(
        (a, b) =>
          (parseStoredTime(b.createdAt)?.getTime() ?? 0) -
          (parseStoredTime(a.createdAt)?.getTime() ?? 0),
      )
      .slice(0, 5)
  }, [allTasks])

  const recentNotes = useMemo(() => {
    return [...notes]
      .sort(
        (a, b) =>
          (parseStoredTime(b.updatedAt)?.getTime() ?? 0) -
          (parseStoredTime(a.updatedAt)?.getTime() ?? 0),
      )
      .slice(0, 5)
  }, [notes])

  const todayDoneCount = useMemo(() => {
    if (!habitsData) return 0
    return habitsData.filter((h) => h.doneToday).length
  }, [habitsData])

  const countdownList = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return countdowns
      .map((c) => {
        const target = new Date(c.date + 'T00:00:00')
        const diffTime = target.getTime() - today.getTime()
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
        return { ...c, diffDays }
      })
      .sort((a, b) => Math.abs(a.diffDays) - Math.abs(b.diffDays))
      .slice(0, 5)
  }, [countdowns])

  const activeGoals = useMemo(() => {
    return allGoals.filter((g) => g.status === 'active').slice(0, 5)
  }, [allGoals])

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return '早上好'
    if (hour < 18) return '下午好'
    return '晚上好'
  })()

  const todayFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const today = todayFormatter.format(new Date())

  return (
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-primary to-primary/80 md:size-10">
            <ListTodo className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">{greeting}，欢迎回来</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{today}</p>
          </div>
        </div>
        <div className="page-header-right">
          <Button asChild size="sm" className="h-8 gap-1.5 sm:h-9">
            <Link to="/tasks?new=1">
              <Plus className="size-3.5 sm:size-4" />
              新建任务
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 sm:h-9">
            <Link to="/notes">
              <Plus className="size-3.5 sm:size-4" />
              新建笔记
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 sm:h-9">
            <Link to="/knowledge">
              <Plus className="size-3.5 sm:size-4" />
              上传文件
            </Link>
          </Button>
        </div>
      </div>

      <div className="page-content-wide">
        {/* Stats cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 stagger-container">
        <Card premium className="stagger-item hover-lift">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">待办任务</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 sm:size-8">
              <ListTodo className="size-3.5 text-blue-500 sm:size-4" />
            </div>
          </CardHeader>
          <CardContent>
            {taskStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : taskStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl">{stats.pendingTasks}</div>
                <p className="text-xs text-muted-foreground">今日完成 {stats.todayCompleted} 个</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="stagger-item hover-lift">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">逾期任务</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 sm:size-8">
              <Clock className="size-3.5 text-amber-500 sm:size-4" />
            </div>
          </CardHeader>
          <CardContent>
            {taskStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-20" />
              </div>
            ) : taskStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl">{stats.overdue}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.overdue === 0 ? '全部按时' : '需要关注'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="stagger-item hover-lift">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">今日专注</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 sm:size-8">
              <Timer className="size-3.5 text-emerald-500 sm:size-4" />
            </div>
          </CardHeader>
          <CardContent>
            {focusStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ) : focusStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl">{focusStatsData?.todayMinutes ?? 0} 分钟</div>
                <p className="text-xs text-muted-foreground">{focusStatsData?.todayCount ?? 0} 个番茄钟</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="stagger-item hover-lift">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">习惯打卡</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-orange-500/10 sm:size-8">
              <Flame className="size-3.5 text-orange-500 sm:size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{todayDoneCount}/{habitsData?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">今日已完成</p>
          </CardContent>
        </Card>
      </div>

      {/* Second row: goals + journal + focus weekly */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-container">
        {/* Goals progress */}
        <Card premium className="stagger-item">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">目标进度</CardTitle>
            <Target className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {goalStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-32" />
              </div>
            ) : goalStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : goalStats ? (
              <>
                <div className="text-2xl font-bold">{goalStats.active}</div>
                <p className="text-xs text-muted-foreground">
                  进行中 · 已完成 {goalStats.done} 个
                  {goalStats.archived > 0 && ` · 已归档 ${goalStats.archived} 个`}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">暂无目标数据</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Journal streak */}
        <Card premium className="stagger-item">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">日记</CardTitle>
            <BookHeart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {journalStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
            ) : journalStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : journalStats ? (
              <>
                <div className="text-2xl font-bold">
                  {journalStats.streak > 0 ? `${journalStats.streak} 天` : '-'}
                </div>
                <p className="text-xs text-muted-foreground">
                  连续日记 · 本周 {journalStats.thisWeek} 篇
                  {journalStats.total > 0 && ` · 共 ${journalStats.total} 篇`}
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">暂无日记</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Focus weekly trend */}
        <Card premium className="stagger-item">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本周专注</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {focusStatsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-20" />
                <div className="mt-2 flex items-end gap-1">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="flex-1" style={{ height: `${20 + Math.random() * 20}px` }} />
                  ))}
                </div>
              </div>
            ) : focusStatsError ? (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                加载失败
              </div>
            ) : focusStatsData?.weekly ? (
              <>
                <div className="text-2xl font-bold">
                  {focusStatsData.weekly.reduce((s, d) => s + d.minutes, 0)} 分钟
                </div>
                <div className="mt-2 flex items-end gap-1">
                  {focusStatsData.weekly.map((day, i) => {
                    const maxMin = Math.max(...focusStatsData.weekly.map((d) => d.minutes), 1)
                    const height = Math.max((day.minutes / maxMin) * 40, day.minutes > 0 ? 6 : 2)
                    return (
                      <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                        <div
                          className="w-full rounded-sm bg-primary/60 transition-all"
                          style={{ height: `${height}px` }}
                          title={`${day.date}: ${day.minutes}分钟`}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          {['日', '一', '二', '三', '四', '五', '六'][
                            new Date(day.date + 'T00:00:00').getDay()
                          ]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground">暂无专注数据</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content grid */}
      <div className="grid gap-4 lg:grid-cols-2 stagger-container">
        {/* Recent tasks */}
        <Card premium className="stagger-item">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">待办任务</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/tasks">
                查看全部
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentTasksLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                    <Skeleton className="size-8 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无待办任务</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks?selected=${task.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <ListTodo className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{task.title}</p>
                      {task.dueDate && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {formatCST(task.dueDate, 'compactDate')}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent notes */}
        <Card premium className="stagger-item">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">最近笔记</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/notes">
                查看全部
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {notesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                    <Skeleton className="size-8 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notesError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-destructive">笔记加载失败</p>
                <Button size="sm" variant="outline" onClick={() => refetchNotes()} className="mt-2">
                  重试
                </Button>
              </div>
            ) : recentNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无笔记</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentNotes.map((note) => (
                  <Link
                    key={note.id}
                    to={`/notes/${note.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{note.title}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {formatCST(note.updatedAt, 'compact')}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 目标进度仪表盘 + 每日能量补给 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 stagger-container">
        {/* 目标进度仪表盘 */}
        {activeGoals.length > 0 ? (
          <Card premium className="stagger-item">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">目标进度仪表盘</CardTitle>
              <Target className="size-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              {goalsListLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                      <Skeleton className="size-8 shrink-0 rounded-lg" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeGoals.map((goal) => (
                    <div key={goal.id} className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
                        <Target className="size-4 text-rose-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{goal.title}</p>
                        {goal.targetValue != null && goal.currentValue != null ? (
                          <div className="mt-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {goal.currentValue}
                                {goal.unit || ''}
                              </span>
                              <span>
                                {goal.targetValue}
                                {goal.unit || ''}
                              </span>
                            </div>
                            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-rose-500 transition-all"
                                style={{
                                  width: `${Math.min((goal.currentValue / goal.targetValue) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground">
                            {goal.description || '描述性目标'}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* 每日能量补给 */}
        {inspiration ? (
          <Card premium className="stagger-item">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">每日能量补给</CardTitle>
              <Sparkles className="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="rounded-lg border-l-4 border-amber-500 bg-amber-500/5 p-4">
                  <p className="text-sm leading-relaxed text-foreground/90">
                    &ldquo;{inspiration.content}&rdquo;
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                    {inspiration.category}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fetchInspiration()}
                    disabled={inspFetching}
                  >
                    {inspFetching ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                    换一条
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Habits streak */}
      {habitsLoading ? (
        <Card premium className="mt-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : habitsError ? (
        <Card premium className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-destructive">习惯数据加载失败</p>
            <Button size="sm" variant="outline" onClick={() => refetchHabits()} className="mt-2">
              重试
            </Button>
          </CardContent>
        </Card>
      ) : habitsData && habitsData.length > 0 ? (
        <Card premium className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Flame className="size-5 text-orange-500" />
              习惯打卡
              <span className="text-xs font-normal text-muted-foreground">
                {todayDoneCount}/{habitsData.length} 已打卡
              </span>
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/habits">
                查看全部
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {habitsData.slice(0, 4).map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
                  <span className="text-lg">{h.icon || '📌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{h.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      连续 {h.streak} 天 · 共 {h.total} 天
                    </p>
                  </div>
                  {h.doneToday && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <Check className="size-3 text-emerald-500" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <Flame className="mb-2 size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">还没有习惯打卡</p>
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to="/habits">去创建一个</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Today's news digest */}
      {newsLoading ? (
        <Card premium className="mt-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-3 h-4 w-full" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : newsError ? (
        <Card premium className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-destructive">新闻加载失败</p>
            <Button size="sm" variant="outline" onClick={() => refetchNews()} className="mt-2">
              重试
            </Button>
          </CardContent>
        </Card>
      ) : todayNews ? (
        <Card premium className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Newspaper className="size-5" />
              今日简报
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/news">
                查看全部
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{todayNews.overview}</p>
            {parsedTopItems.length > 0 && (
              <div className="mt-3 space-y-2">
                {parsedTopItems.slice(0, 3).map((item, idx) => (
                  <a
                    key={idx}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Newspaper className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{item.summary}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card premium className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <Newspaper className="mb-2 size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">今日暂未生成简报</p>
            <p className="text-xs text-muted-foreground/60 mt-1">每日会自动获取新闻摘要</p>
          </CardContent>
        </Card>
      )}

      {/* Today's mood */}
      {journalLoading ? (
        <Card premium className="mb-6">
          <CardContent className="p-4 flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </CardContent>
        </Card>
      ) : journalError ? (
        <Card premium className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-destructive">日记加载失败</p>
            <Button size="sm" variant="outline" onClick={() => refetchJournal()} className="mt-2">
              重试
            </Button>
          </CardContent>
        </Card>
      ) : todayJournal && todayJournal.length > 0 ? (
        <Card premium className="mb-6">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <BookHeart className="size-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{todayJournal[0].title || '今日心情'}</p>
              <p className="line-clamp-1 text-xs text-muted-foreground">{todayJournal[0].content.slice(0, 100)}</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/journal">查看</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card premium className="mb-6">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
              <BookHeart className="size-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">今天还没有写日记</p>
              <p className="text-xs text-muted-foreground/60">记录今日的心情和思考</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/journal">去写一篇</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Countdowns */}
      {countdownsLoading ? (
        <Card premium className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="size-5 rounded bg-muted animate-pulse" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : countdownList.length > 0 ? (
        <Card premium className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <PartyPopper className="size-5 text-rose-500" />
              倒计时
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/goals">
                查看全部
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-container">
              {countdownList.map((c) => {
                const label = c.diffDays === 0 ? '今天' : c.diffDays > 0 ? `还有 ${c.diffDays} 天` : `已过 ${Math.abs(c.diffDays)} 天`
                const isUrgent = c.diffDays >= 0 && c.diffDays <= 7
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 stagger-item"
                  >
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: (c.color || '#6366f1') + '20' }}
                    >
                      <PartyPopper className="size-4" style={{ color: c.color || '#6366f1' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className={`text-xs ${isUrgent ? 'font-medium text-rose-500' : 'text-muted-foreground'}`}>
                        {label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick links */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/journal" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <BookHeart className="size-4 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium">写日记</p>
            <p className="text-xs text-muted-foreground">记录今日心情</p>
          </div>
        </Link>
        <Link to="/focus" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
            <Timer className="size-4 text-rose-500" />
          </div>
          <div>
            <p className="text-sm font-medium">专注模式</p>
            <p className="text-xs text-muted-foreground">开始番茄钟</p>
          </div>
        </Link>
        <Link to="/goals" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
            <Target className="size-4 text-violet-500" />
          </div>
          <div>
            <p className="text-sm font-medium">查看目标</p>
            <p className="text-xs text-muted-foreground">追踪进度</p>
          </div>
        </Link>
        <Link to="/habits" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Flame className="size-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm font-medium">习惯打卡</p>
            <p className="text-xs text-muted-foreground">保持好习惯</p>
          </div>
        </Link>
      </div>
      </div>
    </div>
  )
}