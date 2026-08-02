import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, type Task } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Zap, Clock, CheckCircle } from 'lucide-react'

export function QuickActionPool() {
  const queryClient = useQueryClient()

  const { data: quickTasks = [] } = useQuery({
    queryKey: ['tasks', 'quick-pool'],
    queryFn: tasksApi.quickPool,
    staleTime: 30 * 1000,
  })

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await tasksApi.update(id, { isCompleted: true })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'quick-pool'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const unmarkMutation = useMutation({
    mutationFn: tasksApi.unmarkQuick,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'quick-pool'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  if (quickTasks.length === 0) return null

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-500/[0.05] to-orange-600/[0.03]" />
      <div className="relative flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
          <Zap className="size-4" />
        </div>
        <p className="text-sm font-medium">快速行动池</p>
        <span className="text-xs text-muted-foreground">2分钟内完成</span>
      </div>
      <div className="relative mt-3 space-y-2">
        {quickTasks.map((task) => (
          <QuickTaskRow
            key={task.id}
            task={task}
            onComplete={() => completeMutation.mutate(task.id)}
            onUnmark={() => unmarkMutation.mutate(task.id)}
          />
        ))}
      </div>
    </div>
  )
}

function QuickTaskRow({
  task,
  onComplete,
  onUnmark,
}: {
  task: Task
  onComplete: () => void
  onUnmark: () => void
}) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!task.quickDeadline) return
    const update = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(task.quickDeadline!).getTime() - Date.now()) / 1000),
      )
      setRemaining(diff)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [task.quickDeadline])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isExpired = remaining <= 0
  const color = isExpired ? 'text-red-500' : remaining < 30 ? 'text-yellow-500' : 'text-green-500'

  return (
    <div className="group flex items-center gap-2 rounded-lg border bg-card p-2 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/40 hover:shadow-sm">
      <Button size="sm" variant="ghost" className="size-8 min-touch-target p-0" onClick={onComplete}>
        <CheckCircle className="size-4 text-green-600" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{task.title}</p>
      </div>
      <div className={`flex items-center gap-1 text-xs font-mono ${color}`}>
        <Clock className="size-3" />
        {isExpired
          ? '已过期'
          : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
      </div>
      <Button size="sm" variant="ghost" className="h-8 min-touch-target px-2 text-xs" onClick={onUnmark}>
        取消
      </Button>
    </div>
  )
}
