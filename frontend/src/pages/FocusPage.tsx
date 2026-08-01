import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Timer, Play, Pause, RotateCcw, Check, Loader2, Trash2, Plus, Clock, Target, BarChart3, Coffee, SkipForward, GanttChart, Brain, X, TrendingUp, Lightbulb, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { focusApi, tasksApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { AmbientSounds } from '@/components/AmbientSounds'
import { usePageTitle } from '@/hooks/use-page-title'
import { ActivityCalendar } from 'react-activity-calendar'

export function FocusPage() {
  usePageTitle('专注')
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [minutes, setMinutes] = useState(25)
  const [taskTitle, setTaskTitle] = useState('')
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle')
  const [timerDuration, setTimerDuration] = useState(25)
  const [isBreak, setIsBreak] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [breakSeconds, setBreakSeconds] = useState(0)
  const [breakState, setBreakState] = useState<'idle' | 'running' | 'paused'>('idle')
  const [sessionCount, setSessionCount] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedBreakDuration, setSelectedBreakDuration] = useState(5)
  const [dailyGoal, setDailyGoal] = useState(() => {
    try { return parseInt(localStorage.getItem('focusDailyGoal') || '4', 10) } catch { return 4 }
  })
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [historySearch, setHistorySearch] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 10
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const remainingSecondsRef = useRef(0)
  const remainingBreakSecondsRef = useRef(0)
  const timerDurationRef = useRef(timerDuration)
  const breakDurationRef = useRef(selectedBreakDuration)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['focus'],
    queryFn: () => focusApi.list(14),
  })

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.list,
    staleTime: 60000,
  })

  const { data: aiAnalysis, isLoading: aiLoading, error: aiError, refetch: refetchAi } = useQuery({
    queryKey: ['focus-ai-analysis'],
    queryFn: () => focusApi.aiAnalysis(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['focus', 'stats'],
    queryFn: () => focusApi.stats(),
    staleTime: 60000,
  })

  const createMutation = useMutation({
    mutationFn: (data: { minutes: number; taskId?: string; taskTitle?: string }) =>
      focusApi.create({ ...data, completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus'] })
      toast.success('专注记录已保存')
      setCreateOpen(false)
      setMinutes(25)
      setTaskTitle('')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => focusApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['focus'] })
      toast.success('记录已删除')
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // Pause timer when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && timerState === 'running') {
        pauseTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [timerState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (breakTimerRef.current) clearInterval(breakTimerRef.current)
    }
  }, [])

  // Keep refs in sync
  useEffect(() => { timerDurationRef.current = timerDuration }, [timerDuration])
  useEffect(() => { breakDurationRef.current = selectedBreakDuration }, [selectedBreakDuration])
  useEffect(() => {
    try { localStorage.setItem('focusDailyGoal', String(dailyGoal)) } catch {}
  }, [dailyGoal])

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const clearBreakTimer = () => {
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current)
      breakTimerRef.current = null
    }
  }

  const playCompletionSound = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }

  const startTimer = () => {
    if (timerState === 'idle' || timerState === 'paused') {
      remainingSecondsRef.current = timerMinutes * 60 + timerSeconds
      setTimerState('running')
    }
  }

  const pauseTimer = () => {
    clearTimer()
    setTimerState('paused')
  }

  const stopTimer = () => {
    if (timerState === 'running') {
      setShowStopConfirm(true)
      return
    }
    clearTimer()
    setTimerState('idle')
    setTimerMinutes(timerDuration)
    setTimerSeconds(0)
  }

  const confirmStopTimer = () => {
    clearTimer()
    setShowStopConfirm(false)
    setTimerState('idle')
    setTimerMinutes(timerDuration)
    setTimerSeconds(0)
  }

  // Main timer - ref-based to avoid dependency cycles
  useEffect(() => {
    if (timerState !== 'running') return
    const interval = setInterval(() => {
      remainingSecondsRef.current -= 1
      if (remainingSecondsRef.current <= 0) {
        clearInterval(interval)
        timerRef.current = null
        setTimerState('completed')
        setTimerMinutes(0)
        setTimerSeconds(0)
        playCompletionSound()
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('专注完成！', { body: `完成了 ${timerDurationRef.current} 分钟的专注`, icon: '/favicon.ico' })
          }
        } catch {}
        const completedTask = allTasks.find((t: any) => t.id === selectedTaskId)
        setSessionCount((prev) => prev + 1)
        createMutation.mutate({
          minutes: timerDurationRef.current,
          taskId: selectedTaskId || undefined,
          taskTitle: completedTask?.title || undefined,
        })
        // Start break timer using ref-based tick
        setIsBreak(true)
        const breakDur = breakDurationRef.current
        remainingBreakSecondsRef.current = breakDur * 60
        setBreakMinutes(breakDur)
        setBreakSeconds(0)
        setBreakState('running')
        breakTimerRef.current = setInterval(() => {
          remainingBreakSecondsRef.current -= 1
          if (remainingBreakSecondsRef.current <= 0) {
            clearInterval(breakTimerRef.current!)
            breakTimerRef.current = null
            setBreakState('idle')
            setBreakMinutes(0)
            setBreakSeconds(0)
            setIsBreak(false)
            setTimerDuration(25)
            setTimerMinutes(25)
            setTimerSeconds(0)
            setTimerState('idle')
            remainingSecondsRef.current = 25 * 60
            try {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('休息结束', { body: '该开始下一个专注了！', icon: '/favicon.ico' })
              }
            } catch {}
          } else {
            setBreakMinutes(Math.floor(remainingBreakSecondsRef.current / 60))
            setBreakSeconds(remainingBreakSecondsRef.current % 60)
          }
        }, 1000)
      } else {
        setTimerMinutes(Math.floor(remainingSecondsRef.current / 60))
        setTimerSeconds(remainingSecondsRef.current % 60)
      }
    }, 1000)
    timerRef.current = interval
    return () => { clearInterval(interval); timerRef.current = null }
  }, [timerState, selectedBreakDuration])

  // Break timer effect is handled by the ref-based interval in the main timer completion handler

  const pauseBreak = () => {
    clearBreakTimer()
    setBreakState('paused')
  }

  const resumeBreak = () => {
    remainingBreakSecondsRef.current = breakMinutes * 60 + breakSeconds
    setBreakState('running')
    breakTimerRef.current = setInterval(() => {
      remainingBreakSecondsRef.current -= 1
      if (remainingBreakSecondsRef.current <= 0) {
        clearInterval(breakTimerRef.current!)
        breakTimerRef.current = null
        setBreakState('idle')
        setBreakMinutes(0)
        setBreakSeconds(0)
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('休息结束', { body: '该开始下一个专注了！', icon: '/favicon.ico' })
          }
        } catch {}
      } else {
        setBreakMinutes(Math.floor(remainingBreakSecondsRef.current / 60))
        setBreakSeconds(remainingBreakSecondsRef.current % 60)
      }
    }, 1000)
  }

  const skipBreak = () => {
    clearBreakTimer()
    setBreakState('idle')
    setIsBreak(false)
    setTimerDuration(25)
    setTimerMinutes(25)
    setTimerSeconds(0)
    setTimerState('idle')
    remainingSecondsRef.current = 25 * 60
  }

  // Request notification permission on mount
  useEffect(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    } catch {}
  }, [])

  // Keyboard shortcut: Space to toggle timer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space' && timerState !== 'completed') {
        e.preventDefault()
        if (timerState === 'idle' || timerState === 'paused') startTimer()
        else if (timerState === 'running') pauseTimer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [timerState, timerDuration, timerMinutes, timerSeconds])

  const selectDuration = (min: number) => {
    if (timerState === 'idle' || timerState === 'completed') {
      setTimerDuration(min)
      setTimerMinutes(min)
      setTimerSeconds(0)
    }
  }

  const totalSeconds = timerDuration * 60
  const elapsedSeconds = totalSeconds - (timerMinutes * 60 + timerSeconds)
  const progress = totalSeconds > 0 ? elapsedSeconds / totalSeconds : 0

  const breakTotalSeconds = selectedBreakDuration * 60
  const breakElapsedSeconds = breakTotalSeconds - (breakMinutes * 60 + breakSeconds)
  const breakProgress = breakTotalSeconds > 0 ? breakElapsedSeconds / breakTotalSeconds : 0

  const stats = data?.stats
  const sessions = data?.sessions ?? []

  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions
    const q = historySearch.toLowerCase()
    return sessions.filter((s) => s.taskTitle?.toLowerCase().includes(q))
  }, [sessions, historySearch])

  const visibleSessions = filteredSessions.slice(0, historyPage * HISTORY_PAGE_SIZE)
  const hasMoreHistory = visibleSessions.length < filteredSessions.length

  useEffect(() => {
    if (stats?.todayCount) setSessionCount(stats.todayCount)
  }, [stats?.todayCount])

  useEffect(() => {
    setHistoryPage(1)
  }, [historySearch])

  // Weekly chart data（按北京时间日期匹配，避免 UTC 偏移导致错位一天）
  const weeklyData = (() => {
    const days: { label: string; minutes: number }[] = []
    const fmtDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = fmtDate.format(d)
      const daySessions = sessions.filter((s) => s.startedAt.startsWith(dateStr))
      const totalMin = daySessions.reduce((sum, s) => sum + s.minutes, 0)
      const dayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
      days.push({ label: i === 0 ? '今天' : dayLabel, minutes: totalMin })
    }
    return days
  })()

  const maxMinutes = Math.max(...weeklyData.map((d) => d.minutes), 1)

  // 热力图数据
  type HeatItem = { date: string; count: number; level: number }
  function minutesToLevel(minutes: number): number {
    if (minutes <= 0) return 0
    if (minutes <= 30) return 1
    if (minutes <= 60) return 2
    if (minutes <= 90) return 3
    return 4
  }
  const heatData: HeatItem[] = useMemo(
    () =>
      (statsData?.weekly ?? []).map((d) => ({
        date: d.date,
        count: d.minutes,
        level: minutesToLevel(d.minutes),
      })),
    [statsData],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-rose-500 to-pink-500 md:size-10">
            <Timer className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">专注</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">番茄钟与今日专注统计</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1 rounded-lg">
          <Plus className="size-4" />
          记录专注
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 md:p-6">
          {/* 番茄钟计时器 */}
          <div className="flex flex-col items-center rounded-xl border bg-card p-6 md:p-8">
            {/* 圆形进度 */}
            <div className="relative mb-4 size-44 md:size-52">
              <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  className="text-muted/20"
                />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - Math.min(progress, 1))}`}
                  className={cn(
                    'transition-all duration-500',
                    timerState === 'completed'
                      ? 'text-emerald-500'
                      : timerState === 'running'
                        ? 'text-rose-500'
                        : 'text-muted-foreground/30',
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold tracking-tight tabular-nums md:text-5xl">
                  {String(timerMinutes).padStart(2, '0')}:{String(timerSeconds).padStart(2, '0')}
                </span>
                <span className="mt-1 text-xs font-medium text-muted-foreground">
                  {timerState === 'idle' && '准备就绪'}
                  {timerState === 'running' && '专注中...'}
                  {timerState === 'paused' && '已暂停'}
                  {timerState === 'completed' && '✓ 完成！'}
                </span>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center gap-3">
              {timerState === 'idle' && (
                <Button onClick={startTimer} className="gap-2 rounded-full px-6">
                  <Play className="size-4" />
                  开始
                </Button>
              )}
              {timerState === 'running' && (
                <>
                  <Button variant="outline" size="icon" className="size-10 rounded-full" onClick={pauseTimer}>
                    <Pause className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={stopTimer}>
                    <RotateCcw className="size-4" />
                  </Button>
                </>
              )}
              {timerState === 'paused' && (
                <>
                  <Button onClick={startTimer} className="gap-2 rounded-full px-6">
                    <Play className="size-4" />
                    继续
                  </Button>
                  <Button variant="ghost" size="icon" className="size-10 rounded-full" onClick={stopTimer}>
                    <RotateCcw className="size-4" />
                  </Button>
                </>
              )}
              {timerState === 'completed' && (
                <>
                  <Button onClick={stopTimer} className="gap-2 rounded-full px-6" variant="outline">
                    <RotateCcw className="size-4" />
                    重置
                  </Button>
                </>
              )}
            </div>

            {/* 时长选择 */}
            <div className="mt-4 flex items-center gap-2">
              {[15, 25, 30, 45, 60].map((min) => (
                <Button
                  key={min}
                  variant={timerDuration === min ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-lg px-3 text-xs"
                  onClick={() => selectDuration(min)}
                  disabled={timerState === 'running'}
                >
                  {min}分钟
                </Button>
              ))}
            </div>
            {/* Task selector */}
            <div className="mt-4 flex items-center gap-2">
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">无关联任务</option>
                {allTasks.filter((t: any) => !t.isCompleted).map((task: any) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
              </select>
              {sessionCount > 0 && (
                <span className="text-xs text-muted-foreground">今日第 {sessionCount} 个番茄</span>
              )}
            </div>
            {/* Daily goal */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="size-3.5" />
              <span>今日目标：</span>
              <div className="flex items-center gap-1">
                {[2, 4, 6, 8].map((g) => (
                  <Button
                    key={g}
                    variant={dailyGoal === g ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 rounded px-2 text-[10px]"
                    onClick={() => setDailyGoal(g)}
                  >
                    {g}个
                  </Button>
                ))}
              </div>
              {dailyGoal > 0 && (
                <span className="text-emerald-500">
                  {Math.min(sessionCount, dailyGoal)}/{dailyGoal}
                </span>
              )}
            </div>
            {/* Quick actions */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground">快捷操作：</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px]"
                onClick={() => {
                  setTimerDuration(25)
                  setTimerMinutes(25)
                  setTimerSeconds(0)
                  remainingSecondsRef.current = 25 * 60
                  setTimerState('idle')
                }}
              >
                <Brain className="size-3 mr-1" />
                标准25分
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px]"
                onClick={() => {
                  setTimerDuration(15)
                  setTimerMinutes(15)
                  setTimerSeconds(0)
                  remainingSecondsRef.current = 15 * 60
                  setTimerState('idle')
                }}
              >
                <Clock className="size-3 mr-1" />
                快速15分
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px]"
                onClick={() => {
                  setTimerDuration(45)
                  setTimerMinutes(45)
                  setTimerSeconds(0)
                  remainingSecondsRef.current = 45 * 60
                  setTimerState('idle')
                }}
              >
                <GanttChart className="size-3 mr-1" />
                深度45分
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2.5 text-[11px] text-muted-foreground"
                onClick={() => {
                  setTimerDuration(5)
                  setTimerMinutes(5)
                  setTimerSeconds(0)
                  remainingSecondsRef.current = 5 * 60
                  setTimerState('idle')
                }}
              >
                <X className="size-3 mr-1" />
                重置
              </Button>
            </div>
          </div>

          {/* 休息计时器 */}
          {isBreak && (
            <div className="flex flex-col items-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Coffee className="size-5 text-emerald-500" />
                <p className="text-lg font-semibold text-emerald-500">休息时间</p>
              </div>
              {/* Break timer circle */}
              <div className="relative mb-3 size-28">
                <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - Math.min(breakProgress, 1))}`}
                    className="text-emerald-500 transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums">
                    {String(breakMinutes).padStart(2, '0')}:{String(breakSeconds).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {breakState === 'running' ? '休息中...' : breakState === 'paused' ? '已暂停' : '休息结束'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {breakState === 'running' && (
                  <Button variant="outline" size="sm" className="gap-1 rounded-full" onClick={pauseBreak}>
                    <Pause className="size-3.5" />暂停
                  </Button>
                )}
                {breakState === 'paused' && (
                  <Button variant="outline" size="sm" className="gap-1 rounded-full" onClick={resumeBreak}>
                    <Play className="size-3.5" />继续
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-1 rounded-full" onClick={skipBreak}>
                  <SkipForward className="size-3.5" />跳过
                </Button>
              </div>
              {breakState === 'idle' && (
                <div className="mt-3 flex items-center gap-2">
                  {[5, 10, 15].map((min) => (
                    <Button
                      key={min}
                      variant={selectedBreakDuration === min ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-lg px-3 text-xs"
                      onClick={() => {
                        setSelectedBreakDuration(min)
                        setBreakMinutes(min)
                        setBreakSeconds(0)
                      }}
                      disabled={false}
                    >
                      {min}分钟
                    </Button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                休息结束自动进入下一个专注
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-5"><Skeleton className="h-10 w-16 mb-1" /><Skeleton className="h-3 w-20" /></CardContent></Card>
                ))}
              </div>
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : !stats || stats.totalCount === 0 ? (
            <EmptyState
              icon={Timer}
              title="还没有专注记录"
              description="开始一个番茄钟，记录你的专注时光"
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1 rounded-lg">
                  <Play className="size-4" />
                  记录第一个专注
                </Button>
              }
            />
          ) : (
            <>
              {/* 统计卡片 */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard
                  label="今日专注"
                  value={`${stats.todayMinutes} 分钟`}
                  sub={`${stats.todayCount} 个番茄`}
                  icon={Clock}
                  color="text-rose-500"
                  bg="bg-rose-500/10"
                  gradient="from-rose-500 to-pink-500"
                />
                <StatCard
                  label="累计时长"
                  value={`${Math.floor(stats.totalMinutes / 60)} 小时`}
                  sub={`${stats.totalMinutes % 60} 分钟`}
                  icon={Timer}
                  color="text-violet-500"
                  bg="bg-violet-500/10"
                  gradient="from-violet-500 to-purple-500"
                />
                <StatCard
                  label="完成番茄"
                  value={String(stats.totalCount)}
                  sub="个"
                  icon={Check}
                  color="text-emerald-500"
                  bg="bg-emerald-500/10"
                  gradient="from-emerald-500 to-teal-500"
                />
                <StatCard
                  label="平均时长"
                  value={stats.totalCount > 0 ? String(Math.round(stats.totalMinutes / stats.totalCount)) : '0'}
                  sub="分钟/个"
                  icon={Target}
                  color="text-amber-500"
                  bg="bg-amber-500/10"
                  gradient="from-amber-500 to-orange-500"
                />
              </div>

              {/* 白噪音 */}
              <AmbientSounds />

              {/* 本周统计 - 柱状图 */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                  <BarChart3 className="size-4" />
                  本周专注趋势
                </h3>
                <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
                  {weeklyData.map((day, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5 justify-end">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {day.minutes > 0 ? `${day.minutes}m` : ''}
                      </span>
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-rose-500 to-pink-500 transition-all"
                        style={{
                          height: day.minutes > 0 ? `${Math.max((day.minutes / maxMinutes) * 80, 4)}px` : '2px',
                          opacity: day.minutes > 0 ? 1 : 0.15,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 专注热力图 */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                  <BarChart3 className="size-4" />
                  专注热力图
                </h3>
                {statsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Skeleton className="h-28 w-full max-w-[600px]" />
                  </div>
                ) : heatData.length > 0 ? (
                  <div className="w-full overflow-x-auto">
                    <ActivityCalendar
                      data={heatData}
                      maxLevel={4}
                      theme={{
                        light: ['#ebedf0', '#fecdd3', '#fda4af', '#f43f5e', '#e11d48'],
                        dark: ['#1f2937', '#4c0519', '#881337', '#be123c', '#e11d48'],
                      }}
                      labels={{
                        totalCount: '{{count}} 分钟',
                        legend: { less: '少', more: '多' },
                      }}
                    />
                  </div>
                ) : (
                  <p className="py-10 text-center text-xs text-muted-foreground">暂无专注数据</p>
                )}
              </div>

              {/* AI 专注分析 */}
              {aiLoading ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Brain className="size-4 text-purple-500" />
                      AI 专注分析
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                      </div>
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                    </div>
                  </CardContent>
                </Card>
              ) : aiError ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Brain className="size-4 text-purple-500" />
                        AI 分析暂时不可用
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => refetchAi()}>
                        <RefreshCw className="size-3.5 mr-1" />重试
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : aiAnalysis && (
                <Card>
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

              {/* 历史记录列表 */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <BarChart3 className="size-4" />
                  最近记录
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="搜索任务名..."
                    className="h-8 rounded-lg pl-8 text-xs"
                  />
                  {historySearch && (
                    <button
                      onClick={() => setHistorySearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="pt-1" />
                {visibleSessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-4 rounded-xl border bg-card p-3 transition-all hover:shadow-sm"
                  >
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-xl',
                        s.completed ? 'bg-emerald-500/10' : 'bg-muted',
                      )}
                    >
                      <Timer className={cn('size-4', s.completed ? 'text-emerald-500' : 'text-muted-foreground')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{s.minutes} 分钟</span>
                        {s.taskTitle && (
                          <span className="truncate text-xs text-muted-foreground">· {s.taskTitle}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.startedAt.slice(0, 16).replace('T', ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 rounded-md text-destructive"
                        onClick={() => setDeletingId(s.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {hasMoreHistory && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => p + 1)}
                      className="gap-1.5 rounded-lg"
                    >
                      加载更多
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* 新建记录对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>记录专注会话</DialogTitle>
            <DialogDescription>添加一次已完成的专注记录</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">专注时长（分钟）</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setMinutes(Math.max(5, minutes - 5))}
                >
                  -5
                </Button>
                <Input
                  type="number"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(180, parseInt(e.target.value) || 25)))}
                  className="text-center"
                  min={1}
                  max={180}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setMinutes(Math.min(180, minutes + 5))}
                >
                  +5
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">关联任务（可选）</label>
              <Input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="输入任务或活动名称"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ minutes, taskTitle: taskTitle || undefined })}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <><Loader2 className="size-4 animate-spin" /> 保存中...</>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null) }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除记录？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，确认要删除这条专注记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingId(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId)
                setDeletingId(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 停止确认对话框 */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>停止专注？</AlertDialogTitle>
            <AlertDialogDescription>
              当前专注已进行 {timerDuration - timerMinutes} 分钟，确定要停止吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowStopConfirm(false)}>继续专注</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStopTimer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认停止
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
  sub,
  icon: Icon,
  color,
  bg,
  gradient,
}: {
  label: string
  value: string
  sub: string
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
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
          </div>
          <div className={cn('flex size-9 items-center justify-center rounded-xl', bg)}>
            <Icon className={cn('size-4', color)} />
          </div>
        </div>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}