import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ListChecks } from 'lucide-react'
import { tasksApi, type Task, type TaskList } from '@/lib/api'
import { TaskRow } from '@/components/tasks/TaskRow'

// 看板视图：按清单分列（对标滴答清单的看板）
export function TaskBoardView({
  tasks,
  lists,
  expandedTaskIds,
  onToggleExpand,
  onSelectTask,
  onDeleteTask,
  selectedIds,
  onToggleSelect,
}: {
  tasks: Task[]
  lists: TaskList[]
  expandedTaskIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelectTask: (id: string) => void
  onDeleteTask: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task'] })
    },
    onError: () => toast.error('更新失败'),
  })

  const columns = useMemo(() => {
    const activeTasks = tasks.filter((t) => !t.isCompleted)
    return lists
      .map((list) => ({
        list,
        tasks: activeTasks
          .filter((t) => t.listId === list.id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }))
      .filter((c) => c.tasks.length > 0)
  }, [tasks, lists])

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ListChecks className="size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">看板为空</p>
      </div>
    )
  }

  const toggleComplete = (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (task) updateMutation.mutate({ id, data: { isCompleted: !task.isCompleted } })
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {columns.map(({ list, tasks: columnTasks }) => (
        <div
          key={list.id}
          className="flex min-w-[260px] max-w-[300px] flex-1 flex-col rounded-xl border bg-muted/30 p-2"
        >
          <div className="mb-2 flex items-center gap-2 px-1">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: list.color || '#2563EB' }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{list.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{columnTasks.length}</span>
          </div>
          <div className="space-y-1">
            {columnTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isExpanded={expandedTaskIds.has(task.id)}
                onToggleExpand={onToggleExpand}
                onSelect={onSelectTask}
                onToggleComplete={toggleComplete}
                onDelete={onDeleteTask}
                isCompleting={
                  updateMutation.isPending && updateMutation.variables?.id === task.id
                }
                selected={selectedIds.has(task.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
