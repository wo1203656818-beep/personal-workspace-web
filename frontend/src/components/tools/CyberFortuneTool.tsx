import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { entertainmentApi, type CyberFortune } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STALE_TIME } from '@/lib/query'

export function CyberFortuneTool() {
  const [result, setResult] = useState<CyberFortune | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: entertainmentApi.cyberFortune,
    onSuccess: setResult,
  })

  const { data: history } = useQuery({
    queryKey: ['entertainment', 'cyber-fortune', 'history'],
    queryFn: entertainmentApi.cyberFortuneHistory,
    staleTime: STALE_TIME,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">赛博运势</h3>
        <p className="text-sm text-muted-foreground">今日系统运行状态扫描中...</p>
      </div>

      {result ? (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ borderColor: result.luckyColor || undefined }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{result.date}</span>
            {result.cached && <span className="text-xs text-muted-foreground">今日已生成</span>}
          </div>
          <p className="text-sm leading-relaxed">{result.content}</p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">情绪指数:</span>
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor:
                        i < (result.moodScore || 5) ? result.luckyColor || '#6366f1' : '#e5e7eb',
                    }}
                  />
                ))}
              </div>
            </div>
            {result.luckyColor && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">幸运色:</span>
                <div
                  className="size-4 rounded-full border"
                  style={{ backgroundColor: result.luckyColor }}
                />
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <RefreshCw className={`size-3 mr-1 ${mutation.isPending ? 'animate-spin' : ''}`} />
            重新生成
          </Button>
        </div>
      ) : (
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
          扫描今日运势
        </Button>
      )}

      {/* 历史记录 */}
      {history && history.length > 0 && (
        <div className="rounded-xl border bg-card/60">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="text-sm font-medium">历史记录</span>
            <span className="text-xs text-muted-foreground">{history.length} 条</span>
            <ChevronDown
              className={cn(
                'ml-auto size-4 text-muted-foreground transition-transform',
                historyOpen && 'rotate-180',
              )}
            />
          </button>

          {historyOpen && (
            <div className="space-y-2 border-t px-4 pb-3 pt-2">
              {history.map((item) => (
                <div key={item.id} className="space-y-1 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                    <div className="flex items-center gap-2">
                      {item.moodScore != null && (
                        <span className="text-xs text-muted-foreground">
                          情绪: {item.moodScore}/10
                        </span>
                      )}
                      {item.luckyColor && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">幸运色</span>
                          <div
                            className="size-3 rounded-full border"
                            style={{ backgroundColor: item.luckyColor }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed">
                    {item.content.length > 100 ? item.content.slice(0, 100) + '...' : item.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
