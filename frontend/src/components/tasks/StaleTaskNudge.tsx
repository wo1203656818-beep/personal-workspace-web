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
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          有 {staleTasks.length} 个任务超过 3 天没有行动
        </p>
      </div>
      <div className="space-y-2">
        {staleTasks.slice(0, 5).map((task: Task) => (
          <div key={task.id} className="flex items-center justify-between gap-2 rounded-md bg-white/50 px-3 py-2 dark:bg-black/20">
            <span className="text-sm text-foreground truncate">{task.title}</span>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => commitMutation.mutate(task.id)}
              >
                <Play className="size-3 mr-1" />
                开始做
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => abandonMutation.mutate(task.id)}
              >
                <XCircle className="size-3 mr-1" />
                放弃
              </Button>
            </div>
          </div>
        ))}
        {staleTasks.length > 5 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            还有 {staleTasks.length - 5} 个任务...
          </p>
        )}
      </div>
    </div>
  )
}
