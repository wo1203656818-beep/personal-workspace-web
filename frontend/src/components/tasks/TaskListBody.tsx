import { useCallback, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { tasksApi, type Task } from '@/lib/api'
import { TaskRow } from '@/components/tasks/TaskRow'
import { EmptyState } from '@/components/EmptyState'
import type { LucideIcon } from 'lucide-react'

interface TaskListBodyProps {
  tasks: Task[]
  showCompleted: boolean
  expandedTaskIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelectTask: (id: string) => void
  onDeleteTask: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  allSelected: boolean
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
}

export function TaskListBody({
  tasks,
  showCompleted,
  expandedTaskIds,
  onToggleExpand,
  onSelectTask,
  onDeleteTask,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected,
  emptyIcon: Icon,
  emptyTitle,
  emptyDescription,
}: TaskListBodyProps) {
  const queryClient = useQueryClient()

  const activeTasks = useMemo(() => tasks.filter((t) => !t.isCompleted), [tasks])
  const completedTasks = useMemo(() => tasks.filter((t) => t.isCompleted), [tasks])

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (t.id === id ? { ...t, ...data } : t)),
      )
      return { prev }
    },
    onSuccess: (returnedTask, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', variables.id], exact: true })
      if (returnedTask) {
        queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
          old?.map((t) => (t.id === variables.id ? { ...t, ...returnedTask } : t)),
        )
        queryClient.setQueryData<Task>(['task', variables.id], returnedTask as any)
      }
    },
    onError: () => toast.error('更新失败'),
  })

  const reorderMutation = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => tasksApi.reorder(orders),
    onMutate: async (orders) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const prev = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      const map = new Map(orders.map((o) => [o.id, o.sortOrder]))
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (map.has(t.id) ? { ...t, sortOrder: map.get(t.id)! } : t)),
      )
      return { prev }
    },
    onError: () => toast.error('排序失败'),
  })

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

  const toggleComplete = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id)
      if (task) updateMutation.mutate({ id, data: { isCompleted: !task.isCompleted } })
    },
    [tasks],
  )

  const handleToggleExpand = useCallback(
    (id: string) => onToggleExpand(id),
    [onToggleExpand],
  )
  const handleSelect = useCallback((id: string) => onSelectTask(id), [onSelectTask])
  const handleDelete = useCallback((id: string) => onDeleteTask(id), [onDeleteTask])

  if (activeTasks.length === 0 && (!showCompleted || completedTasks.length === 0)) {
    return <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      {activeTasks.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleSelectAll}
            className="size-4 rounded border-muted-foreground/30"
          />
          <span className="text-xs text-muted-foreground">全选</span>
        </div>
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tasks">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1 stagger-container">
              {activeTasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(prov) => (
                    <TaskRow
                      task={task}
                      provided={prov}
                      isExpanded={expandedTaskIds.has(task.id)}
                      onToggleExpand={handleToggleExpand}
                      onSelect={handleSelect}
                      onToggleComplete={toggleComplete}
                      onDelete={handleDelete}
                      isCompleting={
                        updateMutation.isPending && updateMutation.variables?.id === task.id
                      }
                      selected={selectedIds.has(task.id)}
                      onToggleSelect={onToggleSelect}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {showCompleted && completedTasks.length > 0 && (
        <div className="mt-5 space-y-1">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-px flex-1 bg-border" />
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              已完成 {completedTasks.length}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {completedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isExpanded={expandedTaskIds.has(task.id)}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
              onToggleComplete={toggleComplete}
              onDelete={handleDelete}
              isCompleting={updateMutation.isPending && updateMutation.variables?.id === task.id}
              selected={selectedIds.has(task.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </>
  )
}
