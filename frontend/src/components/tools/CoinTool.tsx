import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Trophy, TrendingUp, History, Sparkles } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { coinApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type FlipItem = {
  id: string
  result: string
  createdAt: string
}

function longestStreak(history: FlipItem[], target: string): number {
  let max = 0
  let cur = 0
  for (const h of history) {
    if (h.result === target) {
      cur += 1
      if (cur > max) max = cur
    } else {
      cur = 0
    }
  }
  return max
}

export function CoinTool() {
  const [flipping, setFlipping] = useState(false)
  const [result, setResult] = useState<{ result: string; interpretation: string; source: string } | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { data: rawHistory = [], refetch } = useQuery({
    queryKey: ['coinHistory'],
    queryFn: coinApi.history,
  })
  const history = Array.isArray(rawHistory) ? rawHistory : []

  const flipMutation = useMutation({
    mutationFn: coinApi.flip,
    onMutate: () => setFlipping(true),
    onSuccess: (data) => {
      setResult(data)
      setFlipping(false)
      refetch()
    },
    onError: (err: Error) => { setFlipping(false); toast.error(`抛掷失败: ${err.message}`) },
  })

  const total = history.length
  const headsCount = history.filter((h: FlipItem) => h.result === 'heads').length
  const headsRate = total > 0 ? ((headsCount / total) * 100).toFixed(1) + '%' : '0%'
  const longestHeads = longestStreak(history as FlipItem[], 'heads')

  const trendData = (history as FlipItem[]).map((h, i) => ({
    idx: i + 1,
    value: h.result === 'heads' ? 1 : 0,
    face: h.result === 'heads' ? '正' : '反',
  }))

  const visibleHistory = showAll ? (history as FlipItem[]) : (history as FlipItem[]).slice(0, 10)

  return (
    <ScrollArea className="flex-1">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center justify-center px-4 py-10 md:py-16">
          <button
            type="button"
            onClick={() => flipMutation.mutate()}
            disabled={flipping}
            className="group relative size-40 md:size-52 [perspective:1000px]"
          >
            <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl transition-opacity group-hover:opacity-100 opacity-60" />
            <div
              className={cn(
                'relative size-full transition-transform duration-500 [transform-style:preserve-3d]',
                flipping && 'animate-[coin-flip_1s_ease-in-out]'
              )}
              style={{
                transform: flipping ? undefined : `rotateY(${result?.result === 'tails' ? 180 : 0}deg)`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center rounded-full border-[5px] border-yellow-400/50 bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-500 shadow-2xl shadow-yellow-500/25 [backface-visibility:hidden]">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-5xl font-black text-yellow-900 md:text-6xl">正</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-800/70">Yang</span>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-full border-[5px] border-slate-500/50 bg-gradient-to-br from-slate-200 via-slate-400 to-slate-700 shadow-2xl shadow-slate-500/25 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-5xl font-black text-slate-900 md:text-6xl">反</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-800/70">Yin</span>
                </div>
              </div>
            </div>
          </button>

          <div className="mt-10 min-h-[6rem] text-center">
            {flipping ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm">物理熵采集中...</p>
              </div>
            ) : result ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 shadow-sm">
                  <span className={cn('size-2 rounded-full', result.result === 'heads' ? 'bg-yellow-500' : 'bg-slate-500')} />
                  <span className="text-xs font-medium text-muted-foreground">
                    熵源: {result.source === 'random_org' ? '大气噪声' : result.source === 'nist_beacon' ? 'NIST 量子熵' : 'Web Crypto'}
                  </span>
                </div>
                <p className="text-4xl font-black tracking-tight md:text-5xl">
                  {result.result === 'heads' ? '阳 · 正面' : '阴 · 反面'}
                </p>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground md:text-base">{result.interpretation}</p>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <p className="text-base font-medium">点击硬币开始抛掷</p>
                <p className="mt-1 text-xs">让随机性帮你做出决定</p>
              </div>
            )}
          </div>

          <Button
            className="mt-8 gap-2 rounded-full px-8 py-5 text-base shadow-lg shadow-primary/20"
            onClick={() => flipMutation.mutate()}
            disabled={flipping}
          >
            <Sparkles className="size-4" />
            {flipping ? '抛掷中...' : '抛掷硬币'}
          </Button>
        </div>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-3 gap-3 px-4 pb-5 md:px-6">
          <StatCard label="总次数" value={String(total)} icon={History} color="text-blue-500" bg="bg-blue-500/10" gradient="from-blue-500 to-indigo-500" />
          <StatCard label="正面率" value={headsRate} icon={TrendingUp} color="text-amber-500" bg="bg-amber-500/10" gradient="from-amber-500 to-yellow-500" />
          <StatCard label="最长连正" value={String(longestHeads)} icon={Trophy} color="text-emerald-500" bg="bg-emerald-500/10" gradient="from-emerald-500 to-teal-500" />
        </div>
      )}

      {trendData.length > 0 && (
        <div className="px-4 pb-5 md:px-6">
          <Card className="overflow-hidden">
            <CardContent className="pt-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/10">
                  <TrendingUp className="size-3.5 text-amber-500" />
                </div>
                历史趋势
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="coinTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="idx" hide />
                  <YAxis
                    domain={[0, 1]}
                    ticks={[0, 1]}
                    width={32}
                    tickFormatter={(v: number) => (v === 1 ? '正' : '反')}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [Number(value) === 1 ? '正面' : '反面', '结果']}
                    labelFormatter={(label) => `第 ${label} 次`}
                  />
                  <Area type="stepAfter" dataKey="value" stroke="#F59E0B" strokeWidth={2.5} fill="url(#coinTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

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
            {visibleHistory.map((flip: FlipItem) => (
              <div
                key={flip.id}
                className="group flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-full text-xs font-black shadow-sm',
                      flip.result === 'heads'
                        ? 'bg-gradient-to-br from-yellow-200 to-yellow-400 text-yellow-900'
                        : 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900'
                    )}
                  >
                    {flip.result === 'heads' ? '正' : '反'}
                  </span>
                  <span className="font-medium">{flip.result === 'heads' ? '阳 · 正面' : '阴 · 反面'}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(flip.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScrollArea>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  gradient,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  bg: string
  gradient: string
}) {
  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="relative p-4 text-center">
        <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', gradient)} />
        <div className={cn('mx-auto mb-2 flex size-9 items-center justify-center rounded-xl', bg)}>
          <Icon className={cn('size-4', color)} />
        </div>
        <p className="text-xl font-black tracking-tight md:text-2xl">{value}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
