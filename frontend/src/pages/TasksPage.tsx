import { useState, useMemo, useRef, useEffect } from 'react'
import { useUndo } from '@/lib/use-undo'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvided } from '@hello-pangea/dnd'
import { Sun, Star, CalendarClock, ListTodo, Plus, Sparkles, X, Calendar, Trash2, Search, ChevronDown, ChevronRight, Bell, CheckSquare, FileText, type LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { toast } from 'sonner'
import { tasksApi, subtasksApi, aiApi, taskListsApi, type Task, type TaskList, type Subtask } from '@/lib/api'
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
import { PageSkeleton } from '@/components/PageSkeleton'

const viewConfig: Record<string, { title: string; icon: LucideIcon; color: string; iconBg: string; tabActiveClass: string }> = {
  myday: { title: '我的一天', icon: Sun, color: 'text-blue-500', iconBg: 'bg-gradient-to-br from-blue-500 to-blue-400', tabActiveClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  important: { title: '重要', icon: Star, color: 'text-yellow-500', iconBg: 'bg-gradient-to-br from-yellow-400 to-amber-400', tabActiveClass: 'bg-yellow-400/15 text-yellow-600 dark:text-yellow-400' },
  planned: { title: '已计划', icon: CalendarClock, color: 'text-purple-500', iconBg: 'bg-gradient-to-br from-purple-500 to-violet-400', tabActiveClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  lists: { title: '列表', icon: ListTodo, color: 'text-muted-foreground', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-300', tabActiveClass: 'bg-muted text-foreground' },
  search: { title: '搜索结果', icon: Search, color: 'text-muted-foreground', iconBg: 'bg-gradient-to-br from-slate-400 to-slate-300', tabActiveClass: 'bg-muted text-foreground' },
}

// 将 ISO 时间字符串转为 datetime-local input 所需格式 (yyyy-MM-ddTHH:mm)
function toDatetimeLocal(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
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
  // 新建任务时目标列表选择（空则用当前列表视图或第一个列表）
  const [newTaskListId, setNewTaskListId] = useState<string>('')
  const pendingDeleteRef = useRef<Task | null>(null)
  const newTaskInputRef = useRef<HTMLInputElement>(null)

  // B11: 读取 ?new=1 参数自动聚焦新建输入框
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      newTaskInputRef.current?.focus()
    }
  }, [searchParams])

  // 判断当前视图
  const isListView = view === 'list' && listId && listId !== 'all'
  const isSearchView = view === 'search'
  const isListsOverview = view === 'lists'
  const currentView = isListView ? 'list' : (view || 'lists')

  // 获取任务列表
  const queryKey = useMemo(() => {
    if (isSearchView) return ['tasks', 'search', searchQuery]
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
      if (currentView === 'myday') return tasksApi.myDay()
      if (currentView === 'important') return tasksApi.important()
      if (currentView === 'planned') return tasksApi.planned()
      if (isListsOverview) return tasksApi.list()
      if (isListView) return tasksApi.byList(listId!)
      return tasksApi.list()
    },
  })

  // 获取任务列表名称（列表视图时）
  const { data: lists = [] } = useQuery({
    queryKey: ['taskLists'],
    queryFn: taskListsApi.list,
  })

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
        data.myDayDate = format(new Date(), 'yyyy-MM-dd')
      } else if (currentView === 'important') {
        data.isImportant = true
      } else if (currentView === 'planned') {
        data.dueDate = format(new Date(), 'yyyy-MM-dd')
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

  // 更新任务
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  // 删除任务（支持撤销恢复）
  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      pendingDeleteRef.current = tasks.find((t) => t.id === id) ?? null
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

  // 拖拽排序（仅活跃任务）
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const items = Array.from(activeTasks)
    const [reordered] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reordered)
    // 更新 sortOrder
    items.forEach((item, idx) => {
      if (item.sortOrder !== idx) {
        updateMutation.mutate({ id: item.id, data: { sortOrder: idx } })
      }
    })
  }

  const completedCount = completedTasks.length

  return (
    <div className="flex h-full flex-col">
      {/* 标题栏 */}
      <div className="border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className={cn('icon-badge size-9 md:size-10', isSearchView || isListView ? 'bg-gradient-to-br from-slate-400 to-slate-300' : config?.iconBg)}>
            <Icon className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              {completedCount}/{tasks.length} 已完成
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
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
          <div className="surface-card flex items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-primary/20">
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
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {/* 列表选择器：非列表视图下可选目标列表；列表视图下显示当前列表名 */}
            {lists.length > 0 && (
              <Select
                value={newTaskListId || (isListView ? listId! : lists[0]?.id || '')}
                onValueChange={(v) => setNewTaskListId(v)}
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
          </div>
        </div>
      )}

      {/* 任务列表 */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-2 md:px-4">
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
            />
          ) : activeTasks.length === 0 && (!showCompleted || completedTasks.length === 0) ? (
            <div className="empty-state">
              <div className={cn('icon-badge mb-4 size-16', isSearchView || isListView ? 'bg-gradient-to-br from-slate-400 to-slate-300' : config?.iconBg)}>
                <Icon className="size-8" />
              </div>
              <p className="text-base font-medium">{isSearchView ? '未找到匹配的任务' : '暂无任务'}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {isSearchView ? '尝试更换关键词' : '在上方输入框添加第一个任务，开启高效的一天'}
              </p>
            </div>
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
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

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
}: {
  task: Task
  provided?: DraggableProvided
  isExpanded: boolean
  onToggleExpand: () => void
  onSelect: () => void
  onToggleComplete: () => void
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const editInputRef = useRef<HTMLInputElement>(null)

  // 拉取子任务（用于显示数量 badge + 展开时渲染）
  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ['subtasks', task.id],
    queryFn: () => subtasksApi.byTask(task.id),
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtasks', task.id] }),
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
    <div
      ref={provided?.innerRef}
      {...(provided?.draggableProps ?? {})}
      {...(provided?.dragHandleProps ?? {})}
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
        {/* 子任务展开/收起按钮 */}
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
          {subtasks.length > 0 && (
            <span className="ml-0.5 text-xs tabular-nums">{subtasks.length}</span>
          )}
        </Button>
        {task.isImportant && <Star className="size-4 fill-yellow-400 text-yellow-400" />}
        {task.dueDate && (
          <Badge variant={isOverdue ? 'destructive' : 'secondary'} className="gap-1">
            <Calendar className="size-3" />
            {new Date(task.dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
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
}: {
  tasksByList: { listId: string; listName: string; tasks: Task[] }[] | null
  expandedTaskIds: Set<string>
  onToggleExpand: (taskId: string) => void
  onSelect: (taskId: string) => void
  onToggleComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteList: (listId: string) => void
}) {
  if (!tasksByList || tasksByList.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon-badge mb-4 size-16 bg-gradient-to-br from-slate-400 to-slate-300">
          <ListTodo className="size-8" />
        </div>
        <p className="text-base font-medium">暂无任务列表</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">点击右上角「新建列表」开始整理任务</p>
      </div>
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
  const queryClient = useQueryClient()
  const [newSubtask, setNewSubtask] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

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

  // 任务切换或备注变化时同步本地草稿
  useEffect(() => {
    if (task) setNoteDraft(task.note || '')
  }, [task?.id, task?.note])

  // 详情面板内的更新（含日期），需要同时刷新任务列表和详情
  const updateDetailMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
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
    mutationFn: (title: string) => subtasksApi.create(taskId!, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      setNewSubtask('')
    },
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
  })

  // AI 拆解
  const aiBreakdownMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error('未选择任务')
      setAiLoading(true)
      const data = await aiApi.breakdown(task?.title || '')
      const validSubtasks = (data.subtasks || [])
        .filter((st: { title?: string }) => typeof st.title === 'string' && st.title.trim().length > 0)
        .filter((st: { title: string }) => st.title.trim().length <= 200)
        .slice(0, 10)
      if (validSubtasks.length === 0) throw new Error('AI 未返回有效子任务')
      // B9: 顺序 await 每个子任务创建，避免竞态丢失
      for (const st of validSubtasks) {
        await subtasksApi.create(taskId, st.title.trim())
      }
      return { ...data, subtasks: validSubtasks }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      setAiLoading(false)
      toast.success(`AI 已拆解 ${data.subtasks.length} 个子任务`)
    },
    onError: async (err: Error) => {
      setAiLoading(false)
      let detail = err.message
      if (err instanceof HTTPError) {
        try {
          const text = await err.response.clone().text()
          console.error('[aiBreakdown] raw response:', text)
          const body = JSON.parse(text) as { error?: string; detail?: string }
          detail = body.detail || body.error || err.message
        } catch {
          // ignore parse error
        }
      }
      toast.error(`AI 拆解失败: ${detail}`)
      console.error('[aiBreakdown]', err)
    },
  })

  if (!task) return null

  const dueDate = task.dueDate ? new Date(task.dueDate) : undefined
  const reminder = task.reminder ? new Date(task.reminder) : undefined

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-xl w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl border bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-start gap-3 pr-8">
            <DialogTitle className="flex-1 text-lg leading-snug">{task.title}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -mr-2"
              onClick={() =>
                updateDetailMutation.mutate({ id: taskId!, data: { isImportant: !task.isImportant } })
              }
            >
              <Star className={cn('size-4', task.isImportant && 'fill-yellow-400 text-yellow-400')} />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(80vh-4.5rem)] px-6 py-5">
          <div className="space-y-5">
            {/* 子任务 */}
            <div className="space-y-3 rounded-xl bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckSquare className="size-4" /> 子任务
              </div>
              <div className="space-y-1">
                {subtasks.map((st: Subtask) => (
                  <div key={st.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                    <Checkbox
                      checked={st.isCompleted}
                      onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                    />
                    <span className={cn('flex-1 text-sm', st.isCompleted && 'line-through text-muted-foreground')}>
                      {st.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteSubtaskMutation.mutate(st.id)}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                {subtasks.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">暂无子任务，点击 AI 拆解可自动生成</p>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Plus className="size-4 text-muted-foreground" />
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSubtask.trim()) {
                      addSubtaskMutation.mutate(newSubtask.trim())
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
                        updateDetailMutation.mutate({
                          id: task.id,
                          data: { reminder: new Date(e.target.value).toISOString() },
                        })
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
              {/* 移动到列表：让任务在不同列表间转移，弥补拖拽仅限同列表排序的限制 */}
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
      </DialogContent>
    </Dialog>
  )
}
