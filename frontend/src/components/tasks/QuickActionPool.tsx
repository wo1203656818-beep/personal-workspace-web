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
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-orange-500" />
        <p className="text-sm font-medium">快速行动池</p>
        <span className="text-xs text-muted-foreground">2分钟内完成</span>
      </div>
      <div className="space-y-2">
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

function QuickTaskRow({ task, onComplete, onUnmark }: { task: Task; onComplete: () => void; onUnmark: () => void }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!task.quickDeadline) return
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(task.quickDeadline!).getTime() - Date.now()) / 1000))
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
    <div className="flex items-center gap-2 rounded-lg bg-background p-2">
      <Button
        size="sm"
        variant="ghost"
        className="size-8 p-0"
        onClick={onComplete}
      >
        <CheckCircle className="size-4" />
      </Button>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{task.title}</p>
      </div>
      <div className={`flex items-center gap-1 text-xs font-mono ${color}`}>
        <Clock className="size-3" />
        {isExpired ? '已过期' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-xs h-6 px-2"
        onClick={onUnmark}
      >
        取消
      </Button>
    </div>
  )
}
