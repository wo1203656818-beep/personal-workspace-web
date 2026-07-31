import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entertainmentApi, type DailyChallenge } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle, Trophy } from 'lucide-react'
import { toast } from 'sonner'

const CATEGORY_COLORS: Record<string, string> = {
  健康: 'text-green-500',
  社交: 'text-blue-500',
  创造: 'text-purple-500',
  学习: 'text-amber-500',
  生活: 'text-pink-500',
  心态: 'text-indigo-500',
  探索: 'text-cyan-500',
  效率: 'text-orange-500',
  思考: 'text-teal-500',
}

export function DailyChallengeTool() {
  const queryClient = useQueryClient()
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['challenge-stats'],
    queryFn: entertainmentApi.challengeStats,
  })

  const getMutation = useMutation({
    mutationFn: entertainmentApi.dailyChallenge,
    onSuccess: setChallenge,
  })

  const completeMutation = useMutation({
    mutationFn: () =>
      entertainmentApi.completeChallenge({
        challenge: challenge!.challenge,
        category: challenge!.category,
      }),
    onSuccess: () => {
      setChallenge((prev) =>
        prev ? { ...prev, completed: true, completedAt: new Date().toISOString() } : prev,
      )
      queryClient.invalidateQueries({ queryKey: ['challenge-stats'] })
      toast.success('挑战完成！')
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">随机挑战</h3>
        <p className="text-sm text-muted-foreground">今天的趣味挑战</p>
      </div>

      {challenge ? (
        <div
          className={`rounded-xl border p-5 space-y-3 ${challenge.completed ? 'bg-green-500/5 border-green-500/30' : ''}`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium ${CATEGORY_COLORS[challenge.category] || 'text-muted-foreground'}`}
            >
              {challenge.category}
            </span>
            {challenge.completed && <CheckCircle className="size-4 text-green-500" />}
          </div>
          <p className="text-base font-medium">{challenge.challenge}</p>
          {!challenge.completed ? (
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="w-full"
            >
              {completeMutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              完成挑战
            </Button>
          ) : (
            <p className="text-sm text-green-600 text-center">已完成！</p>
          )}
        </div>
      ) : (
        <Button
          onClick={() => getMutation.mutate()}
          disabled={getMutation.isPending}
          className="w-full"
        >
          {getMutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
          获取今日挑战
        </Button>
      )}

      {stats && stats.total > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Trophy className="size-3" />
          <span>已完成 {stats.total} 个挑战</span>
        </div>
      )}
    </div>
  )
}
