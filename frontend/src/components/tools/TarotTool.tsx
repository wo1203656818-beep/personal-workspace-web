import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entertainmentApi, type TarotReading } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, History } from 'lucide-react'

const SPREADS = [
  { value: 'single', label: '单张牌', desc: '快速指引' },
  { value: 'three', label: '三张牌', desc: '过去-现在-未来' },
]

export function TarotTool() {
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState('')
  const [spread, setSpread] = useState('single')
  const [result, setResult] = useState<TarotReading | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const { data: history = [] } = useQuery({
    queryKey: ['tarot-history'],
    queryFn: entertainmentApi.tarotHistory,
    enabled: showHistory,
  })

  const mutation = useMutation({
    mutationFn: () => entertainmentApi.tarot({ question, spread }),
    onSuccess: (data) => {
      setResult(data)
      queryClient.invalidateQueries({ queryKey: ['tarot-history'] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">AI 塔罗牌</h3>
          <p className="text-sm text-muted-foreground">输入问题，塔罗牌为你指引</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
          <History className="size-4" />
        </Button>
      </div>

      {showHistory ? (
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无占卜记录</p>
          ) : (
            history.map((h: TarotReading) => (
              <div key={h.id} className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">「{h.question}」</p>
                <div className="flex gap-1">
                  {h.cards.map((card, i) => (
                    <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {card.name}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          <textarea
            placeholder="输入你的问题，如：最近的决定正确吗？"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />

          <div className="flex gap-2">
            {SPREADS.map((s) => (
              <Button
                key={s.value}
                size="sm"
                variant={spread === s.value ? 'default' : 'outline'}
                onClick={() => setSpread(s.value)}
                className="flex-1"
              >
                <div className="text-center">
                  <div className="text-xs">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                </div>
              </Button>
            ))}
          </div>

          <Button
            onClick={() => mutation.mutate()}
            disabled={!question || mutation.isPending}
            className="w-full"
          >
            {mutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            占卜
          </Button>

          {result && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {result.cards.map((card, i) => (
                  <div key={i} className="rounded-lg bg-background border px-3 py-2 text-center">
                    <div className="text-sm font-medium">{card.name}</div>
                    <div className="text-[10px] text-muted-foreground">{card.meaning}</div>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3">
                <p className="text-sm leading-relaxed">{result.interpretation}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
