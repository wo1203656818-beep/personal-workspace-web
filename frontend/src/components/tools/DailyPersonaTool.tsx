import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { entertainmentApi, type DailyPersona } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Music, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STALE_TIME } from '@/lib/query'

export function DailyPersonaTool() {
  const [result, setResult] = useState<DailyPersona | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: entertainmentApi.dailyPersona,
    onSuccess: setResult,
  })

  const { data: history } = useQuery({
    queryKey: ['entertainment', 'daily-persona', 'history'],
    queryFn: entertainmentApi.dailyPersonaHistory,
    staleTime: STALE_TIME,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">今日人设</h3>
        <p className="text-sm text-muted-foreground">今天你是谁？</p>
      </div>

      {result ? (
        <div
          className="rounded-xl border p-5 space-y-3"
          style={{ borderColor: result.luckyColor || undefined }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{result.date}</span>
            {result.cached && <span className="text-xs text-muted-foreground">今日已生成</span>}
          </div>
          <div className="text-center py-2">
            <h4 className="text-xl font-bold" style={{ color: result.luckyColor || undefined }}>
              {result.name}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">{result.description}</p>
          </div>
          <div className="space-y-1 text-xs">
            {result.luckyColor && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">幸运色:</span>
                <div
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: result.luckyColor }}
                />
              </div>
            )}
            {result.bgmStyle && (
              <div className="flex items-center gap-2">
                <Music className="size-3" />
                <span className="text-muted-foreground">今日BGM: {result.bgmStyle}</span>
              </div>
            )}
            {result.suitableFor && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">适合做: {result.suitableFor}</span>
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
          生成今日人设
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
                  <p className="text-sm font-medium" style={{ color: item.luckyColor || undefined }}>
                    {item.name}
                  </p>
                  <p className="text-sm leading-relaxed">
                    {item.description.length > 100
                      ? item.description.slice(0, 100) + '...'
                      : item.description}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.bgmStyle && (
                      <span className="flex items-center gap-1">
                        <Music className="size-3" />
                        {item.bgmStyle}
                      </span>
                    )}
                    {item.suitableFor && <span>适合: {item.suitableFor}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
