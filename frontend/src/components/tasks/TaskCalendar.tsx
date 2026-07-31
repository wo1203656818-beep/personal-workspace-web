import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/api'
import { TaskRow } from '@/components/tasks/TaskRow'

interface TaskCalendarProps {
  tasks: Task[]
  onSelectTask?: (id: string) => void
  onToggleComplete?: (id: string) => void
  onDelete?: (id: string) => void
  expandedTaskIds?: Set<string>
  onToggleExpand?: (id: string) => void
}

export function TaskCalendar({
  tasks,
  onSelectTask,
  onToggleComplete,
  onDelete,
  expandedTaskIds = new Set(),
  onToggleExpand,
}: TaskCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.dueDate) continue
      const dateKey = task.dueDate.slice(0, 10)
      const arr = map.get(dateKey) || []
      arr.push(task)
      map.set(dateKey, arr)
    }
    return map
  }, [tasks])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days: Date[] = []
  let day = calendarStart
  while (day <= calendarEnd) {
    days.push(day)
    day = addDays(day, 1)
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  const selectedDayTasks = useMemo(() => {
    if (!selectedDate) return []
    const key = format(selectedDate, 'yyyy-MM-dd')
    return tasksByDate.get(key) || []
  }, [selectedDate, tasksByDate])

  const weekdays = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <CardTitle className="text-base font-medium">
              {format(currentMonth, 'yyyy年M月', { locale: zhCN })}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
            {weekdays.map(w => (
              <div key={w} className="py-2">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {weeks.flat().map((d, i) => {
              const dateKey = format(d, 'yyyy-MM-dd')
              const dayTasks = tasksByDate.get(dateKey) || []
              const inMonth = isSameMonth(d, currentMonth)
              const selected = selectedDate && isSameDay(d, selectedDate)
              const today = isToday(d)

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    'relative flex min-h-[4.5rem] flex-col items-start gap-1 rounded-md p-1.5 text-left transition-colors hover:bg-accent',
                    !inMonth && 'text-muted-foreground/40',
                    selected && 'bg-accent ring-1 ring-primary',
                    today && !selected && 'bg-accent/50'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                      today && 'bg-primary text-primary-foreground',
                      selected && !today && 'text-primary font-semibold'
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {dayTasks.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {dayTasks.slice(0, 3).map(t => (
                        <div
                          key={t.id}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            t.isCompleted ? 'bg-muted-foreground/30' : t.isImportant ? 'bg-yellow-400' : 'bg-primary'
                          )}
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="text-[0.6rem] text-muted-foreground">+{dayTasks.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">
                {format(selectedDate, 'M月d日 EEEE', { locale: zhCN })}
                <span className="ml-2 text-xs text-muted-foreground">
                  {selectedDayTasks.length} 个任务
                </span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {selectedDayTasks.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">当天没有任务</p>
            ) : (
              <div className="space-y-1">
                {selectedDayTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isExpanded={expandedTaskIds.has(task.id)}
                    onToggleExpand={onToggleExpand ? () => onToggleExpand(task.id) : () => {}}
                    onSelect={onSelectTask ? () => onSelectTask(task.id) : () => {}}
                    onToggleComplete={onToggleComplete ? () => onToggleComplete(task.id) : () => {}}
                    onDelete={onDelete ? () => onDelete(task.id) : () => {}}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
