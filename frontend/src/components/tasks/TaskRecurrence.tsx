import { Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function parseRecurrence(r: string | null | undefined): {
  type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'every'
  days?: number[]
  dayOfMonth?: number
  everyDays?: number
} {
  if (!r) return { type: 'none' }
  if (r === 'daily') return { type: 'daily' }
  if (r.startsWith('weekly:')) {
    const days =
      r
        .split(':')[1]
        ?.split(',')
        .map(Number)
        .filter((n) => !isNaN(n)) || []
    return { type: 'weekly', days }
  }
  if (r.startsWith('monthly:')) {
    const day = parseInt(r.split(':')[1]) || 1
    return { type: 'monthly', dayOfMonth: day }
  }
  if (r === 'yearly') return { type: 'yearly' }
  if (r.startsWith('every:')) {
    const days = parseInt(r.split(':')[1]) || 1
    return { type: 'every', everyDays: Math.max(1, days) }
  }
  return { type: 'none' }
}

export function TaskRecurrence({
  recurrence,
  recurrencePickerOpen,
  onRecurrencePickerOpenChange,
  recurrenceType,
  onRecurrenceTypeChange,
  weeklyDays,
  onWeeklyDaysChange,
  monthlyDay,
  onMonthlyDayChange,
  everyDays,
  onEveryDaysChange,
  onMutate,
  taskId,
}: {
  recurrence: string | null | undefined
  recurrencePickerOpen: boolean
  onRecurrencePickerOpenChange: (open: boolean) => void
  recurrenceType: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'every'
  onRecurrenceTypeChange: (type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'every') => void
  weeklyDays: number[]
  onWeeklyDaysChange: (days: number[]) => void
  monthlyDay: number
  onMonthlyDayChange: (day: number) => void
  everyDays: number
  onEveryDaysChange: (days: number) => void
  onMutate: (id: string, data: { recurrence: string | null }) => void
  taskId: string
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Repeat className="size-4" /> 重复
      </div>
      <Popover open={recurrencePickerOpen} onOpenChange={onRecurrencePickerOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2">
            <Repeat className="size-4" />
            {(() => {
              const r = parseRecurrence(recurrence)
              if (r.type === 'none') return '设置重复'
              if (r.type === 'daily') return '每天'
              if (r.type === 'yearly') return '每年'
              if (r.type === 'every') return `每 ${r.everyDays} 天`
              if (r.type === 'weekly') {
                const dayNames = ['日', '一', '二', '三', '四', '五', '六']
                return `每周 ${r.days?.map((d) => dayNames[d]).join('、') || ''}`
              }
              if (r.type === 'monthly') return `每月 ${r.dayOfMonth} 号`
              return '设置重复'
            })()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto space-y-3 p-3" align="start">
          <div className="flex flex-wrap gap-1">
            {[
              { key: 'none' as const, label: '不重复' },
              { key: 'daily' as const, label: '每天' },
              { key: 'weekly' as const, label: '每周' },
              { key: 'monthly' as const, label: '每月' },
              { key: 'yearly' as const, label: '每年' },
              { key: 'every' as const, label: '每N天' },
            ].map((opt) => (
              <Button
                key={opt.key}
                variant={recurrenceType === opt.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (opt.key === 'none') {
                    onMutate(taskId, { recurrence: null })
                    onRecurrencePickerOpenChange(false)
                  } else if (opt.key === 'daily') {
                    onMutate(taskId, { recurrence: 'daily' })
                    onRecurrencePickerOpenChange(false)
                  } else if (opt.key === 'yearly') {
                    onMutate(taskId, { recurrence: 'yearly' })
                    onRecurrencePickerOpenChange(false)
                  } else {
                    onRecurrenceTypeChange(opt.key)
                  }
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {recurrenceType === 'weekly' && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">选择星期</div>
              <div className="flex gap-1">
                {(['日', '一', '二', '三', '四', '五', '六'] as const).map((label, idx) => (
                  <Button
                    key={idx}
                    variant={weeklyDays.includes(idx) ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => {
                      const next = weeklyDays.includes(idx)
                        ? weeklyDays.filter((d) => d !== idx)
                        : [...weeklyDays, idx].sort()
                      onWeeklyDaysChange(next)
                      if (next.length > 0) {
                        onMutate(taskId, { recurrence: `weekly:${next.join(',')}` })
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {recurrenceType === 'monthly' && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">每月几号</div>
              <Input
                type="number"
                min={1}
                max={31}
                value={monthlyDay}
                onChange={(e) => {
                  const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1))
                  onMonthlyDayChange(v)
                  onMutate(taskId, { recurrence: `monthly:${v}` })
                }}
                className="h-8 w-20"
              />
            </div>
          )}
          {recurrenceType === 'every' && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">每隔几天</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={everyDays}
                  onChange={(e) => {
                    const v = Math.min(365, Math.max(1, parseInt(e.target.value) || 1))
                    onEveryDaysChange(v)
                    onMutate(taskId, { recurrence: `every:${v}` })
                  }}
                  className="h-8 w-20"
                />
                <span className="text-xs text-muted-foreground">天</span>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
