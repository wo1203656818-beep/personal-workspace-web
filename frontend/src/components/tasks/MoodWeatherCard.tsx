import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { moodApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Sun, Cloud, CloudRain, CloudLightning, Snowflake } from 'lucide-react'

const WEATHERS = [
  { value: 'sunny', label: '晴朗', emoji: '☀️', icon: Sun, color: 'text-yellow-500', bg: 'bg-yellow-500/10', desc: '心情很好' },
  { value: 'cloudy', label: '多云', emoji: '⛅', icon: Cloud, color: 'text-gray-500', bg: 'bg-gray-500/10', desc: '一般般' },
  { value: 'rainy', label: '下雨', emoji: '🌧️', icon: CloudRain, color: 'text-blue-500', bg: 'bg-blue-500/10', desc: '有点低落' },
  { value: 'stormy', label: '暴风雨', emoji: '⛈️', icon: CloudLightning, color: 'text-red-500', bg: 'bg-red-500/10', desc: '很糟糕' },
  { value: 'snowy', label: '下雪', emoji: '🌨️', icon: Snowflake, color: 'text-cyan-500', bg: 'bg-cyan-500/10', desc: '平静/麻木' },
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
    const weather = WEATHERS.find(w => w.value === todayMood.weather)
    return (
      <div className={`rounded-xl border p-4 ${weather?.bg || ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{weather?.emoji}</span>
          <div>
            <p className="text-sm font-medium">今天的心情：{weather?.label}</p>
            {todayMood.note && (
              <p className="text-xs text-muted-foreground mt-0.5">{todayMood.note}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">今天心情怎么样？</p>
      <div className="flex gap-2">
        {WEATHERS.map((w) => (
          <Button
            key={w.value}
            variant={selectedWeather === w.value ? 'default' : 'outline'}
            size="sm"
            className={`flex-1 flex-col gap-1 h-auto py-3 ${selectedWeather === w.value ? '' : w.bg}`}
            onClick={() => setSelectedWeather(w.value)}
          >
            <span className="text-lg">{w.emoji}</span>
            <span className="text-xs">{w.label}</span>
          </Button>
        ))}
      </div>
      {selectedWeather && (
        <div className="space-y-2">
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
            onClick={() => createMutation.mutate({ weather: selectedWeather, note: note || undefined })}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? '记录中...' : '记录'}
          </Button>
        </div>
      )}
    </div>
  )
}
