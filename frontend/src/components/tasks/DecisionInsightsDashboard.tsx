import { useQuery } from '@tanstack/react-query'
import { decisionLogsApi, decisionRulesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Timer, TrendingUp, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react'

export function DecisionInsightsDashboard() {
  const { data: patterns } = useQuery({
    queryKey: ['decision-logs', 'patterns'],
    queryFn: decisionLogsApi.patterns,
  })

  const { data: rules = [] } = useQuery({
    queryKey: ['decision-rules'],
    queryFn: decisionRulesApi.list,
  })

  if (!patterns) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const totalDecisions = patterns.byCategory.reduce((sum, c) => sum + c.count, 0)
  const avgDuration = patterns.byCategory.reduce((sum, c) => sum + (c.avgDuration || 0), 0) / (patterns.byCategory.length || 1)
  const avgSatisfaction = patterns.byCategory.reduce((sum, c) => sum + (c.avgSatisfaction || 0), 0) / (patterns.byCategory.length || 1)

  const getDurationLevel = (sec: number) => {
    if (sec < 120) return { label: '高效', color: 'text-green-500', icon: CheckCircle }
    if (sec < 600) return { label: '正常', color: 'text-yellow-500', icon: Timer }
    return { label: '内耗', color: 'text-red-500', icon: AlertTriangle }
  }

  const level = getDurationLevel(avgDuration)

  return (
    <div className="space-y-4">
      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总决策次数</CardTitle>
            <BarChart3 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDecisions}</div>
            <p className="text-xs text-muted-foreground">已记录的决策</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均耗时</CardTitle>
            <level.icon className={`size-4 ${level.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(avgDuration / 60)}分</div>
            <Badge variant="outline" className={level.color}>{level.label}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">满意度</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/5` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">平均满意度</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">规则库</CardTitle>
            <CheckCircle className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rules.length}</div>
            <p className="text-xs text-muted-foreground">已套用规则</p>
          </CardContent>
        </Card>
      </div>

      {/* 分类详情 */}
      {patterns.byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">分类统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {patterns.byCategory.map((cat) => {
                const catLevel = getDurationLevel(cat.avgDuration || 0)
                return (
                  <div key={cat.category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cat.category}</span>
                      <span className="text-xs text-muted-foreground">{cat.count}次</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {Math.round((cat.avgDuration || 0) / 60)}分
                      </span>
                      <catLevel.icon className={`size-3 ${catLevel.color}`} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
