import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useUndo } from '@/lib/use-undo'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { tasksApi, aiApi, taskListsApi, settingsApi, type Task } from '@/lib/api'
import { PageSkeleton } from '@/components/PageSkeleton'
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog'
import { TasksHeader } from '@/components/tasks/TasksHeader'
import { NewTaskInput } from '@/components/tasks/NewTaskInput'
import { CreateListDialog } from '@/components/tasks/CreateListDialog'
import { NlTaskDialog } from '@/components/tasks/NlTaskDialog'
import { BatchActionBar } from '@/components/tasks/BatchActionBar'
import { TodayView } from '@/components/tasks/TodayView'
import { PlannedView } from '@/components/tasks/PlannedView'
import { AllView } from '@/components/tasks/AllView'
import { ListView } from '@/components/tasks/ListView'

export function TasksPage() {
  const { view, listId } = useParams<{ view: string; listId: string }>()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { push: pushUndo } = useUndo()

  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [createListOpen, setCreateListOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [nlOpen, setNlOpen] = useState(false)
  const [nlText, setNlText] = useState('')
  const [nlParsed, setNlParsed] = useState<{ title: string; dueDate: string | null; listName: string | null; note: string | null; listId: string | null } | null>(null)
  const [newTaskListId, setNewTaskListId] = useState<string>('')
  const [suggestedList, setSuggestedList] = useState<{ listId: string; listName: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const pendingDeleteRef = useRef<Task | null>(null)
  const newTaskInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      newTaskInputRef.current?.focus()
    }
  }, [searchParams])

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

  const isListView = view === 'list' && listId && listId !== 'all'
  const currentView = isListView ? 'list' : (view || 'today')

  const queryKey = useMemo(() => {
    if (currentView === 'all') return ['tasks', 'all']
    if (currentView === 'today') return ['tasks', 'myday']
    if (currentView === 'planned') return ['tasks', 'planned']
    if (isListView) return ['tasks', 'list', listId]
    return ['tasks', 'myday']
  }, [currentView, isListView, listId])

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey,
    queryFn: () => {
      if (currentView === 'all') return tasksApi.list()
      if (currentView === 'today') return tasksApi.myDay()
      if (currentView === 'planned') return tasksApi.planned()
      if (isListView) return tasksApi.byList(listId!)
      return tasksApi.list()
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: lists = [] } = useQuery({
    queryKey: ['taskLists'],
    queryFn: taskListsApi.list,
    staleTime: 2 * 60 * 1000,
  })

  const parseTaskMutation = useMutation({
    mutationFn: (text: string) => aiApi.parseTask(text),
    onSuccess: (d) => setNlParsed(d.task),
    onError: (e: Error) => toast.error('解析失败: ' + e.message),
  })

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
  const pageTitle = isListView
    ? (currentList?.name || '任务')
    : (currentView === 'all' ? '所有任务' : currentView === 'today' ? '今天' : currentView === 'planned' ? '计划' : '任务')

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

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      let targetListId = newTaskListId || (isListView ? listId! : lists[0]?.id)
      if (!targetListId) {
        const list = await taskListsApi.create({ name: 'Tasks', color: '#2563EB' })
        targetListId = list.id
        queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      }
      const data: Partial<Task> = { listId: targetListId, title }
      if (currentView === 'today') {
        data.isMyDay = true
        data.myDayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } else if (currentView === 'planned') {
        data.dueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      }
      return tasksApi.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey as any })
      setNewTaskTitle('')
      toast.success('任务已创建')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
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

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }, [])

  const handleSelectList = (v: string) => {
    setNewTaskListId(v)
    setSuggestedList(null)
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allVisibleTasks = useMemo(() => {
    const active = tasks.filter(t => !t.isCompleted)
    const completed = tasks.filter(t => t.isCompleted)
    return [...active, ...(showCompleted ? completed : [])]
  }, [tasks, showCompleted])

  const allSelected = allVisibleTasks.length > 0 && allVisibleTasks.every(t => selectedIds.has(t.id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allVisibleTasks.map(t => t.id)))
    }
  }, [allSelected, allVisibleTasks])

  const batchComplete = async () => {
    const ids = Array.from(selectedIds)
    let success = 0
    for (const id of ids) {
      try {
        await tasksApi.update(id, { isCompleted: true })
        success++
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setSelectedIds(new Set())
    if (success > 0) toast.success(`已标记 ${success} 个任务完成`)
  }

  const batchDelete = async () => {
    const ids = Array.from(selectedIds)
    const deletedTasks: Task[] = []
    let success = 0
    for (const id of ids) {
      try {
        const task = await tasksApi.get(id)
        await tasksApi.delete(id)
        deletedTasks.push(task)
        success++
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setSelectedIds(new Set())
    if (success > 0) {
      pushUndo({
        label: `已删除 ${success} 个任务`,
        undo: async () => {
          for (const task of deletedTasks) {
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
          }
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          toast.success('已撤销批量删除')
        },
      })
    }
  }

  const batchMoveToList = async (targetListId: string) => {
    const ids = Array.from(selectedIds)
    let success = 0
    for (const id of ids) {
      try {
        await tasksApi.update(id, { listId: targetListId })
        success++
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setSelectedIds(new Set())
    if (success > 0) toast.success(`已移动 ${success} 个任务`)
  }

  const batchMarkImportant = async () => {
    const ids = Array.from(selectedIds)
    let success = 0
    for (const id of ids) {
      try {
        await tasksApi.update(id, { isImportant: true })
        success++
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setSelectedIds(new Set())
    if (success > 0) toast.success(`已标记 ${success} 个任务为重要`)
  }

  const batchAddToMyDay = async () => {
    const ids = Array.from(selectedIds)
    let success = 0
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    for (const id of ids) {
      try {
        await tasksApi.update(id, { isMyDay: true, myDayDate: today })
        success++
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setSelectedIds(new Set())
    if (success > 0) toast.success(`已将 ${success} 个任务添加到我的一天`)
  }

  const completedCount = useMemo(() => tasks.filter(t => t.isCompleted).length, [tasks])

  const viewProps = {
    tasks,
    lists,
    showCompleted,
    expandedTaskIds,
    onToggleExpand: toggleExpand,
    selectedTaskId,
    onSelectTask: setSelectedTaskId,
    onDeleteTask: setDeleteConfirmId,
    selectedIds,
    onToggleSelect: toggleSelect,
    onToggleSelectAll: toggleSelectAll,
    allSelected,
    newTaskInputRef,
    newTaskTitle,
    onNewTaskTitleChange: setNewTaskTitle,
    onCreateTask: () => createMutation.mutate(newTaskTitle.trim()),
    createMutation,
  }

  return (
    <div className="flex h-full flex-col">
      <TasksHeader
        pageTitle={pageTitle}
        isListView={!!isListView}
        completedCount={completedCount}
        totalCount={tasks.length}
        syncMsTodoMutation={syncMsTodoMutation}
        syncFeedback={syncFeedback}
        onOpenNl={() => setNlOpen(true)}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
      />

      <NewTaskInput
        ref={newTaskInputRef}
        value={newTaskTitle}
        onChange={setNewTaskTitle}
        onSubmit={() => createMutation.mutate(newTaskTitle.trim())}
        lists={lists}
        isListView={!!isListView}
        isSearchView={false}
        isListsOverview={false}
        currentListId={listId}
        selectedListId={newTaskListId}
        onSelectList={handleSelectList}
        suggestedList={suggestedList}
        onAcceptSuggestion={() => {
          if (suggestedList) {
            setNewTaskListId(suggestedList.listId)
            setSuggestedList(null)
          }
        }}
      />

      <BatchActionBar
        selectedCount={selectedIds.size}
        lists={lists}
        onComplete={batchComplete}
        onMarkImportant={batchMarkImportant}
        onAddToMyDay={batchAddToMyDay}
        onMoveToList={batchMoveToList}
        onDelete={batchDelete}
        onCancel={() => setSelectedIds(new Set())}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="px-2 pb-24 pt-2 md:px-4 md:pb-2">
          {isLoading ? (
            <PageSkeleton />
          ) : currentView === 'today' ? (
            <TodayView {...viewProps} />
          ) : currentView === 'planned' ? (
            <PlannedView {...viewProps} />
          ) : currentView === 'list' ? (
            <ListView {...viewProps} listId={listId!} />
          ) : (
            <AllView {...viewProps} />
          )}
        </div>
      </div>

      <TaskDetailDialog
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onDelete={(id) => setDeleteConfirmId(id)}
        lists={lists}
      />

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-xl bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">确认删除任务？</h3>
            <p className="mt-2 text-sm text-muted-foreground">此操作不可撤销，任务及其子任务将被永久删除。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">取消</button>
              <button
                onClick={() => {
                  if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId)
                  setDeleteConfirmId(null)
                }}
                className="rounded-lg bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        newListName={newListName}
        onNewListNameChange={setNewListName}
        onCreate={() => newListName.trim() && createListMutation.mutate(newListName.trim())}
      />

      <NlTaskDialog
        open={nlOpen}
        onOpenChange={setNlOpen}
        nlText={nlText}
        onNlTextChange={setNlText}
        nlParsed={nlParsed}
        parseTaskMutation={parseTaskMutation}
        createFromNlMutation={createFromNlMutation}
        onReset={() => { setNlText(''); setNlParsed(null) }}
      />
    </div>
  )
}
