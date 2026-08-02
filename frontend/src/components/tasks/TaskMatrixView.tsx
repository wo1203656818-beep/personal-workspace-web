import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LayoutGrid } from 'lucide-react'
import { tasksApi, type Task } from '@/lib/api'
import { TaskRow } from '@/components/tasks/TaskRow'
import { quadrantOf, QUADRANT_META, type Quadrant } from '@/lib/task-filters'
import { cn } from '@/lib/utils'

// 四象限视图（对标滴答清单的四象限）：重要 × 紧急
export function TaskMatrixView({
  tasks,
  expandedTaskIds,
  onToggleExpand,
  onSelectTask,
  onDeleteTask,
  selectedIds,
  onToggleSelect,
}: {
  tasks: Task[]
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

  const quadrants = useMemo(() => {
    const map = new Map<Quadrant, Task[]>()
    for (const q of Object.keys(QUADRANT_META) as Quadrant[]) map.set(q, [])
    for (const t of tasks.filter((t) => !t.isCompleted)) {
      map.get(quadrantOf(t))!.push(t)
    }
    for (const q of map.keys()) {
      map.get(q)!.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    }
    return map
  }, [tasks])

  const order: Quadrant[] = [
    'urgent-important',
    'urgent-not-important',
    'not-urgent-important',
    'not-urgent-not-important',
  ]

  if (tasks.filter((t) => !t.isCompleted).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <LayoutGrid className="size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">四象限为空</p>
      </div>
    )
  }

  const toggleComplete = (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (task) updateMutation.mutate({ id, data: { isCompleted: !task.isCompleted } })
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {order.map((q) => {
        const items = quadrants.get(q)!
        const meta = QUADRANT_META[q]
        return (
          <div key={q} className="flex flex-col rounded-xl border bg-card/50 p-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className={cn('text-sm font-medium', meta.color)}>{meta.title}</span>
              <span className="text-xs text-muted-foreground">{meta.desc}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-1">
              {items.map((task) => (
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
              {items.length === 0 && (
                <p className="rounded-lg px-2 py-4 text-center text-xs text-muted-foreground/60">
                  暂无任务
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
