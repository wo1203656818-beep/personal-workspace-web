import { Star, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Task } from '@/lib/api'

export function PrioritySuggestionsCard({
  currentView,
  priorityLoading,
  priorityData,
  tasks,
  onSelectTask,
  regeneratePriorityMutation,
}: {
  currentView: string
  priorityLoading: boolean
  priorityData: { suggestions: { taskId: string; reason: string }[]; cached?: boolean } | undefined
  tasks: Task[]
  onSelectTask: (taskId: string) => void
  regeneratePriorityMutation: { mutate: () => void; isPending: boolean }
}) {
  if (currentView !== 'myday') return null
  if (!priorityLoading && (!priorityData?.suggestions || priorityData.suggestions.length === 0)) return null

  return (
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
                onClick={() => onSelectTask(s.taskId)}
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
  )
}
