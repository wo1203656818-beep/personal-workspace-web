import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Scroll, Sparkles, History, Loader2, CalendarDays } from 'lucide-react'
import { toolsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type FortuneItem = {
  id: string
  date: string
  result: string
  interpretation: string
  entropySource: string
  rawValue: number
  createdAt: string
}

function entropyLabel(source: string) {
  if (source === 'random_org') return '大气噪声'
  if (source === 'nist_beacon') return 'NIST 量子熵'
  return 'Web Crypto'
}

function fortuneTone(result: string): { from: string; to: string; text: string; border: string } {
  if (result.includes('上') || result.includes('吉')) {
    return { from: 'from-rose-100', to: 'to-rose-400', text: 'text-rose-900', border: 'border-rose-300/50' }
  }
  if (result.includes('下')) {
    return { from: 'from-slate-100', to: 'to-slate-400', text: 'text-slate-900', border: 'border-slate-300/50' }
  }
  return { from: 'from-amber-100', to: 'to-amber-300', text: 'text-amber-900', border: 'border-amber-300/50' }
}

export function FortuneTool() {
  const [result, setResult] = useState<{ result: string; interpretation: string; source: string; rawValue: number; cached?: boolean } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [animating, setAnimating] = useState(false)

  const { data: rawHistory = [], refetch } = useQuery({
    queryKey: ['fortuneHistory'],
    queryFn: toolsApi.fortuneHistory,
  })
  const history = Array.isArray(rawHistory) ? rawHistory : []

  const fortuneMutation = useMutation({
    mutationFn: toolsApi.fortune,
    onMutate: () => { setAnimating(true); setResult(null) },
    onSuccess: (data) => {
      setResult(data)
      setAnimating(false)
      refetch()
    },
    onError: (err: Error) => { setAnimating(false); toast.error(`求签失败: ${err.message}`) },
  })

  const visibleHistory = showAll ? history : history.slice(0, 10)

  return (
    <ScrollArea className="flex-1">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-rose-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center justify-center px-4 py-10 md:py-16">
          <button
            type="button"
            onClick={() => fortuneMutation.mutate()}
            disabled={animating}
            className="group relative"
          >
            <div className={cn(
              'absolute inset-0 rounded-3xl bg-rose-400/20 blur-2xl transition-opacity',
              animating ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            )} />
            <div className={cn(
              'relative flex size-40 flex-col items-center justify-center rounded-3xl border-[3px] border-rose-300/50 bg-gradient-to-br from-rose-100 via-rose-300 to-rose-500 shadow-2xl shadow-rose-500/20 transition-transform duration-500 md:size-52',
              animating && 'animate-[bounce_1s_ease-in-out_infinite] scale-105'
            )}>
              <Scroll className="size-12 text-rose-900/80 md:size-16" />
              <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-rose-800/60">Daily Fortune</span>
            </div>
          </button>

          <div className="mt-10 min-h-[10rem] w-full max-w-lg text-center">
            {animating ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm">物理熵采集中...</p>
              </div>
            ) : result ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 shadow-sm">
                  <span className="size-2 rounded-full bg-rose-500" />
                  <span className="text-xs font-medium text-muted-foreground">
                    熵源: {entropyLabel(result.source)}
                    {result.cached && ' · 今日已求'}
                  </span>
                </div>
                <Card className={cn('border shadow-lg bg-gradient-to-b dark:from-rose-950/20', fortuneTone(result.result).border, fortuneTone(result.result).from, 'to-card')}>
                  <CardContent className="px-6 py-8">
                    <p className={cn('text-3xl font-black tracking-tight md:text-4xl', fortuneTone(result.result).text)}>
                      {result.result}
                    </p>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                      {result.interpretation}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <p className="text-base font-medium">每日一签，顺应天意</p>
                <p className="mt-1 text-xs">今天适合求一支签</p>
              </div>
            )}
          </div>

          <Button
            className="mt-8 gap-2 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-8 py-5 text-base shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-amber-600"
            onClick={() => fortuneMutation.mutate()}
            disabled={animating}
          >
            <Sparkles className="size-4" />
            {animating ? '求签中...' : '求今日一签'}
          </Button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="border-t px-4 py-5 md:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-muted-foreground" /> 历史记录
            </h2>
            {history.length > 10 && (
              <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setShowAll((v) => !v)}>
                {showAll ? '收起' : `查看全部 (${history.length})`}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {visibleHistory.map((item: FortuneItem) => {
              const tone = fortuneTone(item.result)
              return (
                <div
                  key={item.id}
                  className="group flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm shadow-sm transition-all duration-200 hover:shadow-md"
                >
                  <span className="flex items-center gap-3">
                    <span className={cn(
                      'inline-flex size-8 items-center justify-center rounded-full text-xs font-black shadow-sm bg-gradient-to-br',
                      tone.from, tone.to, tone.text
                    )}>
                      签
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium">{item.result}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">{item.interpretation}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" />
                    {item.date.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </ScrollArea>
  )
}
