import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ListTodo, BookHeart, Flame } from 'lucide-react'
import { calendarApi } from '@/lib/api/calendar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function CalendarPage() {
  usePageTitle('日历')
  const navigate = useNavigate()
  const today = new Date()
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar', monthStr],
    queryFn: () => calendarApi.getMonth(monthStr),
  })

  const daysInMonth = getDaysInMonth(currentYear, currentMonth)
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
  const calendarDays = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
      return {
        date: i + 1,
        dateStr,
        isToday: dateStr === todayStr,
        dayData: data?.days[dateStr],
      }
    }),
    [daysInMonth, currentYear, currentMonth, todayStr, data],
  )

  const selectedDayData = selectedDate ? data?.days[selectedDate] : null

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(y => y - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth(m => m - 1)
    }
    setSelectedDate(null)
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(y => y + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth(m => m + 1)
    }
    setSelectedDate(null)
  }

  const goToday = () => {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
    setSelectedDate(todayStr)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">日历</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>今天</Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-28 text-center text-sm font-medium">
              {currentYear}年{currentMonth + 1}月
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 日历网格 */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : error ? (
            <ErrorState title="加载失败" onRetry={refetch} />
          ) : (
            <Card className="p-4">
              {/* 星期行 */}
              <div className="mb-2 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>
              {/* 日期网格 */}
              <div className="grid grid-cols-7 gap-1">
                {/* 填充空白 */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {calendarDays.map(({ date, dateStr, isToday, dayData }) => {
                  const hasTasks = (dayData?.tasks.length ?? 0) > 0
                  const hasJournals = (dayData?.journals.length ?? 0) > 0
                  const hasHabits = (dayData?.habits.length ?? 0) > 0
                  const isSelected = selectedDate === dateStr

                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(dateStr)}
                      className={cn(
                        'flex flex-col items-center rounded-lg p-1.5 text-sm transition-colors hover:bg-accent',
                        isToday && 'border border-primary',
                        isSelected && 'bg-accent',
                      )}
                    >
                      <span className={cn(
                        'text-xs',
                        isToday && 'font-bold text-primary',
                      )}>
                        {date}
                      </span>
                      {(hasTasks || hasJournals || hasHabits) && (
                        <div className="mt-0.5 flex gap-0.5">
                          {hasTasks && <div className="size-1.5 rounded-full bg-blue-500" />}
                          {hasJournals && <div className="size-1.5 rounded-full bg-amber-500" />}
                          {hasHabits && <div className="size-1.5 rounded-full bg-green-500" />}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* 详情面板 */}
        <div className="lg:col-span-1">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-medium">
              {selectedDate || '选择日期查看详情'}
            </h3>
            {selectedDayData ? (
              <div className="space-y-4">
                {/* 任务 */}
                {selectedDayData.tasks.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ListTodo className="size-3" /> 任务 ({selectedDayData.tasks.length})
                    </h4>
                    <div className="space-y-1">
                      {selectedDayData.tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => navigate('/tasks')}
                          className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                        >
                          <span className={cn(task.isCompleted && 'line-through text-muted-foreground')}>
                            {task.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 日记 */}
                {selectedDayData.journals.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <BookHeart className="size-3" /> 日记 ({selectedDayData.journals.length})
                    </h4>
                    <div className="space-y-1">
                      {selectedDayData.journals.map((journal) => (
                        <button
                          key={journal.id}
                          onClick={() => navigate('/journal')}
                          className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                        >
                          {journal.title || '无标题'}
                          {journal.mood && <span className="ml-1">{journal.mood}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 习惯 */}
                {selectedDayData.habits.length > 0 && (
                  <div>
                    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Flame className="size-3" /> 习惯 ({selectedDayData.habits.length})
                    </h4>
                    <div className="space-y-1">
                      {selectedDayData.habits.map((habit) => (
                        <div key={habit.habitId} className="rounded-md px-2 py-1.5 text-xs">
                          ✅ {habit.habitName}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDayData.tasks.length === 0 &&
                  selectedDayData.journals.length === 0 &&
                  selectedDayData.habits.length === 0 && (
                  <p className="text-xs text-muted-foreground">当天没有记录</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">点击日历中的日期查看当天的任务、日记和习惯打卡</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}