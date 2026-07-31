import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Flame, Loader2, Plus, Check, Trash2, Pencil, CheckCheck, Target } from 'lucide-react'
import { toast } from 'sonner'
import { habitsApi, type Habit } from '@/lib/api'
import { ActivityCalendar } from 'react-activity-calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type HeatItem = { date: string; count: number; level: number }

function countToLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

const HABIT_COLORS = [
  { name: '紫罗兰', value: '#7C3AED' },
  { name: '翡翠绿', value: '#10B981' },
  { name: '琥珀', value: '#F59E0B' },
  { name: '玫瑰红', value: '#F43F5E' },
  { name: '天蓝', value: '#3B82F6' },
  { name: '橙色', value: '#F97316' },
]

const HABIT_ICONS = ['💧', '📚', '🏃', '🧘', '🌅', '✍️', '🎯', '💪', '🌙', '🥗', '💻', '🎨']

export function HabitsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [deleting, setDeleting] = useState<Habit | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(HABIT_ICONS[0])
  const [color, setColor] = useState(HABIT_COLORS[0].value)
  const [description, setDescription] = useState('')

  const { data: habits, isLoading } = useQuery({
    queryKey: ['habits'],
    queryFn: habitsApi.list,
  })

  const { data: calendar } = useQuery({
    queryKey: ['habits', 'calendar'],
    queryFn: () => habitsApi.calendar(365),
  })

  const heatData: HeatItem[] = useMemo(
    () =>
      (calendar ?? []).map((d) => ({
        date: d.date,
        count: d.count,
        level: countToLevel(d.count),
      })),
    [calendar],
  )

  const totalStreakToday = habits?.filter((h) => h.doneToday).length ?? 0

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? habitsApi.update(editing.id, { name, icon, color, description })
        : habitsApi.create({ name, icon, color, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      toast.success(editing ? '习惯已更新' : '习惯已创建')
      setCreateOpen(false)
      setEditing(null)
      setName('')
      setIcon(HABIT_ICONS[0])
      setColor(HABIT_COLORS[0].value)
      setDescription('')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const checkinMutation = useMutation({
    mutationFn: (habitId: string) => habitsApi.checkin(habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      queryClient.invalidateQueries({ queryKey: ['habits', 'calendar'] })
    },
    onError: (err: Error) => toast.error(`操作失败: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (habitId: string) => habitsApi.remove(habitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      queryClient.invalidateQueries({ queryKey: ['habits', 'calendar'] })
      toast.success('习惯已删除')
      setDeleting(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const openCreate = () => {
    setEditing(null)
    setName('')
    setIcon(HABIT_ICONS[0])
    setColor(HABIT_COLORS[0].value)
    setDescription('')
    setCreateOpen(true)
  }

  const openEdit = (habit: Habit) => {
    setEditing(habit)
    setName(habit.name)
    setIcon(habit.icon ?? HABIT_ICONS[0])
    setColor(habit.color ?? HABIT_COLORS[0].value)
    setDescription(habit.description ?? '')
    setCreateOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-orange-500 to-red-500 md:size-10">
            <Flame className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">习惯打卡</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              每天一点点，坚持看得见
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1 rounded-lg">
          <Plus className="size-4" />
          新建习惯
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 md:p-6">
          {isLoading ? (
            <div className="empty-state py-20">
              <Loader2 className="mb-4 size-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : !habits || habits.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="还没有习惯"
              description="创建一个习惯，比如「每天喝 8 杯水」「阅读 30 分钟」，开始你的坚持之旅"
              action={
                <Button size="sm" onClick={openCreate} className="gap-1 rounded-lg">
                  <Plus className="size-4" />
                  创建第一个习惯
                </Button>
              }
            />
          ) : (
            <>
              {/* 概览统计 */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                  label="习惯总数"
                  value={habits.length}
                  icon={Target}
                  color="text-indigo-500"
                  bg="bg-indigo-500/10"
                  gradient="from-indigo-500 to-violet-500"
                />
                <StatCard
                  label="今日已打卡"
                  value={totalStreakToday}
                  icon={CheckCheck}
                  color="text-emerald-500"
                  bg="bg-emerald-500/10"
                  gradient="from-emerald-500 to-teal-500"
                />
                <StatCard
                  label="总打卡次数"
                  value={habits.reduce((sum, h) => sum + h.total, 0)}
                  icon={Check}
                  color="text-amber-500"
                  bg="bg-amber-500/10"
                  gradient="from-amber-500 to-orange-500"
                />
                <StatCard
                  label="最高连续"
                  value={Math.max(0, ...habits.map((h) => h.streak))}
                  icon={Flame}
                  color="text-rose-500"
                  bg="bg-rose-500/10"
                  gradient="from-rose-500 to-pink-500"
                />
              </div>

              {/* 打卡热力图 */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-orange-500/10">
                      <Flame className="size-3.5 text-orange-500" />
                    </div>
                    打卡日历
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {heatData.length > 0 ? (
                    <div className="w-full overflow-x-auto">
                      <ActivityCalendar
                        data={heatData}
                        maxLevel={4}
                        theme={{
                          light: ['#ebedf0', '#fed7aa', '#fdba74', '#f97316', '#ea580c'],
                          dark: ['#1f2937', '#7c2d12', '#9a3412', '#c2410c', '#ea580c'],
                        }}
                        labels={{
                          totalCount: '{{count}} 次打卡',
                          legend: { less: '少', more: '多' },
                        }}
                      />
                    </div>
                  ) : (
                    <p className="py-10 text-center text-xs text-muted-foreground">暂无打卡记录</p>
                  )}
                </CardContent>
              </Card>

              {/* 习惯列表 */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {habits.map((habit) => (
                  <Card
                    key={habit.id}
                    className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <CardContent className="relative p-4">
                      <div
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ background: `linear-gradient(90deg, ${habit.color ?? '#7C3AED'}, transparent)` }}
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
                            style={{ background: `${habit.color ?? '#7C3AED'}1a` }}
                          >
                            {habit.icon ?? '✨'}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{habit.name}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <Flame className="size-3.5 text-orange-500" />
                              <span className="font-medium text-foreground">{habit.streak}</span>
                              天连续 · 共 {habit.total} 次
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md"
                            onClick={() => openEdit(habit)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-destructive hover:text-destructive"
                            onClick={() => setDeleting(habit)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {habit.description && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {habit.description}
                        </p>
                      )}

                      <Button
                        size="sm"
                        variant={habit.doneToday ? 'default' : 'outline'}
                        className={cn(
                          'mt-3 w-full gap-1.5 rounded-lg',
                          habit.doneToday && 'bg-emerald-600 hover:bg-emerald-700',
                        )}
                        onClick={() => checkinMutation.mutate(habit.id)}
                        disabled={checkinMutation.isPending}
                      >
                        {checkinMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : habit.doneToday ? (
                          <Check className="size-4" />
                        ) : (
                          <CheckCheck className="size-4" />
                        )}
                        {habit.doneToday ? '今日已完成' : '打卡'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* 新建/编辑对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑习惯' : '新建习惯'}</DialogTitle>
            <DialogDescription>
              {editing ? '修改习惯的名称、图标或颜色' : '创建一个小而美的日常习惯'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">名称</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：阅读 30 分钟"
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">图标</label>
              <div className="flex flex-wrap gap-1.5">
                {HABIT_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg border text-lg transition-colors',
                      icon === ic
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">颜色</label>
              <div className="flex flex-wrap gap-1.5">
                {HABIT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.name}
                    className={cn(
                      'size-7 rounded-full border-2 border-white/60 transition-transform',
                      color === c.value && 'scale-110 ring-2 ring-primary ring-offset-2',
                    )}
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">描述（可选）</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="记录这个习惯的目标或心得"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saveMutation.isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !name.trim()}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> 保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除习惯</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleting?.name}」吗？它的全部打卡记录也会被删除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleting) deleteMutation.mutate(deleting.id)
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  gradient,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  bg: string
  gradient: string
}) {
  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="relative p-5">
        <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', gradient)} />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
          </div>
          <div className={cn('flex size-9 items-center justify-center rounded-xl', bg)}>
            <Icon className={cn('size-4', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
