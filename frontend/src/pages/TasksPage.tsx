import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useUndo } from '@/lib/use-undo'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvided } from '@hello-pangea/dnd'
import { Sun, Star, CalendarClock, ListTodo, Plus, Sparkles, X, Calendar, Trash2, Search, ChevronDown, ChevronUp, ChevronRight, Bell, CheckSquare, FileText, RefreshCw, CheckCircle2, AlertCircle, ListChecks, type LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { toast } from 'sonner'
import { tasksApi, subtasksApi, aiApi, taskListsApi, settingsApi, type Task, type TaskList, type Subtask } from '@/lib/api'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { parseStoredTime, formatCST } from '@/lib/datetime'
import { PageSkeleton } from '@/components/PageSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSwipeGesture } from '@/hooks/use-swipe-gesture'

const viewConfig: Record<string, { title: string; icon: LucideIcon; color: string; iconBg: string; tabActiveClass: string }> = {
  all: { title: '所有任务', icon: ListChecks, color: 'text-emerald-500', iconBg: 'bg-gradient-to-br from-emerald-500 to-green-400', tabActiveClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  myday: { title: '我的一天', icon: Sun, color: 'text-blue-500', iconBg: 'bg-gradient-to-br from-blue-500 to-blue-400', tabActiveClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  important: { title: '重要', icon: Star, color: 'text-yellow-500', iconBg: 'bg-gradient-to-br from-yellow-400 to-amber-400', tabActiveClass: 'bg-yellow-400/15 text-yellow-600 dark:text-yellow-400' },
  planned: { title: '已计划', icon: CalendarClock, color: 'text-purple-500', iconBg: 'bg-gradient-to-br from-purple-500 to-violet-400', tabActiveClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  lists: { title: '列表', icon: ListTodo, color: 'text-muted-foreground', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-300', tabActiveClass: 'bg-muted text-foreground' },
  search: { title: '搜索结果', icon: Search, color: 'text-muted-foreground', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-300', tabActiveClass: 'bg-muted text-foreground' },
}

// 将 ISO 时间字符串转为 datetime-local input 所需格式 (yyyy-MM-ddTHH:mm)
// 使用北京时间格式化，不受浏览器时区影响
function toDatetimeLocal(iso: string) {
  const d = parseStoredTime(iso)
  if (!d) return ''
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function TasksPage() {
  const { view, listId } = useParams<{ view: string; listId: string }>()
  const [searchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') || ''
  const queryClient = useQueryClient()
  const { push: pushUndo } = useUndo()
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [createListOpen, setCreateListOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  // 自然语言添加任务（一句话录入）
  const [nlOpen, setNlOpen] = useState(false)
  const [nlText, setNlText] = useState('')
  const [nlParsed, setNlParsed] = useState<{ title: string; dueDate: string | null; listName: string | null; note: string | null; listId: string | null } | null>(null)
  // 新建任务时目标列表选择（空则用当前列表视图或第一个列表）
  const [newTaskListId, setNewTaskListId] = useState<string>('')
  const [digestExpanded, setDigestExpanded] = useState(true)
  const [suggestedList, setSuggestedList] = useState<{ listId: string; listName: string } | null>(null)
  const pendingDeleteRef = useRef<Task | null>(null)
  const newTaskInputRef = useRef<HTMLInputElement>(null)

  // MS Todo 手动同步（就近反馈）
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), [])

  const syncMsTodoMutation = useMutation({
    mutationFn: () => settingsApi.msTodoSync(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      const msg = data.ok
        ? `同步完成${data?.synced != null ? ` · ${data.synced} 条` : ''}`
        : `同步失败${data?.error ? `: ${data.error}` : ''}`
      setSyncFeedback({ type: data.ok ? 'success' : 'error', message: msg })
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setSyncFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setSyncFeedback({ type: 'error', message: `同步失败: ${err.message}` })
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setSyncFeedback(null), 3000)
    },
  })

  // B11: 读取 ?new=1 参数自动聚焦新建输入框
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      newTaskInputRef.current?.focus()
    }
  }, [searchParams])

  // P0-2: 全局快捷键 N 新建任务
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault()
          newTaskInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setTimeout(() => newTaskInputRef.current?.focus(), 300)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 判断当前视图
  const isListView = view === 'list' && listId && listId !== 'all'
  const isSearchView = view === 'search'
  const isListsOverview = view === 'lists'
  const currentView = isListView ? 'list' : (view || 'lists')

  // 获取任务列表
  const queryKey = useMemo(() => {
    if (isSearchView) return ['tasks', 'search', searchQuery]
    if (currentView === 'all') return ['tasks', 'all']
    if (currentView === 'myday') return ['tasks', 'myday']
    if (currentView === 'important') return ['tasks', 'important']
    if (currentView === 'planned') return ['tasks', 'planned']
    if (isListsOverview) return ['tasks', 'all']
    if (isListView) return ['tasks', 'list', listId]
    return ['tasks', 'myday']
  }, [currentView, isListView, isListsOverview, listId, isSearchView, searchQuery])

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey,
    queryFn: () => {
      if (isSearchView) return tasksApi.search(searchQuery)
      if (currentView === 'all') return tasksApi.list()
      if (currentView === 'myday') return tasksApi.myDay()
      if (currentView === 'important') return tasksApi.important()
      if (currentView === 'planned') return tasksApi.planned()
      if (isListsOverview) return tasksApi.list()
      if (isListView) return tasksApi.byList(listId!)
      return tasksApi.list()
    },
    staleTime: 2 * 60 * 1000,
  })

  // 获取任务列表名称 + 计数（列表总览时 listWithStats 避免前端扫全部任务算 badge）
  const { data: lists = [] } = useQuery({
    queryKey: isListsOverview ? ['taskLists', { stats: 1 }] : ['taskLists'],
    queryFn: isListsOverview ? taskListsApi.listWithStats : taskListsApi.list,
    staleTime: 2 * 60 * 1000,
  })

  // 每日简报（仅在我的一天视图拉取）
  const { data: digestData, isLoading: digestLoading } = useQuery<{ digest: string; cached?: boolean }>({
    queryKey: ['aiDigest'],
    queryFn: aiApi.digest,
    enabled: currentView === 'myday',
    staleTime: 60 * 60 * 1000, // 1 小时内不自动重新请求
  })
  const regenerateDigestMutation = useMutation({
    mutationFn: aiApi.digest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiDigest'] })
      toast.success('已重新生成简报')
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  // AI 优先级建议（仅我的一天视图）
  const { data: priorityData, isLoading: priorityLoading } = useQuery<{ suggestions: { taskId: string; reason: string }[]; cached?: boolean }>({
    queryKey: ['aiPriority'],
    queryFn: aiApi.prioritySuggestions,
    enabled: currentView === 'myday',
    staleTime: 60 * 60 * 1000,
  })
  const regeneratePriorityMutation = useMutation({
    mutationFn: aiApi.prioritySuggestions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiPriority'] })
      toast.success('已重新生成优先级建议')
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  // 自然语言解析任务
  const parseTaskMutation = useMutation({
    mutationFn: (text: string) => aiApi.parseTask(text),
    onSuccess: (d) => setNlParsed(d.task),
    onError: (e: Error) => toast.error('解析失败: ' + e.message),
  })

  // 从解析结果创建任务
  const createFromNlMutation = useMutation({
    mutationFn: async (task: NonNullable<typeof nlParsed>) => {
      const listId = task.listId || newTaskListId || lists[0]?.id
      if (!listId) throw new Error('没有可用的任务列表')
      await tasksApi.create({ listId, title: task.title, dueDate: task.dueDate ?? undefined, note: task.note ?? undefined })
    },
    onSuccess: () => {
      toast.success('已创建任务')
      setNlOpen(false)
      setNlText('')
      setNlParsed(null)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
    },
    onError: (e: Error) => toast.error('创建失败: ' + e.message),
  })

  // AI 列表推荐：根据输入标题自动建议目标列表
  const suggestListMutation = useMutation({
    mutationFn: (title: string) => aiApi.suggestList(title),
    onSuccess: (data) => {
      if (data.listId && data.listName) {
        setSuggestedList({ listId: data.listId, listName: data.listName })
      } else {
        setSuggestedList(null)
      }
    },
    onError: () => setSuggestedList(null),
  })

  // 输入标题变化时防抖请求列表推荐
  useEffect(() => {
    if (!newTaskTitle.trim() || lists.length === 0) {
      setSuggestedList(null)
      return
    }
    const timer = setTimeout(() => {
      if (newTaskTitle.trim().length >= 3) {
        suggestListMutation.mutate(newTaskTitle.trim())
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [newTaskTitle, lists.length])

  const currentList = lists.find(l => l.id === listId)
  const config = viewConfig[currentView]
  const pageTitle = isSearchView
    ? `搜索"${searchQuery}"`
    : isListView
      ? (currentList?.name || '任务')
      : (config?.title || '任务')
  const Icon = isSearchView ? Search : (config?.icon || ListTodo)

  // 列表总览：按列表分组
  const tasksByList = useMemo(() => {
    if (!isListsOverview) return null
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const arr = map.get(task.listId) || []
      arr.push(task)
      map.set(task.listId, arr)
    }
    const result: { listId: string; listName: string; tasks: Task[] }[] = []
    for (const list of lists) {
      const listTasks = map.get(list.id) || []
      result.push({ listId: list.id, listName: list.name, tasks: listTasks })
    }
    // 包含未匹配到列表的任务
    const knownIds = new Set(lists.map(l => l.id))
    const orphanTasks = tasks.filter(t => !knownIds.has(t.listId))
    if (orphanTasks.length > 0) {
      result.push({ listId: 'unknown', listName: '未分类', tasks: orphanTasks })
    }
    return result
  }, [isListsOverview, tasks, lists])

  // 创建列表
  const createListMutation = useMutation({
    mutationFn: (name: string) => taskListsApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setNewListName('')
      setCreateListOpen(false)
      toast.success('列表已创建')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  // 删除列表
  const deleteListMutation = useMutation({
    mutationFn: (listId: string) => taskListsApi.delete(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('列表已删除')
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // 创建任务（无列表时自动创建默认列表，名称与 MS To Do 默认列表 "Tasks" 一致以便同步匹配）
  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      // 优先级：用户手动选择 > 当前列表视图 > 第一个列表 > 新建默认列表
      let targetListId = newTaskListId || (isListView ? listId! : lists[0]?.id)
      if (!targetListId) {
        const list = await taskListsApi.create({ name: 'Tasks', color: '#2563EB' })
        targetListId = list.id
        queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      }
      const data: Partial<Task> = { listId: targetListId, title }
      // 按当前视图自动打标签，使新建任务立即出现在对应分类中
      if (currentView === 'myday') {
        data.isMyDay = true
        data.myDayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } else if (currentView === 'important') {
        data.isImportant = true
      } else if (currentView === 'planned') {
        data.dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      }
      return tasksApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setNewTaskTitle('')
      toast.success('任务已创建')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  // 更新任务（含勾选完成）。乐观更新：本地立即反映，成功后静默回源单条对齐即可。
  // 注意：禁止使用宽前缀 invalidateQueries(['tasks']) — 会同时重拉 all/myday/important/planned/list* 共 6+ 缓存。
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (t.id === id ? { ...t, ...data } : t))
      )
      return { prev }
    },
    onSuccess: (returnedTask, variables) => {
      // 子任务展示 / 详情页 单独刷新（列表有乐观更新兜底）
      queryClient.invalidateQueries({ queryKey: ['subtasks', variables.id], exact: true })
      // 用服务端返回值覆盖乐观数据，保证 updatedAt/lastSyncedAt 等字段准确
      if (returnedTask) {
        queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
          old?.map((t) => (t.id === variables.id ? { ...t, ...returnedTask } : t))
        )
        queryClient.setQueryData<Task>(['task', variables.id], returnedTask as any)
      }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) ctx.prev.forEach(([key, val]) => queryClient.setQueryData(key, val))
      toast.error(`更新失败`)
    },
  })

  // 删除任务（支持撤销恢复）
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 列表是摘要（不含 note 等大字段），先取完整任务再删除，避免撤销时丢失数据
      pendingDeleteRef.current = await tasksApi.get(id)
      return tasksApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setSelectedTaskId(null)
      const task = pendingDeleteRef.current
      if (task) {
        pushUndo({
          label: '任务已删除',
          undo: async () => {
            await tasksApi.create({
              listId: task.listId,
              title: task.title,
              note: task.note,
              isCompleted: task.isCompleted,
              isImportant: task.isImportant,
              isMyDay: task.isMyDay,
              myDayDate: task.myDayDate,
              dueDate: task.dueDate,
              reminder: task.reminder,
              recurrence: task.recurrence,
              sortOrder: task.sortOrder,
            })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast.success('已撤销删除')
          },
        })
      }
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // 展开/收起子任务
  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  // 按完成状态分组
  const activeTasks = useMemo(() => tasks.filter((t: Task) => !t.isCompleted), [tasks])
  const completedTasks = useMemo(() => tasks.filter((t: Task) => t.isCompleted), [tasks])

  // 任务批量重排（drag 结束后 1 次请求代替 N 次单条 PUT）
  const reorderMutation = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => tasksApi.reorder(orders),
    onMutate: async (orders) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      const map = new Map(orders.map(o => [o.id, o.sortOrder]))
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (map.has(t.id) ? { ...t, sortOrder: map.get(t.id)! } : t))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if ((ctx as any)?.prev) (ctx as any).prev.forEach(([key, val]: any) => queryClient.setQueryData(key, val))
      toast.error(`排序失败`)
    },
  })

  // 拖拽排序（仅活跃任务）— 批量重排 1 次 roundtrip，避免 N 次乐观更新互相覆盖导致"混乱"
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const items = Array.from(activeTasks)
    const [reordered] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reordered)
    const orders = items
      .map((item, idx) => ({ id: item.id, sortOrder: idx }))
      .filter((o, i) => items[i].sortOrder !== o.sortOrder)
    if (orders.length > 0) reorderMutation.mutate(orders)
  }

  const completedCount = completedTasks.length

  return (
    <div className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn('icon-badge size-9 md:size-10', isSearchView || isListView ? 'bg-gradient-to-br from-slate-400 to-slate-300' : config?.iconBg)}>
            <Icon className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              {completedCount}/{tasks.length} 已完成
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMsTodoMutation.mutate()}
              disabled={syncMsTodoMutation.isPending}
              className="gap-2 rounded-lg"
            >
              <RefreshCw className={`size-4 ${syncMsTodoMutation.isPending ? 'animate-spin' : ''}`} />
              同步 MS Todo
            </Button>
            {syncFeedback && (
              <div
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs',
                  syncFeedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}
                onClick={syncFeedback.type === 'error' ? () => syncMsTodoMutation.mutate() : undefined}
              >
                {syncFeedback.type === 'success' ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
                {syncFeedback.message}
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1 rounded-lg" onClick={() => setNlOpen(true)}>
              <Sparkles className="size-4" />
              AI 添加
            </Button>
            {isListsOverview && (
              <Button variant="outline" size="sm" className="gap-1 rounded-lg" onClick={() => setCreateListOpen(true)}>
                <Plus className="size-4" />
                新建列表
              </Button>
            )}
            {completedCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                <span className="text-xs text-muted-foreground sm:text-sm">显示已完成</span>
                <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
              </div>
            )}
          </div>
        </div>

        {/* 分类标签 */}
        {!isSearchView && !isListView && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ViewTab to="/tasks/all" icon={ListChecks} label="所有任务" active={currentView === 'all'} color="text-emerald-500" activeClass={viewConfig.all.tabActiveClass} />
            <ViewTab to="/tasks/lists" icon={ListTodo} label="列表" active={currentView === 'lists'} color="text-muted-foreground" activeClass={viewConfig.lists.tabActiveClass} />
            <ViewTab to="/tasks/myday" icon={Sun} label="我的一天" active={currentView === 'myday'} color="text-blue-500" activeClass={viewConfig.myday.tabActiveClass} />
            <ViewTab to="/tasks/important" icon={Star} label="重要" active={currentView === 'important'} color="text-yellow-500" activeClass={viewConfig.important.tabActiveClass} />
            <ViewTab to="/tasks/planned" icon={CalendarClock} label="已计划" active={currentView === 'planned'} color="text-purple-500" activeClass={viewConfig.planned.tabActiveClass} />
          </div>
        )}
      </div>

      {/* 添加任务（搜索/列表总览视图隐藏） */}
      {!isSearchView && !isListsOverview && (
        <div className="border-b px-4 py-3 md:px-6">
          <div className="surface-card flex flex-wrap items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-primary/20">
            <div className="ml-1 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </div>
            <Input
              ref={newTaskInputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTaskTitle.trim()) {
                  createMutation.mutate(newTaskTitle.trim())
                }
              }}
              placeholder="添加任务..."
              className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {/* 列表选择器：非列表视图下可选目标列表；列表视图下显示当前列表名 */}
            {lists.length > 0 && (
              <Select
                value={newTaskListId || (isListView ? listId! : lists[0]?.id || '')}
                onValueChange={(v) => {
                  setNewTaskListId(v)
                  setSuggestedList(null)
                }}
              >
                <SelectTrigger className="h-8 w-auto shrink-0 gap-1 rounded-lg border-none bg-muted/50 text-xs">
                  <ListTodo className="size-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* AI 列表推荐 */}
            {suggestedList && !isListView && (
              <button
                type="button"
                onClick={() => {
                  setNewTaskListId(suggestedList.listId)
                  setSuggestedList(null)
                }}
                className="mr-1 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              >
                <Sparkles className="size-3" />
                推荐：{suggestedList.listName}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-24 pt-2 md:px-4 md:pb-2">
          {/* 每日简报（仅我的一天视图） */}
          {currentView === 'myday' && (digestLoading || digestData?.digest) && (
            <div className="mb-3 rounded-2xl border bg-gradient-to-r from-blue-500/5 to-violet-500/5 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                  <Sparkles className="size-4" />
                  今日简报
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => regenerateDigestMutation.mutate()}
                    disabled={regenerateDigestMutation.isPending || digestLoading}
                    title="重新生成"
                  >
                    <RefreshCw className={`size-3.5 ${regenerateDigestMutation.isPending || digestLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setDigestExpanded(v => !v)}
                  >
                    {digestExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </Button>
                </div>
              </div>
              {digestExpanded && (
                <div className="mt-2">
                  {digestLoading && !digestData ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="size-3.5 animate-spin" /> 正在生成今日简报...
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground/90">{(digestData as { digest?: string } | undefined)?.digest}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI 优先级建议（仅我的一天视图） */}
          {currentView === 'myday' && (priorityLoading || (priorityData?.suggestions && priorityData.suggestions.length > 0)) && (
            <div className="mb-3 rounded-2xl border bg-gradient-to-r from-amber-500/5 to-orange-500/5 p-3 md:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Star className="size-4" />
                  AI 优先级建议
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => regeneratePriorityMutation.mutate()}
                  disabled={regeneratePriorityMutation.isPending || priorityLoading}
                  title="重新生成"
                >
                  <RefreshCw className={`size-3.5 ${regeneratePriorityMutation.isPending || priorityLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {priorityLoading && !priorityData ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <RefreshCw className="size-3.5 animate-spin" /> 正在分析任务优先级...
                  </div>
                ) : (
                  priorityData?.suggestions.map((s, idx) => {
                    const task = tasks.find(t => t.id === s.taskId)
                    if (!task) return null
                    return (
                      <div
                        key={s.taskId}
                        onClick={() => setSelectedTaskId(s.taskId)}
                        className="flex cursor-pointer items-start gap-2 rounded-xl bg-background/60 p-2 hover:bg-background"
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{s.reason}</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <PageSkeleton />
          ) : isListsOverview ? (
            <ListsOverview
              tasksByList={tasksByList}
              expandedTaskIds={expandedTaskIds}
              onToggleExpand={toggleExpand}
              onSelect={setSelectedTaskId}
              onToggleComplete={(id) => {
                const task = tasks.find(t => t.id === id)
                if (task) updateMutation.mutate({ id, data: { isCompleted: !task.isCompleted } })
              }}
              onDelete={setDeleteConfirmId}
              onDeleteList={(listId) => deleteListMutation.mutate(listId)}
              completingTaskId={updateMutation.isPending ? updateMutation.variables?.id : null}
            />
          ) : activeTasks.length === 0 && (!showCompleted || completedTasks.length === 0) ? (
            <EmptyState
              icon={Icon}
              title={isSearchView ? '未找到匹配的任务' : '暂无任务'}
              description={isSearchView ? '尝试更换关键词' : '在上方输入框添加第一个任务，开启高效的一天'}
            />
          ) : (
            <>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="tasks">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                      {activeTasks.map((task: Task, index: number) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(prov) => (
                            <TaskRow
                              task={task}
                              provided={prov}
                              isExpanded={expandedTaskIds.has(task.id)}
                              onToggleExpand={() => toggleExpand(task.id)}
                              onSelect={() => setSelectedTaskId(task.id)}
                              onToggleComplete={() =>
                                updateMutation.mutate({ id: task.id, data: { isCompleted: !task.isCompleted } })
                              }
                              onDelete={() => setDeleteConfirmId(task.id)}
                              isCompleting={updateMutation.isPending && updateMutation.variables?.id === task.id}
                            />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              {/* 已完成任务分组 */}
              {showCompleted && completedTasks.length > 0 && (
                <div className="mt-5 space-y-1">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      已完成 {completedTasks.length}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {completedTasks.map((task: Task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isExpanded={expandedTaskIds.has(task.id)}
                      onToggleExpand={() => toggleExpand(task.id)}
                      onSelect={() => setSelectedTaskId(task.id)}
                      onToggleComplete={() =>
                        updateMutation.mutate({ id: task.id, data: { isCompleted: !task.isCompleted } })
                      }
                      onDelete={() => setDeleteConfirmId(task.id)}
                      isCompleting={updateMutation.isPending && updateMutation.variables?.id === task.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* P0-2: 移动端 FAB 悬浮按钮 — 快速创建任务 */}
      {!isSearchView && !isListsOverview && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-40 size-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 md:hidden"
          onClick={() => {
            newTaskInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setTimeout(() => newTaskInputRef.current?.focus(), 300)
          }}
        >
          <Plus className="size-6" />
        </Button>
      )}

      {/* 任务详情弹窗 */}
      <TaskDetailDialog
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onDelete={(id) => setDeleteConfirmId(id)}
        lists={lists}
      />

      {/* C4: 删除确认对话框 */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除任务？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，任务及其子任务将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId)
                setDeleteConfirmId(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 新建列表弹窗 */}
      <Dialog open={createListOpen} onOpenChange={(open) => !open && setCreateListOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建列表</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newListName.trim()) {
                createListMutation.mutate(newListName.trim())
              }
            }}
            placeholder="列表名称"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateListOpen(false)}>取消</Button>
            <Button onClick={() => newListName.trim() && createListMutation.mutate(newListName.trim())}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 自然语言添加任务 */}
      <Dialog open={nlOpen} onOpenChange={(open) => { setNlOpen(open); if (!open) { setNlText(''); setNlParsed(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> 用一句话添加任务
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              placeholder="例如：明天下午3点提醒我给客户发方案，归类到工作"
              className="min-h-[80px]"
            />
            <Button onClick={() => parseTaskMutation.mutate(nlText)} disabled={parseTaskMutation.isPending || !nlText.trim()} className="gap-2">
              {parseTaskMutation.isPending ? '解析中...' : '解析'}
            </Button>

            {nlParsed && (
              <div className="rounded-xl bg-muted/30 p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">标题：</span>{nlParsed.title}</p>
                {nlParsed.dueDate && <p><span className="text-muted-foreground">时间：</span>{nlParsed.dueDate}</p>}
                {nlParsed.listName && <p><span className="text-muted-foreground">列表：</span>{nlParsed.listName}</p>}
                {nlParsed.note && <p><span className="text-muted-foreground">备注：</span>{nlParsed.note}</p>}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setNlOpen(false); setNlText(''); setNlParsed(null) }}>取消</Button>
            <Button onClick={() => createFromNlMutation.mutate(nlParsed!)} disabled={createFromNlMutation.isPending || !nlParsed}>
              {createFromNlMutation.isPending ? '创建中...' : '创建任务'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 任务列表项（支持拖拽 + 子任务展开）
function TaskRow({
  task,
  provided,
  isExpanded,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onDelete,
  isCompleting,
}: {
  task: Task
  provided?: DraggableProvided
  isExpanded: boolean
  onToggleExpand: () => void
  onSelect: () => void
  onToggleComplete: () => void
  onDelete: () => void
  isCompleting?: boolean
}) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const editInputRef = useRef<HTMLInputElement>(null)

  // P2-14: 移动端手势 — 左滑删除，右滑完成
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => onDelete(),
    onSwipeRight: () => onToggleComplete(),
    threshold: 80,
  })

  // 拉取子任务（用于显示数量 badge + 展开时渲染）。仅在展开时拉取，避免列表 N+1 并发请求。
  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ['subtasks', task.id],
    queryFn: () => subtasksApi.byTask(task.id),
    enabled: isExpanded,
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onSuccess: () => {
      // 子任务完成态会反向决定父任务是否完成
      queryClient.invalidateQueries({ queryKey: ['subtasks', task.id] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', task.id] })
    },
  })

  // 重命名任务（双击标题进入编辑）
  const renameMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err: Error) => toast.error(`重命名失败: ${err.message}`),
  })

  const commitRename = () => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== task.title) {
      renameMutation.mutate({ id: task.id, data: { title: trimmed } })
    } else {
      setEditTitle(task.title)
    }
    setIsEditing(false)
  }

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(task.title)
    setIsEditing(true)
    requestAnimationFrame(() => editInputRef.current?.focus())
  }

  // 逾期判断：dueDate 视为当天结束（北京时间 23:59:59）才算逾期，避免"今天到期"一早就显示红色
  const isOverdue = task.dueDate && !task.isCompleted && (() => {
    // 规范化日期为 yyyy-MM-dd
    const dateStr = task.dueDate.split('T')[0]
    // 当天结束 = 次日 00:00 UTC（因为 dateStr 无时区，按 UTC 解析）
    const dueEnd = new Date(`${dateStr}T23:59:59+08:00`)
    return dueEnd < new Date()
  })()

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* P2-14: 滑动操作提示 (CSS hover/focus 时显示) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 opacity-0 transition-opacity md:hidden">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">完成</span>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-4 opacity-0 transition-opacity md:hidden">
        <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive">删除</span>
      </div>
      <div
        ref={provided?.innerRef}
        {...(provided?.draggableProps ?? {})}
        {...(provided?.dragHandleProps ?? {})}
        {...swipeHandlers}
        className={cn(
          'group relative overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:bg-accent/30 hover:shadow-sm',
          task.isImportant && !task.isCompleted && 'before:content-[""] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:bg-yellow-400'
        )}
        onClick={onSelect}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <Checkbox
          checked={task.isCompleted}
          onCheckedChange={onToggleComplete}
          onClick={(e) => e.stopPropagation()}
          disabled={isCompleting}
        />
        {isEditing ? (
          <Input
            ref={editInputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setEditTitle(task.title)
                setIsEditing(false)
              }
            }}
            className="flex-1 h-7"
          />
        ) : (
          <span
            onDoubleClick={startEditing}
            className={cn('flex-1 transition-all duration-300 cursor-text', task.isCompleted && 'line-through opacity-60')}
            title="双击编辑标题"
          >
            {task.title}
          </span>
        )}
        {/* 子任务展开/收起按钮；有子任务时展示完成进度 x/y，避免 N+1 拉取再算进度 */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
        >
          {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {((task.subtaskCount ?? 0) > 0) && (
            (() => {
              const total = task.subtaskCount!
              const done = (task.completedSubtaskCount ?? 0)
              if (total === 1) return <span className="ml-0.5 text-xs tabular-nums">{total}</span>
              return <span className={cn('ml-0.5 text-xs tabular-nums', done === total && 'text-emerald-600 dark:text-emerald-400')}>{done}/{total}</span>
            })()
          )}
        </Button>
        {task.isImportant && <Star className="size-4 fill-yellow-400 text-yellow-400" />}
        {task.dueDate && (
          <Badge variant={isOverdue ? 'destructive' : 'secondary'} className="gap-1">
            <Calendar className="size-3" />
            {formatCST(task.dueDate, 'cnDate')}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {/* 展开的子任务列表 */}
      {isExpanded && (
        <div className="ml-8 space-y-0.5 pb-2">
          {subtasks.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">暂无子任务</p>
          ) : (
            subtasks.map((st: Subtask) => (
              <div key={st.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                <Checkbox
                  checked={st.isCompleted}
                  onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={toggleSubtaskMutation.isPending}
                />
                <span className={cn('flex-1 text-sm', st.isCompleted && 'line-through text-muted-foreground')}>
                  {st.title}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
    </div>
  )
}

// 分类标签
function ViewTab({
  to,
  icon: Icon,
  label,
  active,
  color,
  activeClass,
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  color: string
  activeClass: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
        active
          ? cn('shadow-sm', activeClass)
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className={cn('size-4', !active && color)} />
      {label}
    </Link>
  )
}

// 列表总览：按列表分组展示任务
function ListsOverview({
  tasksByList,
  expandedTaskIds,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onDelete,
  onDeleteList,
  completingTaskId,
}: {
  tasksByList: { listId: string; listName: string; tasks: Task[] }[] | null
  expandedTaskIds: Set<string>
  onToggleExpand: (taskId: string) => void
  onSelect: (taskId: string) => void
  onToggleComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteList: (listId: string) => void
  completingTaskId?: string | null
}) {
  if (!tasksByList || tasksByList.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="暂无任务列表"
        description="点击右上角「新建列表」开始整理任务"
      />
    )
  }

  return (
    <div className="space-y-4">
      {tasksByList.map(({ listId, listName, tasks }) => (
        <div key={listId} className="group/list rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center justify-between px-1">
            <Link
              to={listId === 'unknown' ? '/tasks/lists' : `/tasks/list/${listId}`}
              className="flex items-center gap-2 text-sm font-semibold hover:text-primary"
            >
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ListTodo className="size-3.5" />
              </div>
              {listName}
            </Link>
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tasks.length}</span>
              {listId !== 'unknown' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/list:opacity-100"
                      title="删除列表"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除列表「{listName}」？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作将删除该列表及其下所有任务{tasks.length > 0 ? `（共 ${tasks.length} 个任务）` : ''}，且无法恢复。若列表已同步到微软 To Do，也会从微软端删除。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => onDeleteList(listId)}
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {tasks.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">暂无任务</p>
            ) : (
              tasks.map((task: Task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isExpanded={expandedTaskIds.has(task.id)}
                  onToggleExpand={() => onToggleExpand(task.id)}
                  onSelect={() => onSelect(task.id)}
                  onToggleComplete={() => onToggleComplete(task.id)}
                  onDelete={() => onDelete(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// 任务详情弹窗（居中 Dialog，几何居中 + 一致模态语言）
function TaskDetailDialog({
  taskId,
  onClose,
  onDelete,
  lists = [],
}: {
  taskId: string | null
  onClose: () => void
  onDelete: (id: string) => void
  lists?: TaskList[]
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [newSubtask, setNewSubtask] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  // 子任务中途插入：非空时表示在 sortOrder=insertAtPosition 处插入
  const [insertAtPosition, setInsertAtPosition] = useState<number | null>(null)

  const { data: task } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
  })

  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ['subtasks', taskId],
    queryFn: () => subtasksApi.byTask(taskId!),
    enabled: !!taskId,
  })

  // 子任务排序
  const sortedSubtasks = useMemo(() => [...subtasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [subtasks])

  // 任务切换或备注变化时同步本地草稿
  useEffect(() => {
    if (task) setNoteDraft(task.note || '')
  }, [task?.id, task?.note])

  // 详情面板内的更新（含日期），需要同时刷新任务列表和详情
  const updateDetailMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      // 完成态变化会影响子任务展示
      if ('isCompleted' in variables.data) {
        queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      }
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  // 添加到我的一天 / 移出我的一天
  const myDayMutation = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      add ? tasksApi.addToMyDay(id) : tasksApi.removeFromMyDay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const addSubtaskMutation = useMutation({
    mutationFn: ({ title, sortOrder }: { title: string; sortOrder?: number }) => subtasksApi.create(taskId!, title, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      setNewSubtask('')
      setInsertAtPosition(null)
    },
    onError: (err: Error) => {
      toast.error(`添加子任务失败: ${err.message}`)
    },
  })

  const reorderSubtaskMutation = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => subtasksApi.reorder(orders),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
    onError: (err: Error) => toast.error(`排序失败: ${err.message}`),
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', taskId] })
      const prev = queryClient.getQueryData<Subtask[]>(['subtasks', taskId])
      queryClient.setQueryData<Subtask[]>(['subtasks', taskId], (old) =>
        old?.map((s) => (s.id === id ? { ...s, isCompleted: !s.isCompleted } : s))
      )
      return { prev }
    },
    onSuccess: () => {
      // 子任务完成态会反向决定父任务是否完成
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['subtasks', taskId], ctx.prev)
      toast.error(`更新子任务失败`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  // AI 拆解
  const aiBreakdownMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error('未选择任务')
      setAiLoading(true)
      const data = await aiApi.breakdown(task?.title || '', taskId)
      const validSubtasks = (data.subtasks || [])
        .filter((st: { title?: string }) => typeof st.title === 'string' && st.title.trim().length > 0)
        .filter((st: { title: string }) => st.title.trim().length <= 200)
        .slice(0, 10)
      if (validSubtasks.length === 0) throw new Error('AI 未返回有效子任务')
      // B9: 后端已直接创建子任务（返回含 id），前端只需刷新列表
      return { ...data, subtasks: validSubtasks }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setAiLoading(false)
      toast.success(`AI 已拆解 ${data.subtasks.length} 个子任务`)
    },
    onError: async (err: Error) => {
      setAiLoading(false)
      let detail = err.message
      if (err instanceof HTTPError) {
        try {
          const body = await err.response.json() as { error?: string; detail?: string }
          detail = body.detail || body.error || err.message
        } catch {
          // ignore
        }
      }
      toast.error(`AI 拆解失败: ${detail}`)
      console.error('[aiBreakdown]', err)
    },
  })

  if (!task) return null

  const dueDate = task.dueDate ? parseStoredTime(task.dueDate) ?? undefined : undefined
  const reminder = task.reminder ? parseStoredTime(task.reminder) ?? undefined : undefined

  const detailHeaderNode = (
    <div className="flex items-start gap-2 pr-1">
      <DialogTitle className="flex-1 text-lg leading-snug">{task.title}</DialogTitle>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 -mr-1"
        onClick={() =>
          updateDetailMutation.mutate({ id: taskId!, data: { isImportant: !task.isImportant } })
        }
      >
        <Star className={cn('size-4', task.isImportant && 'fill-yellow-400 text-yellow-400')} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={onClose}
        title="关闭"
      >
        <X className="size-4" />
        <span className="sr-only">关闭</span>
      </Button>
    </div>
  )

  const detailBody = (maxH: string) => (
    <ScrollArea className={cn('px-6 py-5', maxH)}>
        <div className="space-y-5">
          {/* 子任务 */}
          <div className="space-y-3 rounded-xl bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckSquare className="size-4" /> 子任务
            </div>
            <div className="space-y-0.5">
              {sortedSubtasks.map((st: Subtask, idx: number) => (
                <React.Fragment key={st.id}>
                  {/* 中途插入按钮 */}
                  <div className="flex justify-center">
                    {insertAtPosition === st.sortOrder + 0.5 ? (
                      <div className="flex w-full items-center gap-2 px-2 py-1">
                        <Plus className="size-3 text-primary shrink-0" />
                        <Input
                          value={newSubtask}
                          onChange={(e) => setNewSubtask(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newSubtask.trim()) {
                              addSubtaskMutation.mutate({ title: newSubtask.trim(), sortOrder: st.sortOrder + 0.5 })
                            }
                            if (e.key === 'Escape') { setInsertAtPosition(null); setNewSubtask('') }
                          }}
                          onBlur={() => { setInsertAtPosition(null); setNewSubtask('') }}
                          placeholder="输入子步骤..."
                          className="h-7 text-xs border-0 bg-background/60 rounded px-2 focus-visible:ring-1"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setInsertAtPosition(st.sortOrder + 0.5); setNewSubtask('') }}
                        className="flex items-center justify-center w-full rounded py-0.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors"
                        title="在此处插入子步骤"
                      >
                        <Plus className="size-3" />
                      </button>
                    )}
                  </div>
                  {/* 子任务行 */}
                  <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-accent">
                    <div className="flex flex-col items-center gap-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          const orders = sortedSubtasks.map((s, i) => ({ id: s.id, sortOrder: i === idx ? idx - 1 : i === idx - 1 ? idx : (s.sortOrder ?? i) }))
                          reorderSubtaskMutation.mutate(orders)
                        }}
                        className="size-3.5 flex items-center justify-center text-muted-foreground/30 hover:text-foreground disabled:opacity-0"
                      >
                        <ChevronUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === sortedSubtasks.length - 1}
                        onClick={() => {
                          const orders = sortedSubtasks.map((s, i) => ({ id: s.id, sortOrder: i === idx ? idx + 1 : i === idx + 1 ? idx : (s.sortOrder ?? i) }))
                          reorderSubtaskMutation.mutate(orders)
                        }}
                        className="size-3.5 flex items-center justify-center text-muted-foreground/30 hover:text-foreground disabled:opacity-0"
                      >
                        <ChevronDown className="size-3" />
                      </button>
                    </div>
                    <Checkbox
                      checked={st.isCompleted}
                      onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                      disabled={toggleSubtaskMutation.isPending}
                    />
                    <span className={cn('flex-1 text-sm truncate', st.isCompleted && 'line-through text-muted-foreground')}>
                      {st.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={() => deleteSubtaskMutation.mutate(st.id)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                </React.Fragment>
              ))}
              {subtasks.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">暂无子任务，点击 AI 拆解可自动生成</p>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Plus className="size-4 text-muted-foreground shrink-0" />
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubtask.trim()) {
                    if (insertAtPosition !== null) {
                      addSubtaskMutation.mutate({ title: newSubtask.trim(), sortOrder: insertAtPosition })
                    } else {
                      addSubtaskMutation.mutate({ title: newSubtask.trim() })
                    }
                  }
                }}
                placeholder="添加子步骤..."
                className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          {/* 日程 */}
          <div className="space-y-3 rounded-xl bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="size-4" /> 日程
            </div>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Calendar className="size-4" />
                  {dueDate ? format(dueDate, 'yyyy-MM-dd') : '设置截止日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker
                  mode="single"
                  selected={dueDate}
                  onSelect={(date) => {
                    if (date) {
                      updateDetailMutation.mutate({
                        id: task.id,
                        data: { dueDate: format(date, 'yyyy-MM-dd') },
                      })
                    }
                    setDatePickerOpen(false)
                  }}
                  locale={zhCN}
                />
                {dueDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      updateDetailMutation.mutate({ id: task.id, data: { dueDate: null } })
                      setDatePickerOpen(false)
                    }}
                  >
                    清除日期
                  </Button>
                )}
              </PopoverContent>
            </Popover>

            <Popover open={reminderPickerOpen} onOpenChange={setReminderPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Bell className="size-4" />
                  {reminder ? format(reminder, 'yyyy-MM-dd HH:mm') : '设置提醒'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <Input
                  type="datetime-local"
                  defaultValue={reminder ? toDatetimeLocal(task.reminder || '') : ''}
onBlur={(e) => {
	                    if (e.target.value) {
	                      const parts = e.target.value.split('T')
	                      if (parts.length === 2) {
	                        updateDetailMutation.mutate({
	                          id: task.id,
	                          data: { reminder: `${parts[0]}T${parts[1]}+08:00` },
	                        })
	                      }
	                    }
	                  }}
                />
                {reminder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => {
                      updateDetailMutation.mutate({ id: task.id, data: { reminder: null } })
                      setReminderPickerOpen(false)
                    }}
                  >
                    清除提醒
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* 备注 */}
          <div className="space-y-3 rounded-xl bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="size-4" /> 备注
            </div>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="添加备注..."
              onBlur={() => {
                if (noteDraft !== (task.note || '')) {
                  updateDetailMutation.mutate({ id: task.id, data: { note: noteDraft } })
                }
              }}
              className="min-h-[100px] resize-none bg-transparent"
            />
          </div>

          {/* 操作 */}
          <div className="space-y-1 rounded-xl bg-muted/30 p-2">
            {lists.length > 1 && (
              <div className="flex items-center gap-2 px-3 py-2">
                <ListTodo className="size-4 shrink-0 text-muted-foreground" />
                <Select
                  value={task.listId}
                  onValueChange={(v) => {
                    if (v !== task.listId) {
                      updateDetailMutation.mutate({ id: task.id, data: { listId: v } })
                    }
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 gap-1 rounded-lg text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => aiBreakdownMutation.mutate()}
              disabled={aiLoading}
            >
              <Sparkles className="size-4 text-purple-500" />
              {aiLoading ? 'AI 拆解中...' : 'AI 拆解子任务'}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => myDayMutation.mutate({ id: taskId!, add: !task.isMyDay })}
            >
              <Sun className={cn('size-4', task.isMyDay && 'text-orange-400')} />
              {task.isMyDay ? '移出我的一天' : '添加到我的一天'}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="size-4" />
              删除任务
            </Button>
          </div>
        </div>
      </ScrollArea>
  )

  if (isMobile) {
    return (
      <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[88vh] rounded-t-2xl p-0"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="flex flex-row items-start gap-2 border-b px-5 py-4 text-left">
            {detailHeaderNode}
          </SheetHeader>
          {detailBody('max-h-[calc(88vh-6.5rem)]')}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[82vh] gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          {detailHeaderNode}
        </DialogHeader>
        {detailBody('max-h-[calc(82vh-5.5rem)]')}
      </DialogContent>
    </Dialog>
  )
}
