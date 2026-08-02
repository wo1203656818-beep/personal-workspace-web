import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, Plus, Loader2, Trash2, Heart, TrendingUp,
  BarChart3, Activity, Download, RotateCcw, CalendarDays, Pencil,
  Sparkles, Brain, RefreshCw, Lightbulb, Search, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { recordsApi, type Expense } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#F43F5E', '#3B82F6', '#F97316', '#6366f1', '#EC4899']

const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '通讯', '医疗', '教育', '其他']

export function RecordsPage() {
  usePageTitle('记录')
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('expenses')

  // 记账
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expAmount, setExpAmount] = useState('')
  const [expCategory, setExpCategory] = useState('餐饮')
  const [expNote, setExpNote] = useState('')
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10))
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null)

  // 预算
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [budgetAmount, setBudgetAmount] = useState('')

  // 健康
  const [healthOpen, setHealthOpen] = useState(false)
  const [editingHealth, setEditingHealth] = useState<{ id: string; metric: string; value: number; unit: string | null; note: string | null; date: string } | null>(null)
  const [healthMetric, setHealthMetric] = useState('weight')
  const [healthValue, setHealthValue] = useState('')
  const [healthUnit, setHealthUnit] = useState('')
  const [healthNote, setHealthNote] = useState('')
  const [healthDate, setHealthDate] = useState(new Date().toISOString().slice(0, 10))
  const [deleteHealthConfirmId, setDeleteHealthConfirmId] = useState<string | null>(null)
  const [healthSearch, setHealthSearch] = useState('')

  // ──────── 记账数据 ────────
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 7) + '-01'

  const { data: expenses, isLoading: expLoading } = useQuery({
    queryKey: ['expenses', monthStart],
    queryFn: () => recordsApi.expenses.list({ from: monthStart }),
  })

  const { data: expSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['expenses', 'summary', monthStart],
    queryFn: () => recordsApi.expenses.summary(monthStart),
  })

  // AI 分析
  const { data: expenseAiAnalysis, isLoading: expenseAiLoading, refetch: refetchExpenseAi } = useQuery({
    queryKey: ['expenses', 'ai-analysis'],
    queryFn: () => recordsApi.expenses.aiAnalysis(),
    staleTime: 5 * 60 * 1000,
  })

  // 预算数据
  const { data: budgetData, isLoading: budgetLoading } = useQuery({
    queryKey: ['expenses', 'budget'],
    queryFn: () => recordsApi.expenses.budget.get(),
    staleTime: 60 * 1000,
  })

  const { data: budgetAiTip, isLoading: budgetAiLoading, refetch: refetchBudgetAi } = useQuery({
    queryKey: ['expenses', 'budget', 'ai-tip'],
    queryFn: () => recordsApi.expenses.budget.aiTip(),
    staleTime: 5 * 60 * 1000,
  })

  const setBudgetMutation = useMutation({
    mutationFn: (amount: number) => recordsApi.expenses.budget.set(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', 'budget'] })
      queryClient.invalidateQueries({ queryKey: ['expenses', 'budget', 'ai-tip'] })
      toast.success('预算已设置')
      setBudgetDialogOpen(false)
    },
    onError: (err: Error) => toast.error(`设置失败: ${err.message}`),
  })

  // ──────── 健康数据 ────────
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['health', healthMetric],
    queryFn: () => recordsApi.health.list(healthMetric, 90),
  })

  const { data: healthMetrics } = useQuery({
    queryKey: ['health', 'metrics'],
    queryFn: () => recordsApi.health.metrics(),
  })

  // 健康 AI 分析
  const { data: healthAiAnalysis, isLoading: healthAiLoading, refetch: refetchHealthAi } = useQuery({
    queryKey: ['health', 'ai-analysis'],
    queryFn: () => recordsApi.health.aiAnalysis(),
    staleTime: 5 * 60 * 1000,
  })

  // ──────── 记账CRUD ────────
  const createExpenseMutation = useMutation({
    mutationFn: () => recordsApi.expenses.create({
      amount: parseFloat(expAmount),
      category: expCategory,
      note: expNote || undefined,
      date: expDate,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('支出已记录')
      setExpenseOpen(false)
      setEditingExpense(null)
      setExpAmount('')
      setExpNote('')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const updateExpenseMutation = useMutation({
    mutationFn: () => {
      if (!editingExpense) throw new Error('未选择编辑记录')
      return recordsApi.expenses.update(editingExpense.id, {
        amount: parseFloat(expAmount),
        category: expCategory,
        note: expNote || undefined,
        date: expDate,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('支出已更新')
      setExpenseOpen(false)
      setEditingExpense(null)
      setExpAmount('')
      setExpNote('')
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => recordsApi.expenses.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('记录已删除')
      setDeleteExpense(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // ──────── 健康CRUD ────────
  const createHealthMutation = useMutation({
    mutationFn: () => recordsApi.health.create({
      metric: healthMetric,
      value: parseFloat(healthValue),
      unit: healthUnit || undefined,
      date: healthDate,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['health', 'metrics'] })
      toast.success('健康数据已记录')
      setHealthOpen(false)
      setHealthValue('')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const updateHealthMutation = useMutation({
    mutationFn: () => {
      if (!editingHealth) throw new Error('未选择编辑记录')
      return recordsApi.health.update(editingHealth.id, {
        metric: healthMetric,
        value: parseFloat(healthValue),
        unit: healthUnit || undefined,
        note: healthNote || undefined,
        date: healthDate,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['health', 'metrics'] })
      toast.success('健康数据已更新')
      setHealthOpen(false)
      setEditingHealth(null)
      setHealthValue('')
      setHealthNote('')
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  const deleteHealthMutation = useMutation({
    mutationFn: (id: string) => recordsApi.health.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      toast.success('记录已删除')
      setDeleteHealthConfirmId(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const monthTotal = expSummary?.total ?? 0

  // ──────── 过去6个月支出趋势 ────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  const sixMonthsStart = sixMonthsAgo.toISOString().slice(0, 10)

  const { data: allExpenses } = useQuery({
    queryKey: ['expenses', 'all', sixMonthsStart],
    queryFn: () => recordsApi.expenses.list({ from: sixMonthsStart }),
  })

  const monthlyTrend = useMemo(() => {
    if (!allExpenses) return []
    const monthly: Record<string, number> = {}
    for (const e of allExpenses) {
      const month = e.date.slice(0, 7)
      monthly[month] = (monthly[month] || 0) + e.amount
    }
    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))
  }, [allExpenses])

  // ──────── 健康数据对比 ────────
  const lastMonthStart = new Date()
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)
  lastMonthStart.setDate(1)
  const lmStart = lastMonthStart.toISOString().slice(0, 10)
  const thisMonthStart = today.slice(0, 7) + '-01'

  const { data: thisMonthHealth } = useQuery({
    queryKey: ['health', healthMetric, 'range', thisMonthStart],
    queryFn: () => recordsApi.health.list(healthMetric, 90).then(d => ({
      values: d.series.filter(s => s.date >= thisMonthStart).map(s => s.value),
    })),
    enabled: tab === 'health' && !!healthMetric,
  })

  const { data: lastMonthHealth } = useQuery({
    queryKey: ['health', healthMetric, 'range', lmStart],
    queryFn: () => recordsApi.health.list(healthMetric, 90).then(d => ({
      values: d.series.filter(s => s.date >= lmStart && s.date < thisMonthStart).map(s => s.value),
    })),
    enabled: tab === 'health' && !!healthMetric,
  })

  const healthComparison = useMemo(() => {
    const thisAvg = thisMonthHealth?.values?.length ? thisMonthHealth.values.reduce((a, b) => a + b, 0) / thisMonthHealth.values.length : null
    const lastAvg = lastMonthHealth?.values?.length ? lastMonthHealth.values.reduce((a, b) => a + b, 0) / lastMonthHealth.values.length : null
    return { thisAvg, lastAvg }
  }, [thisMonthHealth, lastMonthHealth])

  const filteredHealthSeries = useMemo(() => {
    if (!healthSearch.trim()) return healthData?.series ?? []
    const q = healthSearch.toLowerCase()
    return (healthData?.series ?? []).filter(s =>
      (s.note?.toLowerCase().includes(q) || String(s.value).toLowerCase().includes(q))
    )
  }, [healthData, healthSearch])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        if (tab === 'expenses') {
          setExpenseOpen(true)
        } else {
          setHealthOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  // CSV 导出
  const exportCSV = () => {
    if (!expenses || expenses.length === 0) {
      toast.error('没有可导出的数据')
      return
    }
    const headers = '日期,分类,金额,备注'
    const rows = expenses.map(e => `${e.date},${e.category},${e.amount.toFixed(2)},${e.note || ''}`)
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `支出记录-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV 已导出')
  }

  // 快速重复记账
  const quickRepeat = (e: Expense) => {
    setEditingExpense(null)
    setExpAmount(e.amount.toString())
    setExpCategory(e.category)
    setExpNote(e.note || '')
    setExpDate(today)
    setExpenseOpen(true)
  }

  // 打开编辑
  const openEdit = (e: Expense) => {
    setEditingExpense(e)
    setExpAmount(e.amount.toString())
    setExpCategory(e.category)
    setExpNote(e.note || '')
    setExpDate(e.date)
    setExpenseOpen(true)
  }
  return (
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-amber-500 to-orange-500 md:size-10">
            <Wallet className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">记录</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">记账与健康指数</p>
          </div>
        </div>
      </div>
      <div className="page-content-wide">

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 md:p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger value="expenses" className="gap-1.5">
                <Wallet className="size-4" />记账
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-1.5">
                <Heart className="size-4" />健康
              </TabsTrigger>
            </TabsList>

            <TabsContent value="expenses" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  本月支出 <span className="font-semibold text-foreground">¥{monthTotal.toFixed(2)}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1 rounded-lg" disabled={!expenses || expenses.length === 0}>
                    <Download className="size-4" />导出 CSV
                  </Button>
                  <Button size="sm" onClick={() => setExpenseOpen(true)} className="gap-1 rounded-lg">
                    <Plus className="size-4" />记一笔
                  </Button>
                </div>
              </div>

              {expLoading || summaryLoading ? (
                <div className="empty-state py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
              ) : (!expenses || expenses.length === 0) && (!expSummary || expSummary.total === 0) ? (
                <EmptyState icon={Wallet} title="还没有记账记录" description="开始记录每天的支出"
                  action={<Button size="sm" onClick={() => setExpenseOpen(true)} className="gap-1 rounded-lg"><Plus className="size-4" />记第一笔</Button>}
                />
              ) : (
                <>
                  {/* 本月汇总卡片 */}
                  {expSummary && expSummary.total > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">本月总支出</p>
                            <p className="text-xl font-bold text-amber-500">¥{expSummary.total.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">日均支出</p>
                            <p className="text-xl font-bold text-primary">
                              ¥{(() => {
                                const daysInMonth = new Date(
                                  parseInt(today.slice(0, 4)),
                                  parseInt(today.slice(5, 7)),
                                  0
                                ).getDate()
                                const daysPassed = Math.min(parseInt(today.slice(8)), daysInMonth)
                                return (expSummary.total / Math.max(daysPassed, 1)).toFixed(2)
                              })()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 预算管理卡片 */}
                  {!budgetLoading && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Wallet className="size-3.5 text-emerald-500" />
                          预算管理
                        </CardTitle>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => {
                          setBudgetAmount(budgetData?.budget ? String(budgetData.budget) : '')
                          setBudgetDialogOpen(true)
                        }}>
                          <Pencil className="size-3.5" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {budgetData && budgetData.budget > 0 ? (
                          <>
                            <div className="flex items-baseline justify-between">
                              <div>
                                <span className="text-2xl font-bold">¥{budgetData.spent.toFixed(2)}</span>
                                <span className="text-xs text-muted-foreground"> / ¥{budgetData.budget.toFixed(0)}</span>
                              </div>
                              <span className="text-xs font-medium">{budgetData.progress}%</span>
                            </div>
                            {/* 进度条 */}
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(budgetData.progress, 100)}%`,
                                  background: budgetData.progress < 50
                                    ? '#10B981'
                                    : budgetData.progress < 80
                                      ? '#F59E0B'
                                      : '#EF4444',
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="rounded-lg border p-2.5">
                                <span className="text-muted-foreground">剩余</span>
                                <p className="font-semibold text-emerald-500">¥{budgetData.remaining.toFixed(2)}</p>
                              </div>
                              <div className="rounded-lg border p-2.5">
                                <span className="text-muted-foreground">日均支出</span>
                                <p className="font-semibold">¥{budgetData.avgDaily.toFixed(2)}</p>
                              </div>
                            </div>
                            {/* AI 消费建议 */}
                            {budgetAiLoading ? (
                              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">生成建议中...</span>
                              </div>
                            ) : budgetAiTip?.tip ? (
                              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                                <div className="flex-1">
                                  <p className="text-xs">{budgetAiTip.tip}</p>
                                  {budgetAiTip.fromCache && (
                                    <span className="mt-0.5 inline-block text-[10px] text-muted-foreground">缓存</span>
                                  )}
                                </div>
                                <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => refetchBudgetAi()} disabled={budgetAiLoading}>
                                  <RefreshCw className={cn('size-3', budgetAiLoading && 'animate-spin')} />
                                </Button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-4">
                            <Wallet className="size-8 text-muted-foreground/40" />
                            <p className="text-xs text-muted-foreground">还没有设置月度预算</p>
                            <Button size="sm" variant="outline" className="gap-1 rounded-lg" onClick={() => {
                              setBudgetAmount('')
                              setBudgetDialogOpen(true)
                            }}>
                              <Plus className="size-3.5" />设置预算
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* 6个月趋势图 */}
                  {monthlyTrend.length > 1 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <CalendarDays className="size-3.5" />过去6个月支出趋势
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={monthlyTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `¥${v}`} />
                            <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                            <Line type="monotone" dataKey="amount" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* AI 分析卡片 */}
                  {expenseAiAnalysis && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Brain className="size-3.5 text-purple-500" />
                          AI 消费分析
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {expenseAiAnalysis.fromCache && (
                            <span className="text-[10px] text-muted-foreground">缓存</span>
                          )}
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => refetchExpenseAi()} disabled={expenseAiLoading}>
                            <RefreshCw className={cn('size-3.5', expenseAiLoading && 'animate-spin')} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <p className="text-sm">{expenseAiAnalysis.report.summary}</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg border p-2.5">
                            <span className="text-muted-foreground">总支出</span>
                            <p className="font-semibold">¥{expenseAiAnalysis.report.totalSpent.toFixed(2)}</p>
                          </div>
                          <div className="rounded-lg border p-2.5">
                            <span className="text-muted-foreground">日均支出</span>
                            <p className="font-semibold">¥{expenseAiAnalysis.report.avgDaily.toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <TrendingUp className="size-3" /> 消费模式
                          </div>
                          <p className="text-sm">{expenseAiAnalysis.report.pattern}</p>
                        </div>
                        {expenseAiAnalysis.report.suggestions.length > 0 && (
                          <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                              <Lightbulb className="size-3" /> AI 建议
                            </div>
                            <ul className="space-y-1">
                              {expenseAiAnalysis.report.suggestions.map((s, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-purple-500" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          分析基于最近 90 天记账数据 · 生成于 {expenseAiAnalysis.generatedAt.slice(0, 16)}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  {/* 图表 */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {expSummary && expSummary.byCategory.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <BarChart3 className="size-3.5" />分类支出
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={expSummary.byCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                                {expSummary.byCategory.map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {expSummary.byCategory.map((c, i) => (
                              <div key={c.category} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <div className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                {c.category} ¥{c.amount.toFixed(0)}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {expSummary && expSummary.trend.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <TrendingUp className="size-3.5" />每日趋势
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={expSummary.trend}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `¥${v}`} />
                              <Tooltip formatter={(v) => `¥${Number(v).toFixed(2)}`} />
                              <Line type="monotone" dataKey="amount" stroke="#F59E0B" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* 本月流水 */}
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <BarChart3 className="size-3.5" />本月流水
                    </h3>
                    {expenses?.map((e) => (
                      <div key={e.id} className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                          <Wallet className="size-4 text-amber-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">{e.category}</Badge>
                            <span className="font-semibold text-sm">¥{e.amount.toFixed(2)}</span>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 mt-0.5">
                            {e.note && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{e.note}</span>}
                            <span className="shrink-0 text-[10px] text-muted-foreground">{e.date}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7 rounded-md md:opacity-0 md:group-hover:opacity-100 opacity-100"
                            onClick={() => openEdit(e)} title="编辑"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 rounded-md md:opacity-0 md:group-hover:opacity-100 opacity-100"
                            onClick={() => quickRepeat(e)} title="快速重复"
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 rounded-md text-destructive md:opacity-0 md:group-hover:opacity-100 opacity-100"
                            onClick={() => setDeleteExpense(e)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="health" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={healthMetric} onValueChange={(v) => setHealthMetric(v)}>
                    <SelectTrigger className="h-8 w-32 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight">体重</SelectItem>
                      <SelectItem value="blood_pressure">血压</SelectItem>
                      <SelectItem value="heart_rate">心率</SelectItem>
                      <SelectItem value="sleep_hours">睡眠</SelectItem>
                      {healthMetrics?.map((m) => (
                        <SelectItem key={m.metric} value={m.metric}>{m.metric}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={healthSearch}
                      onChange={(e) => setHealthSearch(e.target.value)}
                      placeholder="搜索记录..."
                      className="h-8 w-44 rounded-lg pl-8 text-xs"
                    />
                    {healthSearch && (
                      <button
                        onClick={() => setHealthSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Button size="sm" onClick={() => {
                  setEditingHealth(null)
                  setHealthMetric(healthMetric)
                  setHealthValue('')
                  setHealthUnit(healthMetric === 'weight' ? 'kg' : healthMetric === 'sleep_hours' ? '小时' : '')
                  setHealthNote('')
                  setHealthDate(new Date().toISOString().slice(0, 10))
                  setHealthOpen(true)
                }} className="gap-1 rounded-lg">
                  <Plus className="size-4" />记录
                </Button>
              </div>

              {healthLoading ? (
                <div className="empty-state py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
              ) : !healthData || healthData.series.length === 0 ? (
                <EmptyState icon={Heart} title="还没有健康数据" description="开始记录体重、血压等健康指标"
                  action={<Button size="sm" onClick={() => setHealthOpen(true)} className="gap-1 rounded-lg"><Plus className="size-4" />记录第一条</Button>}
                />
              ) : (
                <>
                  {/* 健康数据对比 */}
                  {healthComparison.thisAvg != null && healthComparison.lastAvg != null && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">本月平均</p>
                            <p className="text-lg font-bold text-rose-500">{healthComparison.thisAvg.toFixed(1)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">上月平均</p>
                            <p className="text-lg font-bold text-muted-foreground">{healthComparison.lastAvg.toFixed(1)}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-center">
                          <span className="text-[10px] text-muted-foreground">
                            环比
                            {(() => {
                              const diff = healthComparison.thisAvg! - healthComparison.lastAvg!
                              const pct = ((diff / healthComparison.lastAvg!) * 100).toFixed(1)
                              const isPositive = diff > 0
                              return (
                                <span className={isPositive ? 'text-rose-500' : 'text-green-500'}>
                                  {' '}{isPositive ? '↑' : '↓'} {Math.abs(diff).toFixed(1)} ({pct}%)
                                </span>
                              )
                            })()}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Activity className="size-3.5" />
                      {healthMetric === 'weight' ? '体重' : healthMetric === 'blood_pressure' ? '血压' : healthMetric === 'heart_rate' ? '心率' : healthMetric === 'sleep_hours' ? '睡眠' : healthMetric}趋势
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={filteredHealthSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#F43F5E" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                  {/* 健康 AI 分析 */}
                  {healthAiAnalysis && (
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Brain className="size-3.5 text-purple-500" />
                          AI 健康分析
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {healthAiAnalysis.fromCache && (
                            <span className="text-[10px] text-muted-foreground">缓存</span>
                          )}
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => refetchHealthAi()} disabled={healthAiLoading}>
                            <RefreshCw className={cn('size-3.5', healthAiLoading && 'animate-spin')} />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <p className="text-sm">{healthAiAnalysis.report.summary}</p>
                        {healthAiAnalysis.report.metrics.length > 0 && (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {healthAiAnalysis.report.metrics.map((m) => (
                              <div key={m.metric} className="rounded-lg border p-2.5">
                                <p className="text-[10px] text-muted-foreground">{m.metric}</p>
                                <p className="text-sm font-semibold">{m.latest} {m.unit}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {m.trend === '上升' ? '↑' : m.trend === '下降' ? '↓' : '→'} 平均 {m.avg}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                            <Activity className="size-3" /> 主要发现
                          </div>
                          <p className="text-sm">{healthAiAnalysis.report.findings}</p>
                        </div>
                        {healthAiAnalysis.report.suggestions.length > 0 && (
                          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                              <Lightbulb className="size-3" /> AI 建议
                            </div>
                            <ul className="space-y-1">
                              {healthAiAnalysis.report.suggestions.map((s, i) => (
                                <li key={i} className="text-sm flex items-start gap-2">
                                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-rose-500" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          分析基于最近 90 天健康数据 · 生成于 {healthAiAnalysis.generatedAt.slice(0, 16)}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  {/* 最近记录 */}
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Activity className="size-3.5" />最近记录
                    </h3>
                    {filteredHealthSeries.slice(-10).reverse().map((s) => (
                      <div key={s.id} className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
                          <Heart className="size-4 text-rose-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{s.value}</span>
                            {healthData.raw[0]?.unit && <span className="text-xs text-muted-foreground">{healthData.raw[0].unit}</span>}
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 mt-0.5">
                            {s.note && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{s.note}</span>}
                            <span className="shrink-0 text-[10px] text-muted-foreground">{s.date}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7 rounded-md md:opacity-0 md:group-hover:opacity-100 opacity-100"
                            onClick={() => {
                              const raw = healthData.raw.find(r => r.id === s.id)
                              setEditingHealth({ id: s.id, metric: healthMetric, value: s.value, unit: raw?.unit || null, note: s.note, date: s.date })
                              setHealthMetric(healthMetric)
                              setHealthValue(s.value.toString())
                              setHealthUnit(raw?.unit || '')
                              setHealthNote(s.note || '')
                              setHealthDate(s.date)
                              setHealthOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 rounded-md text-destructive md:opacity-0 md:group-hover:opacity-100 opacity-100"
                            onClick={() => setDeleteHealthConfirmId(s.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* 记账对话框 */}
      <Dialog open={expenseOpen} onOpenChange={(o) => {
        if (!o) {
          setExpenseOpen(false)
          setEditingExpense(null)
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingExpense ? '编辑支出' : '记一笔支出'}</DialogTitle>
            <DialogDescription>{editingExpense ? '修改支出记录' : '记录今天的消费'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">金额</label>
              <Input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} step="0.01" min={0} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">分类</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => setExpCategory(c)}
                    className={cn('rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      expCategory === c ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                    )}
                  >{c}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">备注（可选）</label>
              <Input value={expNote} onChange={(e) => setExpNote(e.target.value)} placeholder="买了什么？" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">日期</label>
              <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => {
              setExpenseOpen(false)
              setEditingExpense(null)
            }} disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => {
              if (editingExpense) {
                updateExpenseMutation.mutate()
              } else {
                createExpenseMutation.mutate()
              }
            }} disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending || !expAmount || parseFloat(expAmount) <= 0}>
              {createExpenseMutation.isPending || updateExpenseMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : editingExpense ? '更新' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 健康记录对话框 */}
      <Dialog open={healthOpen} onOpenChange={(o) => {
        if (!o) {
          setHealthOpen(false)
          setEditingHealth(null)
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingHealth ? '编辑健康数据' : '记录健康数据'}</DialogTitle>
            <DialogDescription>{editingHealth ? '修改健康指标记录' : '记录体重、血压等指标'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">指标</label>
                <Select value={healthMetric} onValueChange={(v) => {
                  setHealthMetric(v)
                  setHealthUnit(v === 'weight' ? 'kg' : v === 'sleep_hours' ? '小时' : '')
                }}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weight">体重</SelectItem>
                    <SelectItem value="blood_pressure">血压</SelectItem>
                    <SelectItem value="heart_rate">心率</SelectItem>
                    <SelectItem value="sleep_hours">睡眠</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">数值</label>
                <Input type="number" value={healthValue} onChange={(e) => setHealthValue(e.target.value)} step="0.1" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">单位（可选）</label>
              <Input value={healthUnit} onChange={(e) => setHealthUnit(e.target.value)} placeholder="kg / mmHg / bpm" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">备注（可选）</label>
              <Input value={healthNote} onChange={(e) => setHealthNote(e.target.value)} placeholder="记录备注" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">日期</label>
              <Input type="date" value={healthDate} onChange={(e) => setHealthDate(e.target.value)} className="rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => {
              setHealthOpen(false)
              setEditingHealth(null)
            }} disabled={createHealthMutation.isPending || updateHealthMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => {
              if (editingHealth) {
                updateHealthMutation.mutate()
              } else {
                createHealthMutation.mutate()
              }
            }} disabled={createHealthMutation.isPending || updateHealthMutation.isPending || !healthValue}>
              {createHealthMutation.isPending || updateHealthMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : editingHealth ? '更新' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预算设置对话框 */}
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>设置月度预算</DialogTitle>
            <DialogDescription>设定每月的消费预算目标</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">预算金额</label>
              <Input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} step="0.01" min={0} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setBudgetDialogOpen(false)} disabled={setBudgetMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => {
              const amount = parseFloat(budgetAmount)
              if (!isNaN(amount) && amount >= 0) setBudgetMutation.mutate(amount)
            }} disabled={setBudgetMutation.isPending || !budgetAmount || parseFloat(budgetAmount) < 0}>
              {setBudgetMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 - 支出 */}
      <AlertDialog open={!!deleteExpense} onOpenChange={(o) => !o && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除支出记录</AlertDialogTitle>
            <AlertDialogDescription>确定要删除吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteExpenseMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteExpense && deleteExpenseMutation.mutate(deleteExpense.id)} disabled={deleteExpenseMutation.isPending}>
              {deleteExpenseMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认 - 健康 */}
      <AlertDialog open={!!deleteHealthConfirmId} onOpenChange={(o) => !o && setDeleteHealthConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除健康记录</AlertDialogTitle>
            <AlertDialogDescription>确定要删除吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteHealthMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteHealthConfirmId && deleteHealthMutation.mutate(deleteHealthConfirmId)} disabled={deleteHealthMutation.isPending}>
              {deleteHealthMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}