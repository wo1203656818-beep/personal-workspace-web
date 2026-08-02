import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { moodApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Sun, Cloud, CloudRain, CloudLightning, Snowflake } from 'lucide-react'

const WEATHERS = [
  {
    value: 'sunny',
    label: '晴朗',
    emoji: '☀️',
    icon: Sun,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    desc: '心情很好',
  },
  {
    value: 'cloudy',
    label: '多云',
    emoji: '⛅',
    icon: Cloud,
    color: 'text-gray-500',
    bg: 'bg-gray-500/10',
    desc: '一般般',
  },
  {
    value: 'rainy',
    label: '下雨',
    emoji: '🌧️',
    icon: CloudRain,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    desc: '有点低落',
  },
  {
    value: 'stormy',
    label: '暴风雨',
    emoji: '⛈️',
    icon: CloudLightning,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    desc: '很糟糕',
  },
  {
    value: 'snowy',
    label: '下雪',
    emoji: '🌨️',
    icon: Snowflake,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    desc: '平静/麻木',
  },
] as const

export function MoodWeatherCard() {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [selectedWeather, setSelectedWeather] = useState<string | null>(null)

  const { data: todayMood } = useQuery({
    queryKey: ['mood', 'today'],
    queryFn: moodApi.today,
  })

  const createMutation = useMutation({
    mutationFn: (data: { weather: string; note?: string }) => moodApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mood', 'today'] })
      queryClient.invalidateQueries({ queryKey: ['mood', 'trends'] })
      toast.success('已记录今天的心情')
      setSelectedWeather(null)
      setNote('')
    },
    onError: () => toast.error('记录失败'),
  })

  if (todayMood) {
    const weather = WEATHERS.find((w) => w.value === todayMood.weather)
    return (
      <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-yellow-500/[0.05] to-amber-500/[0.03]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
            <span className="text-2xl">{weather?.emoji}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">今天的心情：{weather?.label}</p>
            {todayMood.note && (
              <p className="mt-0.5 text-xs text-muted-foreground">{todayMood.note}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-3 hover-lift sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-yellow-500/[0.05] to-amber-500/[0.03]" />
      <div className="relative flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
          <Sun className="size-4" />
        </div>
        <p className="text-sm font-medium">今天心情怎么样？</p>
      </div>
      <div className="relative mt-3 flex flex-wrap gap-2">
        {WEATHERS.map((w) => (
          <Button
            key={w.value}
            variant={selectedWeather === w.value ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-auto min-w-[3.5rem] flex-1 flex-col gap-1 rounded-lg py-2 sm:py-3',
              selectedWeather === w.value
                ? ''
                : 'border-yellow-500/10 bg-yellow-500/5 text-foreground hover:bg-yellow-500/10 hover:text-yellow-700'
            )}
            onClick={() => setSelectedWeather(w.value)}
          >
            <span className="text-lg">{w.emoji}</span>
            <span className="text-xs">{w.label}</span>
          </Button>
        ))}
      </div>
      {selectedWeather && (
        <div className="relative mt-3 space-y-2">
          <input
            type="text"
            placeholder="一句话记录原因（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={100}
            className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            className="w-full"
            onClick={() =>
              createMutation.mutate({ weather: selectedWeather, note: note || undefined })
            }
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? '记录中...' : '记录'}
          </Button>
        </div>
      )}
    </div>
  )
}
