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
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Moon className="size-4 text-indigo-500" />
          <p className="text-sm font-medium">睡前回顾</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          <RefreshCw className={`size-3 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {review ? (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>完成 {review.stats.completed} 个</span>
            <span>待办 {review.stats.pending} 个</span>
            <span>心情 {review.stats.mood}</span>
            <span>决策 {review.stats.decisions} 次</span>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm whitespace-pre-wrap">{review.review}</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <Button
            variant="outline"
            size="sm"
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
