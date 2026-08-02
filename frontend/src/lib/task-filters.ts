// 任务智能筛选 + 视图逻辑（对标滴答清单的智能清单/筛选器/四象限）
import type { Task } from '@/lib/api'

export type TaskView = 'list' | 'board' | 'matrix'

export interface TaskFilter {
  q: string
  listId: string // '' = 全部清单
  important: boolean
  // due: all | overdue | today | thisWeek | next7 | noDate
  due: 'all' | 'overdue' | 'today' | 'thisWeek' | 'next7' | 'noDate'
  status: 'active' | 'completed' | 'all'
  energy: '' | 'low' | 'medium' | 'high'
}

export const DEFAULT_TASK_FILTER: TaskFilter = {
  q: '',
  listId: '',
  important: false,
  due: 'all',
  status: 'active',
  energy: '',
}

export function todayCSTDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function startOfWeekCST(base?: Date): string {
  const d = base ? new Date(base) : new Date()
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const y = get('year')
  const mo = get('month')
  const day = get('day')
  const weekdayCn = get('weekday')
  const dayMap: Record<string, number> = {
    周日: 0,
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
  }
  const offset = (dayMap[weekdayCn] ?? 0) - 1 // 周一为一周起点
  const ms = new Date(`${y}-${mo}-${day}T00:00:00+08:00`).getTime()
  const monday = new Date(ms - offset * 86400000)
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(
    monday.getUTCDate(),
  ).padStart(2, '0')}`
}

export function addDaysCST(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  d.setDate(d.getDate() + days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

export function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b)
}

export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate || task.isCompleted) return false
  const dateStr = task.dueDate.split('T')[0]
  return compareDateStr(dateStr, todayCSTDate()) < 0
}

export function isTaskDueToday(task: Task): boolean {
  if (!task.dueDate) return false
  return task.dueDate.split('T')[0] === todayCSTDate()
}

export function applyTaskFilter(tasks: Task[], f: TaskFilter): Task[] {
  const today = todayCSTDate()
  const weekStart = startOfWeekCST()
  const weekEnd = addDaysCST(weekStart, 6)
  const next7End = addDaysCST(today, 7)

  return tasks.filter((t) => {
    if (f.status === 'active' && t.isCompleted) return false
    if (f.status === 'completed' && !t.isCompleted) return false
    if (f.important && !t.isImportant) return false
    if (f.listId && t.listId !== f.listId) return false
    if (f.energy && t.energyLevel !== f.energy) return false
    if (f.q) {
      const hay = `${t.title}\n${t.note || ''}`.toLowerCase()
      if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false
    }
    if (f.due !== 'all') {
      const due = t.dueDate ? t.dueDate.split('T')[0] : null
      switch (f.due) {
        case 'overdue':
          if (!due || compareDateStr(due, today) >= 0) return false
          break
        case 'today':
          if (due !== today) return false
          break
        case 'thisWeek':
          if (!due || compareDateStr(due, weekStart) < 0 || compareDateStr(due, weekEnd) > 0)
            return false
          break
        case 'next7':
          if (!due || compareDateStr(due, today) < 0 || compareDateStr(due, next7End) > 0)
            return false
          break
        case 'noDate':
          if (due) return false
          break
      }
    }
    return true
  })
}

// 四象限：紧急=今天/逾期；重要=isImportant
export type Quadrant = 'urgent-important' | 'urgent-not-important' | 'not-urgent-important' | 'not-urgent-not-important'

export function quadrantOf(task: Task): Quadrant {
  const urgent = isTaskOverdue(task) || isTaskDueToday(task)
  if (urgent && task.isImportant) return 'urgent-important'
  if (urgent && !task.isImportant) return 'urgent-not-important'
  if (!urgent && task.isImportant) return 'not-urgent-important'
  return 'not-urgent-not-important'
}

export const QUADRANT_META: Record<Quadrant, { title: string; desc: string; color: string }> = {
  'urgent-important': { title: '重要且紧急', desc: '立即执行', color: 'text-red-600 dark:text-red-400' },
  'urgent-not-important': { title: '紧急不重要', desc: '委托或速办', color: 'text-orange-600 dark:text-orange-400' },
  'not-urgent-important': { title: '重要不紧急', desc: '规划执行', color: 'text-blue-600 dark:text-blue-400' },
  'not-urgent-not-important': { title: '不重要不紧急', desc: '尽量删除', color: 'text-muted-foreground' },
}
