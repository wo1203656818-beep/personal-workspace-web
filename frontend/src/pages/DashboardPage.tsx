import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ListTodo, FileText, BookOpen, CheckCircle2, Clock, Star,
  Plus, ArrowRight, Calendar, Newspaper,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, tasksApi, notesApi, kbApi, taskListsApi, settingsApi, imaApi, type NoteSummary, type KbSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatCST, parseStoredTime } from '@/lib/datetime'

interface NewsTopItem {
  title: string
  url: string
  summary: string
  reason?: string
  category?: string
}

interface TodayNews {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string
}

export function DashboardPage() {
  const { data: lists = [] } = useQuery({
    queryKey: ['taskLists'],
    queryFn: taskListsApi.list,
    staleTime: 2 * 60 * 1000,
  })

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
    staleTime: 2 * 60 * 1000,
  })

  const { data: notes = [] } = useQuery<NoteSummary[]>({
    queryKey: ['notes'],
    queryFn: notesApi.listSummary,
    staleTime: 2 * 60 * 1000,
  })

  const { data: kbDocs = [] } = useQuery<KbSummary[]>({
    queryKey: ['kbDocs'],
    queryFn: kbApi.listSummary,
    staleTime: 2 * 60 * 1000,
  })

  // Sync status
  const { data: msTodoStatus } = useQuery({
    queryKey: ['msTodoStatus'],
    queryFn: settingsApi.msTodoStatus,
    refetchInterval: 60000,
    staleTime: 60 * 1000,
  })

  const { data: imaStatus } = useQuery({
    queryKey: ['imaStatus'],
    queryFn: imaApi.status,
    refetchInterval: 60000,
    staleTime: 60 * 1000,
  })

  const { data: todayNews } = useQuery<TodayNews | null>({
    queryKey: ['news', 'today'],
    queryFn: () => api.get('news/today').json<TodayNews | null>(),
    staleTime: 10 * 60 * 1000,
  })

  const parsedTopItems = useMemo<NewsTopItem[]>(() => {
    if (!todayNews?.topItems) return []
    try {
      return JSON.parse(todayNews.topItems)
    } catch {
      return []
    }
  }, [todayNews])

  // Stats
  const stats = useMemo(() => {
    const totalTasks = allTasks.length
    const completedTasks = allTasks.filter((t) => t.isCompleted).length
    const pendingTasks = totalTasks - completedTasks
    const importantTasks = allTasks.filter((t) => t.isImportant && !t.isCompleted).length
    return { totalTasks, completedTasks, pendingTasks, importantTasks }
  }, [allTasks])

  // Recent tasks (top 5 pending)
  const recentTasks = useMemo(() => {
    return allTasks
      .filter((t) => !t.isCompleted)
      .sort((a, b) => (parseStoredTime(b.createdAt)?.getTime() ?? 0) - (parseStoredTime(a.createdAt)?.getTime() ?? 0))
      .slice(0, 5)
  }, [allTasks])

  // Recent notes (top 5)
  const recentNotes = useMemo(() => {
    return [...notes]
      .sort((a, b) => (parseStoredTime(b.updatedAt)?.getTime() ?? 0) - (parseStoredTime(a.updatedAt)?.getTime() ?? 0))
      .slice(0, 5)
  }, [notes])

  const todayFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const today = todayFormatter.format(new Date())

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">欢迎回来</h1>
        <p className="text-sm text-muted-foreground">{today}</p>
      </div>

      {/* Quick actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/tasks/myday">
            <Plus className="mr-1.5 size-4" />
            新建任务
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/notes">
            <Plus className="mr-1.5 size-4" />
            新建笔记
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/knowledge">
            <Plus className="mr-1.5 size-4" />
            上传文件
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">待办任务</CardTitle>
            <ListTodo className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingTasks}</div>
            <p className="text-xs text-muted-foreground">
              共 {stats.totalTasks} 个任务
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今日完成</CardTitle>
            <CheckCircle2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedTasks}</div>
            <p className="text-xs text-muted-foreground">
              完成率 {stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">笔记总数</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notes.length}</div>
            <p className="text-xs text-muted-foreground">
              最近更新 {recentNotes.length > 0 ? formatCST(recentNotes[0].updatedAt, 'compactDate') : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">知识库文件</CardTitle>
            <BookOpen className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kbDocs.length}</div>
            <p className="text-xs text-muted-foreground">
              支持多种格式
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sync status bar */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border bg-card/50 px-4 py-2.5 text-sm backdrop-blur-sm">
        <span className="text-xs font-medium text-muted-foreground">同步状态</span>
        <div className="flex items-center gap-1.5">
          <div className={cn('size-2 rounded-full', msTodoStatus?.authorized ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
          <span className="text-xs">MS Todo</span>
          {msTodoStatus?.lastSync && (
            <span className="text-xs text-muted-foreground">
              {formatCST(msTodoStatus.lastSync, 'compact')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn('size-2 rounded-full', imaStatus?.authorized ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
          <span className="text-xs">IMA</span>
          {imaStatus?.lastSync && (
            <span className="text-xs text-muted-foreground">
              {formatCST(imaStatus.lastSync, 'compact')}
            </span>
          )}
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent tasks */}
        <Card>
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
            {recentTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">暂无待办任务</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/list/${task.listId}?selected=${task.id}`}
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
                    {task.isImportant && (
                      <Star className="size-4 shrink-0 fill-yellow-500 text-yellow-500" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent notes */}
        <Card>
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
            {recentNotes.length === 0 ? (
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

      {/* Today's news digest */}
      <Card className="mt-4">
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
          {!todayNews ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Newspaper className="mb-2 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">今日简报尚未生成</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{todayNews.overview}</p>
              {parsedTopItems.length > 0 && (
                <div className="space-y-2">
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task lists overview */}
      {lists.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">任务列表</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to="/tasks">
                管理列表
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map((list) => {
                const listTasks = allTasks.filter((t) => t.listId === list.id)
                const pendingCount = listTasks.filter((t) => !t.isCompleted).length
                return (
                  <Link
                    key={list.id}
                    to={`/tasks/list/${list.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ListTodo className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-1 text-sm font-medium">{list.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {pendingCount} 个待办
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {pendingCount}
                    </Badge>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
