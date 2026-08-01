# 三功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现日历视图、专注 AI 分析、稍后读三个新功能

**Architecture:** 三个功能独立，建议按"稍后读 → 日历视图 → 专注 AI 分析"顺序实现。稍后读仅前端改动（后端 API 已有）；日历视图需新增后端路由 + 前端页面；专注 AI 分析需新增后端端点 + 前端修改。

**Tech Stack:** Hono (后端), React + shadcn/ui (前端), D1 (数据库), Workers AI, KV (缓存)

---

## 功能 C：稍后读 / 阅读列表

### Task C1: CollectionsPage 新增"稍后读"标签页

**文件:**
- 修改: `frontend/src/pages/CollectionsPage.tsx`
- 修改: `frontend/src/lib/api/collections.ts` (可选，新增 summarize 方法)

- [ ] **Step 1: 在 CollectionsPage 添加标签页切换**

在 CollectionsPage.tsx 中找到现有的标签页结构，在顶部添加"稍后读"标签。目前 CollectionsPage 使用 Tabs 组件，需要在 `TabsList` 中添加一个新 Tab。

```tsx
// 在文件顶部导入
import { Bookmark, Link as LinkIcon, ExternalLink, CheckCircle2, Archive, Plus, MoreHorizontal, Sparkles } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// 在 TabsList 中新增
<TabsList>
  <TabsTrigger value="media">书影剧</TabsTrigger>
  <TabsTrigger value="bookmarks">稍后读</TabsTrigger>
</TabsList>
```

- [ ] **Step 2: 添加 bookmarks 状态管理和数据获取**

在 CollectionsPage 组件内添加：

```tsx
// 状态
const [bookmarkStatus, setBookmarkStatus] = useState<string>('unread')
const [bookmarkEdit, setBookmarkEdit] = useState<Bookmark | null>(null)
const [editDialogOpen, setEditDialogOpen] = useState(false)
const [addDialogOpen, setAddDialogOpen] = useState(false)
const [editTitle, setEditTitle] = useState('')
const [editTags, setEditTags] = useState('')
const [editProgress, setEditProgress] = useState(0)
const [editNote, setEditNote] = useState('')
const [addUrl, setAddUrl] = useState('')
const [addTitle, setAddTitle] = useState('')
const [addTags, setAddTags] = useState('')

// 数据获取
const { data: bookmarks, isLoading: bmLoading, error: bmError, refetch: refetchBookmarks } = useQuery({
  queryKey: ['bookmarks', bookmarkStatus],
  queryFn: () => collectionsApi.bookmarks.list(bookmarkStatus === 'all' ? undefined : bookmarkStatus),
})

// 删除 mutation
const deleteBookmarkMutation = useMutation({
  mutationFn: (id: string) => collectionsApi.bookmarks.remove(id),
  onSuccess: () => {
    refetchBookmarks()
    toast.success('已删除')
  },
  onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
})

// 更新 mutation
const updateBookmarkMutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: Partial<Bookmark> }) =>
    collectionsApi.bookmarks.update(id, data),
  onSuccess: () => {
    refetchBookmarks()
    toast.success('已更新')
  },
  onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
})

// 创建 mutation
const createBookmarkMutation = useMutation({
  mutationFn: (data: { url: string; title?: string; tags?: string[] }) =>
    collectionsApi.bookmarks.create(data),
  onSuccess: () => {
    refetchBookmarks()
    setAddDialogOpen(false)
    setAddUrl('')
    setAddTitle('')
    setAddTags('')
    toast.success('已添加')
  },
  onError: (err: Error) => toast.error(`添加失败: ${err.message}`),
})
```

- [ ] **Step 3: 添加书签筛选栏**

在 `TabsContent value="bookmarks"` 中添加：

```tsx
<TabsContent value="bookmarks" className="space-y-4">
  <div className="flex items-center justify-between gap-2">
    <div className="flex gap-1">
      {['all', 'unread', 'read', 'archived'].map((s) => (
        <Button
          key={s}
          variant={bookmarkStatus === s ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBookmarkStatus(s)}
        >
          {s === 'all' ? '全部' : s === 'unread' ? '未读' : s === 'read' ? '已读' : '归档'}
        </Button>
      ))}
    </div>
    <Button size="sm" onClick={() => setAddDialogOpen(true)}>
      <Plus className="mr-1 size-4" />添加链接
    </Button>
  </div>

  {/* 书签列表 */}
  {bmLoading ? (
    <div className="space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
  ) : bmError ? (
    <ErrorState message="加载失败" onRetry={refetchBookmarks} />
  ) : bookmarks && bookmarks.length > 0 ? (
    <div className="space-y-3">
      {bookmarks.map((bm) => (
        <BookmarkCard
          key={bm.id}
          bookmark={bm}
          onStatusToggle={() =>
            updateBookmarkMutation.mutate({
              id: bm.id,
              data: { readStatus: bm.readStatus === 'unread' ? 'read' : 'unread' },
            })
          }
          onArchive={() =>
            updateBookmarkMutation.mutate({
              id: bm.id,
              data: { readStatus: 'archived' },
            })
          }
          onEdit={() => {
            setBookmarkEdit(bm)
            setEditTitle(bm.title || '')
            setEditTags(bm.tags ? JSON.parse(bm.tags).join(', ') : '')
            setEditProgress(bm.progress || 0)
            setEditNote(bm.readingNote || '')
            setEditDialogOpen(true)
          }}
          onDelete={() => deleteBookmarkMutation.mutate(bm.id)}
        />
      ))}
    </div>
  ) : (
    <EmptyState icon={LinkIcon} title="暂无链接" description="Telegram bot 自动保存的链接会显示在这里" />
  )}

  {/* 编辑弹窗 */}
  <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
    <DialogContent>
      <DialogHeader><DialogTitle>编辑链接</DialogTitle></DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>标题</Label>
          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>标签（逗号分隔）</Label>
          <Input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="AI, 科技, 阅读" />
        </div>
        <div className="space-y-2">
          <Label>阅读进度: {editProgress}%</Label>
          <Slider value={[editProgress]} onValueChange={([v]) => setEditProgress(v)} max={100} step={1} />
        </div>
        <div className="space-y-2">
          <Label>阅读笔记</Label>
          <Textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={3} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
        <Button onClick={() => {
          updateBookmarkMutation.mutate({
            id: bookmarkEdit!.id,
            data: {
              title: editTitle || bookmarkEdit!.title,
              tags: editTags ? JSON.stringify(editTags.split(',').map(t => t.trim())) : bookmarkEdit!.tags,
              progress: editProgress,
              readingNote: editNote || bookmarkEdit!.readingNote,
            },
          })
          setEditDialogOpen(false)
        }}>保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  {/* 添加链接弹窗 */}
  <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
    <DialogContent>
      <DialogHeader><DialogTitle>添加链接</DialogTitle></DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>URL *</Label>
          <Input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-2">
          <Label>标题</Label>
          <Input value={addTitle} onChange={e => setAddTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>标签（逗号分隔）</Label>
          <Input value={addTags} onChange={e => setAddTags(e.target.value)} placeholder="AI, 科技" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
        <Button onClick={() => {
          if (!addUrl.trim()) { toast.error('请输入 URL'); return }
          createBookmarkMutation.mutate({
            url: addUrl.trim(),
            title: addTitle.trim() || undefined,
            tags: addTags ? addTags.split(',').map(t => t.trim()) : undefined,
          })
        }} disabled={createBookmarkMutation.isPending}>添加</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</TabsContent>
```

- [ ] **Step 4: 创建 BookmarkCard 组件**

在 CollectionsPage.tsx 文件内（或在同一文件底部）添加 BookmarkCard 组件：

```tsx
function BookmarkCard({
  bookmark,
  onStatusToggle,
  onArchive,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark
  onStatusToggle: () => void
  onArchive: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm hover:underline truncate flex items-center gap-1"
            >
              {bookmark.title || bookmark.url}
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            </a>
            <Badge variant={bookmark.readStatus === 'unread' ? 'default' : bookmark.readStatus === 'read' ? 'secondary' : 'outline'}>
              {bookmark.readStatus === 'unread' ? '未读' : bookmark.readStatus === 'read' ? '已读' : '归档'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{bookmark.url}</p>
          {bookmark.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2">{bookmark.summary}</p>
          )}
          {bookmark.tags && (
            <div className="flex flex-wrap gap-1 pt-1">
              {JSON.parse(bookmark.tags).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {bookmark.progress !== null && bookmark.progress !== undefined && bookmark.progress > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Progress value={bookmark.progress} className="h-1.5 w-24" />
              <span className="text-[10px] text-muted-foreground">{bookmark.progress}%</span>
            </div>
          )}
          {bookmark.readingNote && (
            <p className="text-xs text-muted-foreground italic line-clamp-1">📝 {bookmark.readingNote}</p>
          )}
        </div>
        <div className="relative shrink-0">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowMenu(!showMenu)}>
            <MoreHorizontal className="size-4" />
          </Button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border bg-popover p-1 shadow-md">
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => { onStatusToggle(); setShowMenu(false) }}>
                  <CheckCircle2 className="mr-2 size-3" />
                  {bookmark.readStatus === 'unread' ? '标记已读' : '标记未读'}
                </Button>
                {bookmark.readStatus !== 'archived' && (
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => { onArchive(); setShowMenu(false) }}>
                    <Archive className="mr-2 size-3" />
                    归档
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => { onEdit(); setShowMenu(false) }}>
                  编辑
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-destructive" onClick={() => { onDelete(); setShowMenu(false) }}>
                  删除
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: 确保所需的导入**

在 CollectionsPage.tsx 顶部添加缺失的导入：

```tsx
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Bookmark, Link as LinkIcon, ExternalLink, CheckCircle2, Archive, Plus, MoreHorizontal } from 'lucide-react'
```

---

## 功能 A：日历视图

### Task A1: 创建后端日历路由

**文件:**
- 创建: `backend/src/routes/calendar.ts`
- 修改: `backend/src/index.ts`

- [ ] **Step 1: 创建 calendar.ts 路由文件**

```typescript
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const calendar = new Hono<{ Bindings: Env }>()

// 获取指定月份的所有日历数据
calendar.get('/items', async (c) => {
  try {
    const month = c.req.query('month') // yyyy-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ error: '月份格式无效，请使用 yyyy-MM' }, 400)
    }

    const db = drizzle(c.env.DB, { schema })

    // 计算月份范围
    const monthStart = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`

    // 并行查询三个表
    const [taskRows, journalRows, habitRows] = await Promise.all([
      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          listId: schema.tasks.listId,
          isCompleted: schema.tasks.isCompleted,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .where(
          and(
            gte(schema.tasks.dueDate, monthStart),
            lte(schema.tasks.dueDate, monthEnd),
          ),
        ),

      db
        .select({
          id: schema.journalEntries.id,
          title: schema.journalEntries.title,
          mood: schema.journalEntries.mood,
          date: schema.journalEntries.date,
        })
        .from(schema.journalEntries)
        .where(
          and(
            gte(schema.journalEntries.date, monthStart),
            lte(schema.journalEntries.date, monthEnd),
          ),
        ),

      db
        .select({
          habitId: schema.habitCheckins.habitId,
          date: schema.habitCheckins.date,
          habitName: schema.habits.name,
        })
        .from(schema.habitCheckins)
        .innerJoin(schema.habits, eq(schema.habitCheckins.habitId, schema.habits.id))
        .where(
          and(
            gte(schema.habitCheckins.date, monthStart),
            lte(schema.habitCheckins.date, monthEnd),
          ),
        ),
    ])

    // 按天聚合
    const days: Record<string, { tasks: any[]; journals: any[]; habits: any[] }> = {}

    for (const task of taskRows) {
      const d = task.dueDate!
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].tasks.push(task)
    }

    for (const journal of journalRows) {
      const d = journal.date
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].journals.push(journal)
    }

    // 按天聚合习惯（同一天同一习惯多次打卡只计一次）
    const habitDaySet = new Set<string>()
    for (const habit of habitRows) {
      const key = `${habit.date}-${habit.habitId}`
      if (habitDaySet.has(key)) continue
      habitDaySet.add(key)
      const d = habit.date
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].habits.push({
        habitId: habit.habitId,
        habitName: habit.habitName,
      })
    }

    return c.json({ month, days })
  } catch (err) {
    console.error('Calendar error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

export default calendar
```

- [ ] **Step 2: 在 backend/src/index.ts 注册路由**

找到路由注册区域，在 `app.route('/api/backup', backup)` 之后添加：

```typescript
import calendar from './routes/calendar'
// ...
app.route('/api/calendar', calendar)
```

### Task A2: 创建前端 CalendarPage

**文件:**
- 创建: `frontend/src/pages/CalendarPage.tsx`
- 创建: `frontend/src/lib/api/calendar.ts`
- 修改: `frontend/src/router.tsx`
- 修改: `frontend/src/components/AppLayout.tsx`

- [ ] **Step 1: 创建 API 客户端**

```typescript
// frontend/src/lib/api/calendar.ts
import { api } from './client'

export interface CalendarTask {
  id: string
  title: string
  listId: string
  isCompleted: boolean
  dueDate: string
}

export interface CalendarJournal {
  id: string
  title: string
  mood: string | null
  date: string
}

export interface CalendarHabit {
  habitId: string
  habitName: string
}

export interface CalendarDay {
  tasks: CalendarTask[]
  journals: CalendarJournal[]
  habits: CalendarHabit[]
}

export interface CalendarMonthData {
  month: string
  days: Record<string, CalendarDay>
}

export const calendarApi = {
  getMonth: (month: string) =>
    api.get(`calendar/items?month=${month}`).json<CalendarMonthData>(),
}
```

- [ ] **Step 2: 创建 CalendarPage 组件**

```tsx
// frontend/src/pages/CalendarPage.tsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays, ListTodo, BookHeart, Flame } from 'lucide-react'
import { calendarApi, type CalendarDay } from '@/lib/api/calendar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarPage() {
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
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    return {
      date: i + 1,
      dateStr,
      isToday: dateStr === todayStr,
      dayData: data?.days[dateStr],
    }
  })

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
            <ErrorState message="加载失败" onRetry={refetch} />
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
```

- [ ] **Step 3: 在 router.tsx 添加路由**

```tsx
// 在文件顶部添加导入
const CalendarPage = lazyImport(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.default })),
)

// 在路由 children 数组中添加
{ path: 'calendar', element: <RouteBoundary><CalendarPage /></RouteBoundary> },
```

- [ ] **Step 4: 在 AppLayout.tsx 添加导航项**

在 `coreNavItems` 数组中"AI 聊天"之后添加：

```tsx
{ title: '日历', href: '/calendar', icon: CalendarDays },
```

并导入 `CalendarDays` icon（如果尚未导入）。

---

## 功能 B：专注 AI 分析

### Task B1: 创建后端 AI 分析端点

**文件:**
- 修改: `backend/src/routes/focus.ts`

- [ ] **Step 1: 添加 AI 分析端点**

在 focus.ts 末尾添加（在 `export default focus` 之前）：

```typescript
// AI 专注分析
focus.get('/ai-analysis', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })

    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('focus_ai_analysis')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    // 2. 读取最近 30 天已完成的专注会话
    const today = todayCST()
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 29)
    const fromDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const sessions = await db
      .select()
      .from(schema.focusSessions)
      .where(
        and(
          gte(schema.focusSessions.startedAt, fromDate),
          eq(schema.focusSessions.completed, true),
        ),
      )
      .orderBy(schema.focusSessions.startedAt)

    if (sessions.length === 0) {
      return c.json({
        generatedAt: nowBeijing(),
        fromCache: false,
        report: {
          summary: '过去 30 天没有专注记录，开始一个番茄钟来生成分析吧！',
          dailyTrend: '暂无数据',
          peakHours: '暂无数据',
          topTasks: [],
          suggestions: ['开始你的第一个番茄钟'],
        },
      })
    }

    // 3. 计算统计数据
    const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0)
    const totalSessions = sessions.length
    const avgMinutes = Math.round(totalMinutes / totalSessions)

    // 按天聚合
    const dailyMap: Record<string, number> = {}
    for (const s of sessions) {
      const day = s.startedAt.slice(0, 10)
      dailyMap[day] = (dailyMap[day] || 0) + s.minutes
    }
    const daysWithData = Object.keys(dailyMap).length

    // 按小时聚合
    const hourlyMap: Record<string, number> = {}
    for (const s of sessions) {
      const hour = s.startedAt.slice(11, 13)
      hourlyMap[hour] = (hourlyMap[hour] || 0) + s.minutes
    }
    const sortedHours = Object.entries(hourlyMap).sort((a, b) => b[1] - a[1])
    const peakHour = sortedHours.length > 0 ? sortedHours[0][0] : '?'

    // 按任务聚合
    const taskMap: Record<string, { minutes: number; count: number }> = {}
    for (const s of sessions) {
      const key = s.taskTitle || '未关联任务'
      if (!taskMap[key]) taskMap[key] = { minutes: 0, count: 0 }
      taskMap[key].minutes += s.minutes
      taskMap[key].count += 1
    }
    const topTasks = Object.entries(taskMap)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 5)
      .map(([taskTitle, data]) => ({
        taskTitle,
        totalMinutes: data.minutes,
        sessionCount: data.count,
      }))

    // 4. 构建 AI prompt
    const prompt = `你是一个专注力分析助手。分析以下专注数据，用中文生成简短报告。

数据概览：
- 总专注时长：${totalMinutes} 分钟
- 总会话数：${totalSessions} 次
- 平均每次：${avgMinutes} 分钟
- 有专注记录的天数：${daysWithData} 天
- 最活跃时段：${peakHour}:00 左右

按小时分布（小时:分钟）：
${Object.entries(hourlyMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, m]) => `  ${h}:00 — ${m}分钟`).join('\n')}

按任务分布：
${topTasks.map(t => `  ${t.taskTitle} — ${t.totalMinutes}分钟（${t.sessionCount}次）`).join('\n')}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结（30 字以内）
2. 每日趋势判断（上升/下降/稳定）
3. 效率时段分析（哪个时段最高效）
4. 2-3 条可操作建议`

    // 5. 调用 AI
    const aiConfig = await getDefaultAiConfig(c.env)

    let reportText: string
    if (aiConfig) {
      // 使用用户配置的 AI
      const response = await fetch(aiConfig.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
      })
      const data = await response.json() as any
      reportText = data.choices?.[0]?.message?.content || 'AI 分析暂时不可用'
    } else {
      // 使用 Workers AI
      const aiResp = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }) as any
      reportText = aiResp.response || 'AI 分析暂时不可用'
    }

    // 6. 解析 AI 输出
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '专注数据分析完成'
    const dailyTrend = lines[1] || '请查看详细数据'
    const peakHours = lines[2] || '请查看详细数据'
    const suggestions = lines.slice(3).filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))

    const report = {
      summary,
      dailyTrend,
      peakHours,
      topTasks,
      suggestions: suggestions.length > 0 ? suggestions : ['保持专注，继续加油！'],
    }

    // 7. 缓存到 KV（1 小时）
    const result = { generatedAt: nowBeijing(), fromCache: false, report }
    await c.env.CACHE.put('focus_ai_analysis', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Focus AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})
```

- [ ] **Step 2: 添加缺失的导入**

在 focus.ts 顶部添加需要的导入：

```typescript
import { getDefaultAiConfig } from '../ai-configs'
```

确保 `getDefaultAiConfig` 函数已从 `../ai-configs` 正确导出。

### Task B2: 前端添加 AI 分析面板

**文件:**
- 修改: `frontend/src/pages/FocusPage.tsx`
- 修改: `frontend/src/lib/api/focus.ts`

- [ ] **Step 1: 在 focus.ts API 中添加方法**

```typescript
export interface FocusAiReport {
  summary: string
  dailyTrend: string
  peakHours: string
  topTasks: { taskTitle: string; totalMinutes: number; sessionCount: number }[]
  suggestions: string[]
}

export interface FocusAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: FocusAiReport
}

// 在 focusApi 对象中添加
aiAnalysis: () => api.get('focus/ai-analysis').json<FocusAiAnalysis>(),
```

- [ ] **Step 2: 在 FocusPage 添加 AI 分析区域**

在 FocusPage 中找到合适的位置（如统计卡片下方），添加：

```tsx
// 导入
import { Sparkles, Brain, TrendingUp, Clock, Target, Lightbulb, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { focusApi, type FocusAiAnalysis } from '@/lib/api/focus'

// 在组件内添加
const { data: aiAnalysis, isLoading: aiLoading, error: aiError, refetch: refetchAi } = useQuery({
  queryKey: ['focus-ai-analysis'],
  queryFn: () => focusApi.aiAnalysis(),
  staleTime: 5 * 60 * 1000, // 5 分钟内不重新获取
})

// JSX 中 AI 分析区域
{aiAnalysis && (
  <Card className="mt-4">
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Brain className="size-4 text-purple-500" />
        AI 专注分析
      </CardTitle>
      <div className="flex items-center gap-2">
        {aiAnalysis.fromCache && (
          <span className="text-[10px] text-muted-foreground">缓存</span>
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={() => refetchAi()} disabled={aiLoading}>
          <RefreshCw className={cn('size-3.5', aiLoading && 'animate-spin')} />
        </Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 pt-0">
      <p className="text-sm">{aiAnalysis.report.summary}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="size-3" /> 每日趋势
          </div>
          <p className="text-sm">{aiAnalysis.report.dailyTrend}</p>
        </div>
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Clock className="size-3" /> 效率时段
          </div>
          <p className="text-sm">{aiAnalysis.report.peakHours}</p>
        </div>
      </div>
      {aiAnalysis.report.topTasks.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Target className="size-3" /> 任务投入 TOP {aiAnalysis.report.topTasks.length}
          </div>
          <div className="space-y-1.5">
            {aiAnalysis.report.topTasks.map((task, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{task.taskTitle}</span>
                <span className="shrink-0 text-xs text-muted-foreground ml-2">
                  {task.totalMinutes}分钟 / {task.sessionCount}次
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
          <Lightbulb className="size-3" /> AI 建议
        </div>
        <ul className="space-y-1">
          {aiAnalysis.report.suggestions.map((s, i) => (
            <li key={i} className="text-sm flex items-start gap-2">
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-purple-500" />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[10px] text-muted-foreground">
        分析基于最近 30 天专注数据 · 生成于 {aiAnalysis.generatedAt.slice(0, 16)}
      </p>
    </CardContent>
  </Card>
)}
```

---

## 验证步骤

1. **稍后读**: 打开收藏页 → 切换到"稍后读"标签 → 验证列表加载、筛选、编辑、删除功能正常
2. **日历视图**: 打开日历页 → 验证月视图显示正确 → 点击日期查看详情 → 切换月份 → 点击"今天"返回
3. **专注 AI 分析**: 打开专注页 → 验证 AI 分析卡片加载 → 点击刷新按钮 → 检查缓存标识
4. 全部三个功能完成后执行 `npm run build` 确保无编译错误