import { useQuery } from '@tanstack/react-query'
import { moodApi } from '@/lib/api'
import { Sun, Flame } from 'lucide-react'

const WEATHER_MAP: Record<string, { emoji: string; label: string; color: string }> = {
  sunny: { emoji: '☀️', label: '晴朗', color: 'text-yellow-500' },
  cloudy: { emoji: '⛅', label: '多云', color: 'text-gray-500' },
  rainy: { emoji: '🌧️', label: '下雨', color: 'text-blue-500' },
  stormy: { emoji: '⛈️', label: '暴风雨', color: 'text-red-500' },
  snowy: { emoji: '🌨️', label: '下雪', color: 'text-cyan-500' },
}

export function MoodHistory() {
  const { data: trends } = useQuery({
    queryKey: ['mood', 'trends'],
    queryFn: moodApi.trends,
    staleTime: 5 * 60 * 1000,
  })

  if (!trends) return null

  const { byWeather, last7Days, streak } = trends

  if (byWeather.length === 0) return null

  const totalLogs = byWeather.reduce((sum, w) => sum + w.count, 0)

  // 计算连续打卡天数
  let streakCount = 0
  for (let i = 0; i < streak.length; i++) {
    const expected = new Date()
    expected.setDate(expected.getDate() - i)
    const expectedStr = expected.toISOString().slice(0, 10)
    if (streak[i]?.date === expectedStr) {
      streakCount++
    } else {
      break
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-yellow-500/[0.04] to-amber-500/[0.02]" />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <Sun className="size-4" />
            </div>
            <p className="text-sm font-medium">情绪趋势</p>
          </div>
          {streakCount > 1 && (
            <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-600 dark:text-yellow-400">
              <Flame className="size-3" />
              连续{streakCount}天
            </span>
          )}
        </div>

        {/* 天气分布 */}
        <div className="flex gap-2">
          {byWeather.map((w) => {
            const info = WEATHER_MAP[w.weather]
            if (!info) return null
            const pct = Math.round((w.count / totalLogs) * 100)
            return (
              <div key={w.weather} className="flex-1 text-center">
                <span className="text-lg">{info.emoji}</span>
                <p className="text-xs text-muted-foreground">{pct}%</p>
              </div>
            )
          })}
        </div>

        {/* 近7天日历 */}
        {last7Days.length > 0 && (
          <div className="flex items-end gap-1">
            {last7Days.map((day) => {
              const info = WEATHER_MAP[day.weather]
              const d = new Date(day.date)
              const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`
              return (
                <div key={day.date} className="flex flex-1 flex-col items-center gap-0.5">
                  <span className="text-sm">{info?.emoji || '?'}</span>
                  <span className="text-[10px] text-muted-foreground">{dayLabel}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
