import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

export function FreshStartBanner() {
  const freshStart = useMemo(() => {
    const now = new Date()
    const day = now.getDay() // 0=Sun, 1=Mon
    const date = now.getDate()
    const month = now.getMonth()

    // 周一
    if (day === 1) return { text: '新的一周开始了', sub: '上周的遗憾已经过去，这周是全新的机会', icon: 'week' }
    // 月初
    if (date <= 3) return { text: `新的一月开始了`, sub: '上个月的未完成不要带到这个月', icon: 'month' }
    // 年初
    if (month === 0 && date <= 7) return { text: '新的一年开始了', sub: '今年你可以做不一样的自己', icon: 'year' }
    // 周日
    if (day === 0) return { text: '明天是新的一周', sub: '今晚花5分钟规划下周最重要的3件事', icon: 'plan' }
    return null
  }, [])

  if (!freshStart) return null

  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-medium">{freshStart.text}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{freshStart.sub}</p>
    </div>
  )
}
