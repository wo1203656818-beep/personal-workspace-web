import { useQuery } from '@tanstack/react-query'
import { decisionLogsApi, type DecisionLog } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Clock, TrendingUp, BarChart3 } from 'lucide-react'

export function DecisionLogPanel() {
  const { data: logs = [] } = useQuery({
    queryKey: ['decision-logs'],
    queryFn: decisionLogsApi.list,
  })

  const { data: patterns } = useQuery({
    queryKey: ['decision-logs', 'patterns'],
    queryFn: decisionLogsApi.patterns,
  })

  const formatDuration = (sec: number | null) => {
    if (!sec) return '-'
    if (sec < 60) return `${sec}秒`
    if (sec < 3600) return `${Math.round(sec / 60)}分钟`
    return `${Math.round(sec / 3600)}小时`
  }

  const getDurationColor = (sec: number | null) => {
    if (!sec) return 'text-muted-foreground'
    if (sec < 300) return 'text-green-500'
    if (sec < 900) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getSatisfactionEmoji = (s: number | null) => {
    if (!s) return ''
    return ['', '😣', '😐', '🙂', '😊', '😄'][s] || ''
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="size-3.5" />
            决策记录
          </TabsTrigger>
          <TabsTrigger value="patterns" className="gap-1.5">
            <TrendingUp className="size-3.5" />
            模式分析
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {logs.map((log: DecisionLog) => (
                <div key={log.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">{log.title}</h4>
                    <Badge variant="outline" className="text-xs">{log.category}</Badge>
                  </div>
                  {log.chosenOption && (
                    <p className="text-xs text-muted-foreground">选择：{log.chosenOption}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <span className={getDurationColor(log.durationSec)}>
                      耗时：{formatDuration(log.durationSec)}
                    </span>
                    {log.satisfaction && (
                      <span>满意度：{getSatisfactionEmoji(log.satisfaction)}</span>
                    )}
                    {log.ruleApplied && (
                      <Badge variant="secondary" className="text-xs">套用规则</Badge>
                    )}
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  暂无决策记录
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="patterns">
          {patterns ? (
            <div className="space-y-4">
              {/* 分类统计 */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="size-4" />
                  按分类统计
                </h4>
                {patterns.byCategory.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <span className="text-sm font-medium">{cat.category}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{cat.count}次</span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground space-y-1">
                      <div>平均耗时：{formatDuration(cat.avgDuration)}</div>
                      {cat.avgSatisfaction && (
                        <div>满意度：{getSatisfactionEmoji(Math.round(cat.avgSatisfaction))}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 本周趋势 */}
              {patterns.recentWeek.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">本周趋势</h4>
                  <div className="flex gap-1 h-20 items-end">
                    {patterns.recentWeek.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-primary rounded-t"
                          style={{ height: `${Math.min(100, (day.count / 10) * 100)}%` }}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              数据积累中，记录更多决策后显示模式分析
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
