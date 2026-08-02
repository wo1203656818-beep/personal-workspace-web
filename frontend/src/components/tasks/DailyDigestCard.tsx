import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { aiApi } from '@/lib/api'
import { toast } from 'sonner'

export function DailyDigestCard() {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)

  const generateMutation = useMutation({
    mutationFn: aiApi.digest,
    onSuccess: (data) => {
      setDigest(data.digest)
      setExpanded(true)
      queryClient.invalidateQueries({ queryKey: ['news', 'today'] })
      toast.success(data.cached ? '今日简报（缓存）' : '今日简报已生成')
    },
    onError: () => toast.error('生成失败，请检查 AI 配置'),
  })

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-indigo-500/[0.04] to-violet-500/[0.04]" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">今日简报</p>
            <p className="text-xs text-muted-foreground">AI 一键总结今日动态</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {digest && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              title="重新生成"
            >
              <RefreshCw
                className={`size-3.5 ${generateMutation.isPending ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
          {digest && (
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          )}
        </div>
      </div>
      {digest ? (
        expanded && (
          <p className="relative mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {digest}
          </p>
        )
      ) : (
        <div className="relative mt-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1 border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/5 hover:text-indigo-700"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> 正在生成...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> 生成今日简报
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
