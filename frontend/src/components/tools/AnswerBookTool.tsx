import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, Sparkles, History, Loader2 } from 'lucide-react'
import { toolsApi } from '@/lib/api'
import { formatCST } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type AnswerItem = {
  id: string
  result: string
  entropySource: string
  rawValue: number
  createdAt: string
}

function entropyLabel(source: string) {
  if (source === 'random_org') return '大气噪声'
  if (source === 'nist_beacon') return 'NIST 量子熵'
  return '未知熵源'
}

export function AnswerBookTool() {
  const [result, setResult] = useState<{ result: string; source: string; rawValue: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [animating, setAnimating] = useState(false)

  const { data: rawHistory = [], refetch } = useQuery({
    queryKey: ['answerHistory'],
    queryFn: toolsApi.answerHistory,
  })
  const history = Array.isArray(rawHistory) ? rawHistory : []

  const answerMutation = useMutation({
    mutationFn: toolsApi.answer,
    onMutate: () => { setAnimating(true); setResult(null) },
    onSuccess: (data) => {
      setResult(data)
      setAnimating(false)
      refetch()
    },
    onError: (err: Error) => { setAnimating(false); toast.error(`翻书失败: ${err.message}`) },
  })

  const visibleHistory = showAll ? history : history.slice(0, 10)

  return (
    <ScrollArea className="flex-1">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col items-center justify-center px-4 py-10 md:py-16">
          <button
            type="button"
            onClick={() => answerMutation.mutate()}
            disabled={animating}
            className="group relative"
          >
            <div className={cn(
              'absolute inset-0 rounded-3xl bg-indigo-400/20 blur-2xl transition-opacity',
              animating ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            )} />
            <div className={cn(
              'relative flex size-40 flex-col items-center justify-center rounded-3xl border-[3px] border-indigo-300/50 bg-gradient-to-br from-indigo-100 via-indigo-300 to-indigo-500 shadow-2xl shadow-indigo-500/20 transition-transform duration-500 md:size-52',
              animating && 'animate-[pulse_1.5s_ease-in-out_infinite] scale-105'
            )}>
              <BookOpen className="size-12 text-indigo-900/80 md:size-16" />
              <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-indigo-800/60">Answer Book</span>
            </div>
          </button>

          <div className="mt-10 min-h-[8rem] w-full max-w-lg text-center">
            {animating ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm">物理熵采集中...</p>
              </div>
            ) : result ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 shadow-sm">
                  <span className="size-2 rounded-full bg-indigo-500" />
                  <span className="text-xs font-medium text-muted-foreground">熵源: {entropyLabel(result.source)}</span>
                </div>
                <Card className="border-indigo-200/50 bg-gradient-to-b from-indigo-50/50 to-card shadow-lg dark:from-indigo-950/20">
                  <CardContent className="px-6 py-8">
                    <p className="text-2xl font-black tracking-tight text-indigo-900 dark:text-indigo-100 md:text-3xl">
                      {result.result}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <p className="text-base font-medium">心中默想一个问题</p>
                <p className="mt-1 text-xs">点击书本，翻开答案</p>
              </div>
            )}
          </div>

          <Button
            className="mt-8 gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-5 text-base shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-violet-600"
            onClick={() => answerMutation.mutate()}
            disabled={animating}
          >
            <Sparkles className="size-4" />
            {animating ? '翻开中...' : '翻开答案之书'}
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
            {visibleHistory.map((item: AnswerItem) => (
              <div
                key={item.id}
                className="group flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <span className="flex items-center gap-3">
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-200 to-indigo-400 text-xs font-black text-indigo-900 shadow-sm">
                    答
                  </span>
                  <span className="font-medium">{item.result}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatCST(item.createdAt, 'cnShort')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScrollArea>
  )
}
