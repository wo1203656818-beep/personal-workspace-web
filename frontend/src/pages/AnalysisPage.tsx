import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart3, FileText, Loader2, Sparkles, TrendingUp,
  CheckCircle2, ListTodo, Star, BookOpen, Quote, ChevronDown, ChevronUp,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ActivityCalendar } from 'react-activity-calendar'
import { toast } from 'sonner'
import { aiApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface AnalysisStats {
  totalTasks: number
  completedTasks: number
  importantTasks: number
  notesCount: number
  dailyCompleted: { date: string; count: number }[]
}

const CHART_COLORS = {
  primary: '#7C3AED',
  primaryLight: '#A78BFA',
  success: '#10B981',
  warning: '#F59E0B',
  rose: '#F43F5E',
  slate: '#64748B',
}

const STAT_ITEMS = [
  { key: 'totalTasks' as const, label: '总任务', icon: ListTodo, color: 'text-indigo-500', bg: 'bg-indigo-500/10', gradient: 'from-indigo-500 to-violet-500' },
  { key: 'completedTasks' as const, label: '已完成', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', gradient: 'from-emerald-500 to-teal-500' },
  { key: 'importantTasks' as const, label: '重要', icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10', gradient: 'from-amber-500 to-orange-500' },
  { key: 'notesCount' as const, label: '笔记', icon: BookOpen, color: 'text-rose-500', bg: 'bg-rose-500/10', gradient: 'from-rose-500 to-pink-500' },
]

type DailyItem = { date: string; count: number }
type HeatItem = { date: string; count: number; level: number }

function countToLevel(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

export function AnalysisPage() {
  const [enabled, setEnabled] = useState(false)
  const [range, setRange] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [currentReport, setCurrentReport] = useState<{ report: string; week: string } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const effectiveRange = range === 'custom' && customStart && customEnd ? `custom:${customStart}:${customEnd}` : range

  const { data, isFetching } = useQuery({
    queryKey: ['analysis', effectiveRange],
    queryFn: (): Promise<{ analysis: string; stats: AnalysisStats }> => aiApi.analysis(effectiveRange),
    enabled,
  })

  const { data: weeklyReports = [], refetch: refetchReports } = useQuery({
    queryKey: ['weeklyReports'],
    queryFn: aiApi.weeklyReports,
  })

  const weeklyMutation = useMutation({
    mutationFn: aiApi.weeklyReport,
    onSuccess: (res) => {
      setCurrentReport(res)
      toast.success(`本周报告已生成（${res.week}）`)
      refetchReports()
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  // 构建图表数据
  const completionData = data?.stats ? [
    { name: '已完成', value: data.stats.completedTasks },
    { name: '未完成', value: data.stats.totalTasks - data.stats.completedTasks },
  ] : []

  const categoryData = data?.stats ? [
    { name: '普通任务', value: data.stats.totalTasks - data.stats.importantTasks },
    { name: '重要任务', value: data.stats.importantTasks },
  ] : []

  const overviewData = data?.stats ? [
    { name: '任务', value: data.stats.totalTasks },
    { name: '笔记', value: data.stats.notesCount },
  ] : []

  // 每日完成趋势 + 热力图数据
  const dailyRaw: DailyItem[] = Array.isArray(data?.stats?.dailyCompleted)
    ? data.stats.dailyCompleted
    : []
  const trendData = dailyRaw.map((d) => {
    const dateStr = typeof d.date === 'string' ? d.date : String(d.date)
    // dateStr 是日期字符串，格式 yyyy-MM-dd，直接使用无需时区转换
    const label = dateStr.slice(5) // MM-dd
    return {
      date: dateStr,
      label,
      count: Number(d.count) || 0,
    }
  })
  const heatData: HeatItem[] = trendData.map((d) => ({
    date: d.date,
    count: d.count,
    level: countToLevel(d.count),
  }))

  const isEmpty = !!data?.stats && data.stats.totalTasks === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 md:size-10">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">数据分析</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">AI 驱动的数据洞察与趋势分析</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange} disabled={!enabled}>
            <SelectTrigger size="sm" className="w-28 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="custom">自定义范围</SelectItem>
            </SelectContent>
          </Select>
          {range === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 w-32 rounded-lg text-xs" />
              <span className="text-xs text-muted-foreground">至</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 w-32 rounded-lg text-xs" />
            </div>
          )}
          <Button size="sm" onClick={() => setEnabled(true)} disabled={isFetching} className="rounded-lg gap-1">
            <Sparkles className="size-4" />
            {isFetching ? 'AI 分析中...' : '生成分析'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4 md:p-6">
          {isFetching && (
            <div className="empty-state py-20">
              <Loader2 className="mb-4 size-12 animate-spin text-primary" />
              <p className="text-base font-medium">AI 正在分析数据...</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">请稍候，正在生成图表与洞察报告</p>
            </div>
          )}

          {/* 统计卡片 - Bento Grid */}
          {data?.stats && !isEmpty && !isFetching && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {STAT_ITEMS.map((item) => (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={data.stats[item.key]}
                  icon={item.icon}
                  color={item.color}
                  bg={item.bg}
                  gradient={item.gradient}
                />
              ))}
            </div>
          )}

          {/* 空数据兜底 */}
          {isEmpty && !isFetching && (
            <EmptyState
              icon={BarChart3}
              title="暂无数据"
              description="去创建任务，积累数据后再来分析"
              action={
                <Button asChild size="sm" className="rounded-lg">
                  <Link to="/tasks/myday">去任务页</Link>
                </Button>
              }
            />
          )}

          {/* 图表区域 */}
          {data?.stats && !isEmpty && !isFetching && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* 任务完成率 */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-violet-500/10">
                      <CheckCircle2 className="size-3.5 text-violet-500" />
                    </div>
                    任务完成率
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={completionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={44}
                        outerRadius={72}
                        dataKey="value"
                        stroke="none"
                        label={(entry: { name?: string; value?: number }) => `${entry.name ?? ''} ${entry.value ?? 0}`}
                      >
                        {completionData.map((_, index) => (
                          <Cell
                            key={index}
                            fill={index === 0 ? CHART_COLORS.success : CHART_COLORS.slate}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 任务分类 */}
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-amber-500/10">
                      <Star className="size-3.5 text-amber-500" />
                    </div>
                    任务分类
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ radius: 4 }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {categoryData.map((_, index) => (
                          <Cell key={index} fill={index === 0 ? CHART_COLORS.primary : CHART_COLORS.warning} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 任务完成趋势 */}
              <Card className="overflow-hidden md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10">
                      <TrendingUp className="size-3.5 text-emerald-500" />
                    </div>
                    任务完成趋势
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name="完成数"
                          stroke={CHART_COLORS.primary}
                          strokeWidth={2.5}
                          fill="url(#trendFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-10 text-center text-xs text-muted-foreground">暂无趋势数据</p>
                  )}
                </CardContent>
              </Card>

              {/* 贡献热力图 */}
              <Card className="overflow-hidden md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-rose-500/10">
                      <BarChart3 className="size-3.5 text-rose-500" />
                    </div>
                    贡献日历
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {heatData.length > 0 ? (
                    <div className="w-full overflow-x-auto">
                      <ActivityCalendar
                        data={heatData}
                        maxLevel={4}
                        theme={{
                          light: ['#ebedf0', '#c7d2fe', '#818cf8', '#6366f1', '#4f46e5'],
                          dark: ['#1f2937', '#312e81', '#4338ca', '#6366f1', '#818cf8'],
                        }}
                        labels={{
                          totalCount: '{{count}} 次完成',
                          legend: { less: '少', more: '多' },
                        }}
                      />
                    </div>
                  ) : (
                    <p className="py-10 text-center text-xs text-muted-foreground">暂无贡献数据</p>
                  )}
                </CardContent>
              </Card>

              {/* 总览 */}
              <Card className="overflow-hidden md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex size-6 items-center justify-center rounded-md bg-indigo-500/10">
                      <ListTodo className="size-3.5 text-indigo-500" />
                    </div>
                    系统总览
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={overviewData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ radius: 4 }} />
                      <Bar dataKey="value" fill={CHART_COLORS.primaryLight} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AI 分析报告 */}
          {data?.analysis && !isEmpty && !isFetching && (
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="icon-badge size-8 bg-gradient-to-br from-violet-500 to-fuchsia-500">
                    <Quote className="size-4" />
                  </div>
                  AI 分析报告
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative rounded-xl bg-muted/40 p-5">
                  <Quote className="absolute left-4 top-4 size-6 text-primary/20" />
                  <p className="pl-8 text-sm leading-7 whitespace-pre-wrap text-foreground/90">{data.analysis}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI 周报 */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <div className="icon-badge size-8 bg-gradient-to-br from-indigo-500 to-blue-500">
                    <FileText className="size-4" />
                  </div>
                  AI 周报
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => weeklyMutation.mutate()}
                  disabled={weeklyMutation.isPending}
                  className="rounded-lg gap-1"
                >
                  {weeklyMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> 生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" /> 生成本周报告
                    </>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentReport && (
                <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">本周</span>
                    <span className="text-xs font-medium text-muted-foreground">{currentReport.week}</span>
                  </div>
                  <p className="text-sm leading-7 whitespace-pre-wrap text-foreground/90">{currentReport.report}</p>
                </div>
              )}

              {weeklyReports.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">历史周报</p>
                  {weeklyReports.map((item: { id?: string | number; week?: string; report: string }) => {
                    const id = String(item.id ?? item.week)
                    const isOpen = expandedId === id
                    return (
                      <div
                        key={id}
                        className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : id)}
                          className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-accent/40"
                        >
                          <span className="text-sm font-medium">{item.week ?? '未知周'}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {isOpen ? '收起' : '展开'}
                            {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </span>
                        </button>
                        {isOpen && (
                          <p className="border-t px-4 py-3.5 text-sm leading-6 whitespace-pre-wrap text-foreground/85">
                            {item.report}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                !currentReport && (
                  <p className="text-xs text-muted-foreground">
                    暂无周报，点击右上角生成本周报告。
                  </p>
                )
              )}
            </CardContent>
          </Card>

          {!data && !isFetching && (
            <EmptyState
              icon={BarChart3}
              title="开始探索你的数据"
              description="点击「生成分析」获取 AI 数据分析报告"
            />
          )}
        </div>
      </ScrollArea>
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
    <Card className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
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
