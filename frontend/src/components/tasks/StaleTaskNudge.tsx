import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/lib/api/tasks'
import type { Task } from '@/lib/api/types'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Play, XCircle } from 'lucide-react'

export function StaleTaskNudge() {
  const queryClient = useQueryClient()
  const { data: staleTasks = [] } = useQuery({
    queryKey: ['tasks', 'stale'],
    queryFn: tasksApi.stale,
    staleTime: 5 * 60 * 1000,
  })

  const commitMutation = useMutation({
    mutationFn: (id: string) => tasksApi.commit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'stale'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'wip'] })
    },
  })

  const abandonMutation = useMutation({
    mutationFn: (id: string) => tasksApi.abandon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'stale'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'wip'] })
    },
  })

  if (staleTasks.length === 0) return null

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/[0.05] to-rose-600/[0.03]" />
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="size-4" />
          </div>
          <p className="text-sm font-medium">久未行动提醒</p>
          <span className="text-xs text-muted-foreground">超过 3 天没有行动</span>
        </div>
        <div className="space-y-2">
          {staleTasks.slice(0, 5).map((task: Task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card/80 p-2 transition-colors hover:bg-rose-500/5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs border-rose-500/20 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                  onClick={() => commitMutation.mutate(task.id)}
                >
                  <Play className="mr-1 size-3" />
                  开始做
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-rose-600"
                  onClick={() => abandonMutation.mutate(task.id)}
                >
                  <XCircle className="mr-1 size-3" />
                  放弃
                </Button>
              </div>
            </div>
          ))}
          {staleTasks.length > 5 && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              还有 {staleTasks.length - 5} 个任务...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
