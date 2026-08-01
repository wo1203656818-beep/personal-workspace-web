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
    <div className="rounded-2xl border bg-gradient-to-r from-blue-500/5 to-violet-500/5 p-3 md:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
          <Sparkles className="size-4" />
          今日简报
        </div>
        <div className="flex items-center gap-1">
          {digest && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
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
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          )}
        </div>
      </div>
      {digest ? (
        expanded && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {digest}
          </p>
        )
      ) : (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1"
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
