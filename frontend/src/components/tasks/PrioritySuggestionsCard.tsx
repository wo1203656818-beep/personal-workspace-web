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
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/[0.04] to-sky-500/[0.03]" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Star className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">AI 优先级建议</p>
            <p className="text-xs text-muted-foreground">智能排序，先吃青蛙</p>
          </div>
        </div>
        {suggestions.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => generateMutation.mutate()}
            disabled={loading}
            title="重新生成"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>
      {loading && !generateMutation.data ? (
        <div className="relative mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-3.5 animate-spin" /> 正在分析任务优先级...
        </div>
      ) : suggestions.length > 0 ? (
        <div className="relative mt-3 space-y-2">
          {suggestions.map((s, idx) => {
            const task = tasks.find((t) => t.id === s.taskId)
            if (!task) return null
            return (
              <div
                key={s.taskId}
                onClick={() => onSelectTask(s.taskId)}
                className="flex cursor-pointer items-start gap-2 rounded-xl border bg-card/70 p-2 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-500/5 hover:shadow-sm"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-medium text-blue-600 dark:text-blue-400">
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
        <div className="relative mt-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1 border-blue-500/20 text-blue-600 hover:bg-blue-500/5 hover:text-blue-700"
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
