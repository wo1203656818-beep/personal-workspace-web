import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { entertainmentApi, type DailyPersona } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Music } from 'lucide-react'

export function DailyPersonaTool() {
  const [result, setResult] = useState<DailyPersona | null>(null)

  const mutation = useMutation({
    mutationFn: entertainmentApi.dailyPersona,
    onSuccess: setResult,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">今日人设</h3>
        <p className="text-sm text-muted-foreground">今天你是谁？</p>
      </div>

      {result ? (
        <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: result.luckyColor || undefined }}>
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
                <div className="size-3 rounded-full border" style={{ backgroundColor: result.luckyColor }} />
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
          <Button variant="ghost" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
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
    </div>
  )
}
