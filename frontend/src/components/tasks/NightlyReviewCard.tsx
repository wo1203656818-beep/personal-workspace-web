import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { nightlyReviewApi, type NightlyReviewResponse } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Moon, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function NightlyReviewCard() {
  const [review, setReview] = useState<NightlyReviewResponse | null>(null)

  const generateMutation = useMutation({
    mutationFn: nightlyReviewApi.generate,
    onSuccess: (data) => {
      setReview(data)
    },
    onError: () => toast.error('生成失败，请检查 AI 配置'),
  })

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/[0.04] to-violet-500/[0.04]" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Moon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">睡前回顾</p>
            <p className="text-xs text-muted-foreground">温柔地结束这一天</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="size-8 p-0"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <RefreshCw className={`size-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {review ? (
        <div className="relative mt-3 space-y-2">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>完成 {review.stats.completed} 个</span>
            <span>待办 {review.stats.pending} 个</span>
            <span>心情 {review.stats.mood}</span>
            <span>决策 {review.stats.decisions} 次</span>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="whitespace-pre-wrap text-sm">{review.review}</p>
          </div>
        </div>
      ) : (
        <div className="relative py-4 text-center">
          <Button
            variant="outline"
            size="sm"
            className="border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/5 hover:text-indigo-700"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? '生成中...' : '生成今日回顾'}
          </Button>
        </div>
      )}
    </div>
  )
}
