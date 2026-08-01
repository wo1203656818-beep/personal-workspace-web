import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Plus, Loader2, Trash2, Pencil, Calendar, Clock, Check,
  TrendingUp, PartyPopper, Archive, ChartLine, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { goalsApi, type Goal, type Countdown } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'

// 庆祝动画组件
function CelebrationOverlay({ show, onEnd }: { show: boolean; onEnd: () => void }) {
  const emojis = ['🎉', '🎊', '✨', '🌟', '🏆', '💪', '🎯', '🔥']
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center',
        show ? 'animate-in fade-in zoom-in-50 duration-500' : 'hidden',
      )}
      onAnimationEnd={onEnd}
    >
      <div className="text-center">
        <div className="animate-bounce text-6xl">🎉</div>
        <p className="mt-2 animate-pulse text-lg font-bold text-emerald-500">目标达成！</p>
        <div className="mt-2 flex animate-pulse justify-center gap-2 text-2xl">
          {emojis.slice(0, 4).map((e, i) => (
            <span key={i} className="inline-block animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}>
              {e}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// 进度趋势图（简化版 sparkline）
function ProgressSparkline({ snapshots }: { snapshots: { date: string; pct: number }[] }) {
  if (snapshots.length < 2) return null
  const max = Math.max(...snapshots.map((s) => s.pct), 1)
  const min = Math.min(...snapshots.map((s) => s.pct), 0)
  const range = max - min || 1
  const w = 120
  const h = 32
  const points = snapshots.map((s, i) => {
    const x = (i / (snapshots.length - 1)) * w
    const y = h - ((s.pct - min) / range) * h
    return `${x},${y}`
  })
  const pathD = `M${points.join(' L')}`
  return (
    <div className="mt-1">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" />
        {snapshots.map((s, i) => {
          const x = (i / (snapshots.length - 1)) * w
          const y = h - ((s.pct - min) / range) * h
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="2"
              className={i === snapshots.length - 1 ? 'fill-emerald-500' : 'fill-muted-foreground/30'}
            />
          )
        })}
      </svg>
    </div>
  )
}

export function GoalsPage() {
  usePageTitle('目标')
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('goals')
  const [createOpen, setCreateOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null)
  const [deleteCountdown, setDeleteCountdown] = useState<Countdown | null>(null)

  // 目标表单
  const [title, setTitle] = useState('')
  const [goalIcon, setGoalIcon] = useState('🎯')
  const [goalColor, setGoalColor] = useState('#7C3AED')
  const [description, setDescription] = useState('')
  const [currentValue, setCurrentValue] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [unit, setUnit] = useState('')
  const [targetDate, setTargetDate] = useState('')

  // 倒数日表单
  const [cdTitle, setCdTitle] = useState('')
  const [cdDate, setCdDate] = useState('')
  const [cdNote, setCdNote] = useState('')
  const [cdColor, setCdColor] = useState('#6366f1')
  const [cdIsYearly, setCdIsYearly] = useState(false)
  const [cdOpen, setCdOpen] = useState(false)

  // 庆祝动画
  const [celebrating, setCelebrating] = useState(false)

  // 内联编辑进度
  const [editingProgress, setEditingProgress] = useState<string | null>(null)
  const [progressInput, setProgressInput] = useState('')
  const progressInputRef = useRef<HTMLInputElement>(null)

  // 进度快照（localStorage 持久化）
  const [progressSnapshots, setProgressSnapshots] = useState<Record<string, { date: string; pct: number }[]>>(() => {
    try {
      const saved = localStorage.getItem('goal-progress-snapshots')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem('goal-progress-snapshots', JSON.stringify(progressSnapshots))
  }, [progressSnapshots])

  useEffect(() => {
    if (editingProgress && progressInputRef.current) {
      progressInputRef.current.focus()
      progressInputRef.current.select()
    }
  }, [editingProgress])

  const { data: goals, isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: goalsApi.list,
  })

  const { data: countdowns, isLoading: cdLoading } = useQuery({
    queryKey: ['countdowns'],
    queryFn: goalsApi.countdowns.list,
  })

  const { data: aiAnalysis, isLoading: aiLoading, isError: aiError, refetch: refetchAi } = useQuery({
    queryKey: ['goals', 'ai-analysis'],
    queryFn: goalsApi.aiAnalysis,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  })

  // 下一个最近的倒数日
  const nextCountdown = useMemo(() => {
    if (!countdowns || countdowns.length === 0) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let nearest: { cd: Countdown; days: number } | null = null
    for (const cd of countdowns) {
      const target = new Date(cd.date + 'T00:00:00')
      let diff: number
      if (cd.isYearly) {
        const next = new Date(today.getFullYear(), target.getMonth(), target.getDate())
        if (next < today) next.setFullYear(next.getFullYear() + 1)
        diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      } else {
        diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      }
      if (diff < 0) continue
      if (!nearest || diff < nearest.days) {
        nearest = { cd, days: diff }
      }
    }
    return nearest
  }, [countdowns])

  const saveGoalMutation = useMutation({
    mutationFn: () =>
      editGoal
        ? goalsApi.update(editGoal.id, {
            title,
            icon: goalIcon,
            color: goalColor,
            description,
            currentValue: currentValue ? parseFloat(currentValue) : undefined,
            targetValue: targetValue ? parseFloat(targetValue) : undefined,
            unit: unit || undefined,
            targetDate: targetDate || undefined,
          })
        : goalsApi.create({
            title,
            icon: goalIcon,
            color: goalColor,
            description,
            currentValue: currentValue ? parseFloat(currentValue) : undefined,
            targetValue: targetValue ? parseFloat(targetValue) : undefined,
            unit: unit || undefined,
            targetDate: targetDate || undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success(editGoal ? '目标已更新' : '目标已创建')
      resetGoalForm()
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const deleteGoalMutation = useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      toast.success('目标已删除')
      setDeleteGoal(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Goal> }) => goalsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    },
    onError: (err: Error) => toast.error(`操作失败: ${err.message}`),
  })

  const saveCdMutation = useMutation({
    mutationFn: () =>
      goalsApi.countdowns.create({
        title: cdTitle,
        date: cdDate,
        note: cdNote || undefined,
        color: cdColor,
        isYearly: cdIsYearly,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countdowns'] })
      toast.success('倒数日已创建')
      setCdOpen(false)
      setCdTitle('')
      setCdDate('')
      setCdNote('')
      setCdIsYearly(false)
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const deleteCdMutation = useMutation({
    mutationFn: (id: string) => goalsApi.countdowns.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countdowns'] })
      toast.success('倒数日已删除')
      setDeleteCountdown(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const resetGoalForm = () => {
    setCreateOpen(false)
    setEditGoal(null)
    setTitle('')
    setGoalIcon('🎯')
    setGoalColor('#7C3AED')
    setDescription('')
    setCurrentValue('')
    setTargetValue('')
    setUnit('')
    setTargetDate('')
  }

  const openEditGoal = (g: Goal) => {
    setEditGoal(g)
    setTitle(g.title)
    setGoalIcon(g.icon ?? '🎯')
    setGoalColor(g.color ?? '#7C3AED')
    setDescription(g.description ?? '')
    setCurrentValue(g.currentValue?.toString() ?? '')
    setTargetValue(g.targetValue?.toString() ?? '')
    setUnit(g.unit ?? '')
    setTargetDate(g.targetDate ?? '')
    setCreateOpen(true)
  }

  const openCreateGoal = () => {
    setEditGoal(null)
    resetGoalForm()
    setCreateOpen(true)
  }

  const handleMarkDone = (g: Goal) => {
    updateGoalMutation.mutate(
      { id: g.id, data: { status: 'done' } },
      {
        onSuccess: () => {
          setCelebrating(true)
          toast.success(`「${g.title}」目标达成！🎉`)
          setTimeout(() => setCelebrating(false), 2000)
        },
      },
    )
  }

  const handleArchive = (g: Goal) => {
    const newStatus = g.status === 'archived' ? 'active' : 'archived'
    updateGoalMutation.mutate(
      { id: g.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast.success(newStatus === 'archived' ? '目标已归档' : '目标已恢复')
        },
      },
    )
  }

  const handleProgressUpdate = (g: Goal, value: string) => {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) {
      toast.error('请输入有效的数值')
      return
    }
    const pct = g.targetValue && g.targetValue > 0 ? Math.round((num / g.targetValue) * 100) : 0
    updateGoalMutation.mutate(
      { id: g.id, data: { currentValue: num } },
      {
        onSuccess: () => {
          // 保存进度快照
          setProgressSnapshots((prev) => {
            const key = g.id
            const existing = prev[key] ?? []
            const last = existing[existing.length - 1]
            // 避免同一天重复记录
            const today = new Date().toISOString().split('T')[0]
            if (last && last.date === today) {
              existing[existing.length - 1] = { date: today, pct }
            } else {
              existing.push({ date: today, pct })
            }
            return { ...prev, [key]: existing.slice(-30) } // 保留最近30条
          })
          toast.success('进度已更新')
        },
      },
    )
    setEditingProgress(null)
  }

  const activeGoals = goals?.filter((g) => g.status === 'active') ?? []
  const doneGoals = goals?.filter((g) => g.status === 'done') ?? []
  const archivedGoals = goals?.filter((g) => g.status === 'archived') ?? []

  return (
    <div className="flex h-full flex-col">
      <CelebrationOverlay show={celebrating} onEnd={() => setCelebrating(false)} />

      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-violet-500 to-purple-500 md:size-10">
            <Target className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">目标</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">OKR 进度与倒数日</p>
          </div>
        </div>
        {/* 下一个倒计时小组件 */}
        {nextCountdown && (
          <div className="hidden items-center gap-2 rounded-lg border bg-card/80 px-3 py-1.5 shadow-sm sm:flex">
            <Clock className="size-4 text-indigo-500" />
            <span className="text-xs text-muted-foreground">{nextCountdown.cd.title}</span>
            <span className="text-sm font-bold" style={{ color: nextCountdown.cd.color ?? '#6366f1' }}>
              {nextCountdown.days === 0 ? '今天！' : `${nextCountdown.days} 天`}
            </span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 md:p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger value="goals" className="gap-1.5">
                <Target className="size-4" />目标
              </TabsTrigger>
              <TabsTrigger value="countdowns" className="gap-1.5">
                <Clock className="size-4" />倒数日
              </TabsTrigger>
            </TabsList>

            <TabsContent value="goals" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {activeGoals.length} 个进行中 · {doneGoals.length} 个已完成
                  {archivedGoals.length > 0 && ` · ${archivedGoals.length} 个已归档`}
                </p>
                <Button size="sm" onClick={openCreateGoal} className="gap-1 rounded-lg">
                  <Plus className="size-4" />新建目标
                </Button>
              </div>

              {goalsLoading ? (
                <div className="empty-state py-16">
                  <Loader2 className="mb-4 size-8 animate-spin text-primary" />
                </div>
              ) : !goals || goals.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="还没有目标"
                  description="设定一个目标，开始追踪你的进步"
                  action={
                    <Button size="sm" onClick={openCreateGoal} className="gap-1 rounded-lg">
                      <Plus className="size-4" />创建第一个目标
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {goals
                    .filter((g) => g.status !== 'archived')
                    .map((g) => {
                      const progress =
                        g.targetValue && g.targetValue > 0
                          ? Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100))
                          : 0
                      const snapshots = progressSnapshots[g.id] ?? []
                      return (
                        <Card
                          key={g.id}
                          className={cn(
                            'group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md',
                            g.status === 'done' && 'border-emerald-500/30 bg-emerald-500/5',
                          )}
                        >
                          <CardContent className="relative p-4">
                            <div
                              className="absolute inset-x-0 top-0 h-1"
                              style={{
                                background: `linear-gradient(90deg, ${g.color ?? '#7C3AED'}, transparent)`,
                              }}
                            />
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
                                  style={{ background: `${g.color ?? '#7C3AED'}1a` }}
                                >
                                  {g.icon ?? '🎯'}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">
                                    {g.title}
                                    {g.status === 'done' && (
                                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500">
                                        <Check className="size-3" /> 已完成
                                      </span>
                                    )}
                                  </p>
                                  {g.description && (
                                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                      {g.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 opacity-100">
                                {g.status === 'active' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-md text-emerald-500 hover:text-emerald-600"
                                    onClick={() => handleMarkDone(g)}
                                    title="标记完成"
                                  >
                                    <PartyPopper className="size-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 rounded-md"
                                  onClick={() => openEditGoal(g)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 rounded-md"
                                  onClick={() => handleArchive(g)}
                                  title={g.status === 'archived' ? '恢复' : '归档'}
                                >
                                  <Archive className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 rounded-md text-destructive"
                                  onClick={() => setDeleteGoal(g)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>

                            {(g.targetValue || g.targetDate) && (
                              <div className="mt-3 space-y-2">
                                {g.targetValue && g.targetValue > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">
                                        {g.currentValue ?? 0}
                                        {g.unit ?? ''} / {g.targetValue}
                                        {g.unit ?? ''}
                                      </span>
                                      <span className="font-medium">{progress}%</span>
                                    </div>
                                    {/* 可点击的进度条：点击编辑当前值 */}
                                    <div
                                      className="h-1.5 cursor-pointer rounded-full bg-muted"
                                      onClick={() => {
                                        if (g.status === 'active') {
                                          setEditingProgress(g.id)
                                          setProgressInput((g.currentValue ?? 0).toString())
                                        }
                                      }}
                                      title={g.status === 'active' ? '点击修改进度' : undefined}
                                    >
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${progress}%`,
                                          background: g.color ?? '#7C3AED',
                                        }}
                                      />
                                    </div>
                                    {/* 内联编辑输入框 */}
                                    {editingProgress === g.id && (
                                      <div className="flex items-center gap-1.5">
                                        <Input
                                          ref={progressInputRef}
                                          type="number"
                                          step="0.1"
                                          value={progressInput}
                                          onChange={(e) => setProgressInput(e.target.value)}
                                          className="h-7 text-xs"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleProgressUpdate(g, progressInput)
                                            if (e.key === 'Escape') setEditingProgress(null)
                                          }}
                                        />
                                        <Button
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => handleProgressUpdate(g, progressInput)}
                                          disabled={updateGoalMutation.isPending}
                                        >
                                          确定
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => setEditingProgress(null)}
                                        >
                                          取消
                                        </Button>
                                      </div>
                                    )}
                                    {/* 进度趋势图 */}
                                    {snapshots.length >= 2 && (
                                      <div className="pt-1">
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                          <ChartLine className="size-3" />
                                          进度趋势
                                        </div>
                                        <ProgressSparkline snapshots={snapshots} />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {g.targetDate && (
                                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="size-3" />
                                    截止 {g.targetDate}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                              {g.status === 'done' ? (
                                <span className="flex items-center gap-1 text-emerald-500">
                                  <Check className="size-3" /> 已完成
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="size-3" /> 进行中
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              )}

              {/* AI 分析卡片 */}
              <Card className="overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-transparent to-purple-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-violet-500" />
                      <span className="text-sm font-medium">AI 分析</span>
                    </div>
                    {!aiLoading && !aiError && aiAnalysis && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 rounded-md"
                        onClick={() => refetchAi()}
                        title="刷新分析"
                      >
                        <Loader2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-3">
                    {aiLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <Loader2 className="size-4 animate-spin text-violet-500" />
                        <span className="text-xs text-muted-foreground">AI 正在分析你的目标...</span>
                      </div>
                    ) : aiError ? (
                      <div className="flex items-center gap-2 py-2">
                        <span className="text-xs text-destructive">分析加载失败</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => refetchAi()}
                        >
                          重试
                        </Button>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed text-foreground/90">
                          {aiAnalysis.report.summary}
                        </p>
                        {aiAnalysis.report.suggestions.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">建议：</p>
                            <ul className="space-y-1">
                              {aiAnalysis.report.suggestions.map((s, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                                  <span className="mt-1 inline-block size-1 shrink-0 rounded-full bg-violet-500" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-sm font-medium text-violet-500">
                          {aiAnalysis.report.encouragement}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">
                          生成于 {new Date(aiAnalysis.generatedAt).toLocaleString('zh-CN')}
                          {aiAnalysis.fromCache && '（缓存）'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="countdowns" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{countdowns?.length ?? 0} 个倒数日</p>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setCdOpen(true)} className="gap-1 rounded-lg">
                    <Plus className="size-4" />新建倒数日
                  </Button>
                </div>
              </div>

              {/* Upcoming birthdays */}
              {countdowns &&
                countdowns.filter((cd) => {
                  if (!cd.isYearly) return false
                  const target = new Date(cd.date + 'T00:00:00')
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const next = new Date(today.getFullYear(), target.getMonth(), target.getDate())
                  if (next < today) next.setFullYear(next.getFullYear() + 1)
                  const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  return diff >= 0 && diff <= 7
                }).length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-500">
                      🎂 即将到来的生日
                    </h3>
                    <div className="space-y-2">
                      {countdowns
                        .filter((cd) => {
                          if (!cd.isYearly) return false
                          const target = new Date(cd.date + 'T00:00:00')
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          const next = new Date(today.getFullYear(), target.getMonth(), target.getDate())
                          if (next < today) next.setFullYear(next.getFullYear() + 1)
                          const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                          return diff >= 0 && diff <= 7
                        })
                        .map((cd) => {
                          const target = new Date(cd.date + 'T00:00:00')
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          const next = new Date(today.getFullYear(), target.getMonth(), target.getDate())
                          if (next < today) next.setFullYear(next.getFullYear() + 1)
                          const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                          return (
                            <div key={cd.id} className="flex items-center gap-3">
                              <span className="text-lg">🎉</span>
                              <div className="flex-1">
                                <span className="text-sm font-medium">{cd.title}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {diff === 0 ? '就是今天！' : `还有 ${diff} 天`}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

              {cdLoading ? (
                <div className="empty-state py-16">
                  <Loader2 className="mb-4 size-8 animate-spin text-primary" />
                </div>
              ) : !countdowns || countdowns.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="还没有倒数日"
                  description="添加一个重要的日子"
                  action={
                    <Button size="sm" onClick={() => setCdOpen(true)} className="gap-1 rounded-lg">
                      <Plus className="size-4" />添加第一个倒数日
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {countdowns.map((cd) => {
                    const target = new Date(cd.date + 'T00:00:00')
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    let diff: number
                    if (cd.isYearly) {
                      const next = new Date(today.getFullYear(), target.getMonth(), target.getDate())
                      if (next < today) next.setFullYear(next.getFullYear() + 1)
                      diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    } else {
                      diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                    }
                    const isPast = !cd.isYearly && diff < 0
                    return (
                      <Card
                        key={cd.id}
                        className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <CardContent className="relative p-4">
                          <div
                            className="absolute inset-x-0 top-0 h-1"
                            style={{
                              background: `linear-gradient(90deg, ${cd.color ?? '#6366f1'}, transparent)`,
                            }}
                          />
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">
                                {cd.title}
                                {cd.isYearly && (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                                    🎂 每年
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{cd.date}</p>
                              {cd.note && (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                  {cd.note}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 rounded-md text-destructive md:opacity-0 md:group-hover:opacity-100 opacity-100"
                              onClick={() => setDeleteCountdown(cd)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <div
                              className="flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold"
                              style={{
                                background: `${cd.color ?? '#6366f1'}15`,
                                color: cd.color ?? '#6366f1',
                              }}
                            >
                              {Math.abs(diff)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isPast ? '天前' : '天后'}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* 新建/编辑目标对话框 */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetGoalForm() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editGoal ? '编辑目标' : '新建目标'}</DialogTitle>
            <DialogDescription>
              {editGoal ? '修改目标信息' : '设定一个可量化的目标'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">目标名称</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="如：三个月减重 5kg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">图标</label>
                <Input
                  value={goalIcon}
                  onChange={(e) => setGoalIcon(e.target.value)}
                  placeholder="🎯"
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">颜色</label>
                <Input
                  type="color"
                  value={goalColor}
                  onChange={(e) => setGoalColor(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">描述（可选）</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">当前值</label>
                <Input
                  type="number"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">目标值</label>
                <Input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">单位</label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">截止日期（可选）</label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={resetGoalForm}
              disabled={saveGoalMutation.isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => saveGoalMutation.mutate()}
              disabled={saveGoalMutation.isPending || !title.trim()}
            >
              {saveGoalMutation.isPending ? (
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

      {/* 新建倒数日对话框 */}
      <Dialog open={cdOpen} onOpenChange={setCdOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>新建倒数日</DialogTitle>
            <DialogDescription>记录一个重要的日子</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">标题</label>
              <Input
                value={cdTitle}
                onChange={(e) => setCdTitle(e.target.value)}
                placeholder="如：春节"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">日期</label>
              <Input
                type="date"
                value={cdDate}
                onChange={(e) => setCdDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">备注（可选）</label>
              <Input value={cdNote} onChange={(e) => setCdNote(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">颜色</label>
              <Input type="color" value={cdColor} onChange={(e) => setCdColor(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isYearly"
                checked={cdIsYearly}
                onChange={(e) => setCdIsYearly(e.target.checked)}
                className="rounded border-muted-foreground"
              />
              <label htmlFor="isYearly" className="text-xs font-medium text-muted-foreground">
                每年重复（生日/纪念日）
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCdOpen(false)}
              disabled={saveCdMutation.isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => saveCdMutation.mutate()}
              disabled={saveCdMutation.isPending || !cdTitle.trim() || !cdDate}
            >
              {saveCdMutation.isPending ? (
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

      {/* 删除目标确认 */}
      <AlertDialog open={!!deleteGoal} onOpenChange={(o) => !o && setDeleteGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除目标</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteGoal?.title}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGoalMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGoal && deleteGoalMutation.mutate(deleteGoal.id)}
              disabled={deleteGoalMutation.isPending}
            >
              {deleteGoalMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除倒数日确认 */}
      <AlertDialog
        open={!!deleteCountdown}
        onOpenChange={(o) => !o && setDeleteCountdown(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除倒数日</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteCountdown?.title}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCdMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteCountdown && deleteCdMutation.mutate(deleteCountdown.id)
              }
              disabled={deleteCdMutation.isPending}
            >
              {deleteCdMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}