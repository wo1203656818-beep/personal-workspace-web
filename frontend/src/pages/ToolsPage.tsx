import { useNavigate } from 'react-router-dom'
import {
  Coins,
  Zap,
  Palette,
  Lightbulb,
  Target,
  Feather,
  CreditCard,
  ImageIcon,
  Pen,
  Shield,
  ArrowRight,
  Brain,
  RefreshCw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'
import { decisionRulesApi } from '@/lib/api/decision-rules'

interface ToolCard {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  path: string
}

const tools: ToolCard[] = [
  {
    id: 'cyber-fortune',
    title: '赛博运势',
    description: 'AI 占卜每日运势，获取专属指引',
    icon: Zap,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    path: '/tools/cyber-fortune',
  },
  {
    id: 'persona',
    title: '今日人设',
    description: '生成每日角色卡片，切换生活模式',
    icon: Palette,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    path: '/tools/persona',
  },
  {
    id: 'inspiration',
    title: '灵感抽屉',
    description: '随机获取创意灵感与写作素材',
    icon: Lightbulb,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    path: '/tools/inspiration',
  },
  {
    id: 'challenge',
    title: '随机挑战',
    description: '接受每日挑战，突破自我边界',
    icon: Target,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    path: '/tools/challenge',
  },
  {
    id: 'poem',
    title: 'AI 写诗',
    description: '借助 AI 创作优美诗篇',
    icon: Feather,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    path: '/tools/poem',
  },
  {
    id: 'tarot',
    title: '塔罗牌',
    description: '塔罗占卜，探索内心指引',
    icon: CreditCard,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    path: '/tools/tarot',
  },
  {
    id: 'ai-image',
    title: 'AI 图片',
    description: '文字描述生成精美图片',
    icon: ImageIcon,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    path: '/tools/ai-image',
  },
  {
    id: 'copywriting',
    title: '文案生成',
    description: 'AI 辅助撰写营销文案与创意内容',
    icon: Pen,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    path: '/tools/copywriting',
  },
  {
    id: 'rules',
    title: '决策规则',
    description: '配置自动化决策规则与触发器',
    icon: Shield,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    path: '/tools/rules',
  },
]

export function ToolsPage() {
  usePageTitle('工具')
  const navigate = useNavigate()

  const { data: analysis, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['decision-logs', 'analysis'],
    queryFn: decisionRulesApi.decisionAnalysis,
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white md:size-10">
            <Coins className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">工具箱</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              AI 文案 · 决策规则 · 趣味娱乐
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => {
              const Icon = tool.icon
              return (
                <Card
                  key={tool.id}
                  className="group cursor-pointer border-border/60 transition-all hover:shadow-md hover:border-primary/30"
                  onClick={() => navigate(tool.path)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-xl',
                          tool.bg,
                        )}
                      >
                        <Icon className={cn('size-5', tool.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium">{tool.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {tool.description}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* 决策模式复盘 */}
          <div className="mt-8 border-t pt-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="size-5 text-purple-500" />
                <h2 className="text-base font-semibold">决策模式复盘</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
                刷新
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                </div>
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                {/* 统计概览 */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">总决策数</p>
                    <p className="mt-1 text-2xl font-bold">{analysis.stats.totalLogs}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">平均耗时</p>
                    <p className="mt-1 text-2xl font-bold">
                      {analysis.stats.avgDuration}<span className="text-sm font-normal text-muted-foreground">秒</span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">满意度</p>
                    <p className="mt-1 text-2xl font-bold">
                      {analysis.stats.avgSatisfaction}<span className="text-sm font-normal text-muted-foreground">/5</span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">规则使用率</p>
                    <p className="mt-1 text-2xl font-bold">
                      {analysis.stats.ruleRate}<span className="text-sm font-normal text-muted-foreground">%</span>
                    </p>
                  </div>
                </div>

                {/* AI 洞察报告 */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Brain className="size-4 text-purple-500" />
                    <h3 className="text-sm font-medium">AI 洞察报告</h3>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {analysis.report}
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground/50">
                    生成于 {analysis.generatedAt}
                    {analysis.fromCache && '（缓存）'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">暂无决策数据，开始记录决策后即可查看分析</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}