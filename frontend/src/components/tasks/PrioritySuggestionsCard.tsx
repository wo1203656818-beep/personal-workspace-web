import { useMutation } from '@tanstack/react-query'
import { Star, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { aiApi, type Task } from '@/lib/api'
import { toast } from 'sonner'

export function PrioritySuggestionsCard({
  tasks,
  onSelectTask,
}: {
  tasks: Task[]
  onSelectTask: (taskId: string) => void
}) {
  const generateMutation = useMutation({
    mutationFn: aiApi.prioritySuggestions,
    onError: () => toast.error('生成失败，请检查 AI 配置'),
  })

  const suggestions = generateMutation.data?.suggestions ?? []
  const loading = generateMutation.isPending

  return (
    <div className="rounded-2xl border bg-gradient-to-r from-amber-500/5 to-orange-500/5 p-3 md:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
          <Star className="size-4" />
          AI 优先级建议
        </div>
        {suggestions.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => generateMutation.mutate()}
            disabled={loading}
            title="重新生成"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
      {loading && !generateMutation.data ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5 animate-spin" /> 正在分析任务优先级...
        </div>
      ) : suggestions.length > 0 ? (
        <div className="mt-2 space-y-2">
          {suggestions.map((s, idx) => {
            const task = tasks.find((t) => t.id === s.taskId)
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
          })}
        </div>
      ) : (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1"
            onClick={() => generateMutation.mutate()}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> 正在分析...
              </>
            ) : (
              <>
                <Star className="size-3.5" /> 生成优先级建议
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
