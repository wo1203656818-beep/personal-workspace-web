import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { entertainmentApi, type CyberFortune } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'

export function CyberFortuneTool() {
  const [result, setResult] = useState<CyberFortune | null>(null)

  const mutation = useMutation({
    mutationFn: entertainmentApi.cyberFortune,
    onSuccess: setResult,
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
    </div>
  )
}
