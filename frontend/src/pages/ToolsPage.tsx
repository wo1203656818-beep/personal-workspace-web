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
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-amber-400 to-yellow-500 md:size-10">
            <Coins className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">工具箱</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              AI 文案 · 决策规则 · 趣味娱乐
            </p>
          </div>
        </div>
      </div>

      <div className="page-content-wide">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            {tools.map((tool) => {
              const Icon = tool.icon
              return (
                <Card
                  key={tool.id}
                  className="group cursor-pointer border-border/60 transition-all hover:shadow-md hover:border-primary/30"
                  onClick={() => navigate(tool.path)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10',
                          tool.bg,
                        )}
                      >
                        <Icon className={cn('size-4 sm:size-5', tool.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-medium sm:text-sm">{tool.title}</h3>
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2 sm:text-xs">
                          {tool.description}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary sm:size-4" />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* 决策模式复盘 */}
          <div className="mt-6 border-t pt-6 sm:mt-8 sm:pt-8">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 sm:size-8">
                  <Brain className="size-4 text-purple-500" />
                </div>
                <h2 className="text-sm font-semibold sm:text-base">决策模式复盘</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-muted-foreground"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
                刷新
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ) : analysis ? (
              <div className="space-y-4">
                {/* 统计概览 */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="rounded-lg border bg-card p-2.5 sm:p-3">
                    <p className="text-[10px] text-muted-foreground sm:text-xs">总决策数</p>
                    <p className="mt-1 text-xl font-bold sm:text-2xl">{analysis.stats.totalLogs}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-2.5 sm:p-3">
                    <p className="text-[10px] text-muted-foreground sm:text-xs">平均耗时</p>
                    <p className="mt-1 text-xl font-bold sm:text-2xl">
                      {analysis.stats.avgDuration}<span className="text-xs font-normal text-muted-foreground">秒</span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-2.5 sm:p-3">
                    <p className="text-[10px] text-muted-foreground sm:text-xs">满意度</p>
                    <p className="mt-1 text-xl font-bold sm:text-2xl">
                      {analysis.stats.avgSatisfaction}<span className="text-xs font-normal text-muted-foreground">/5</span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-2.5 sm:p-3">
                    <p className="text-[10px] text-muted-foreground sm:text-xs">规则使用率</p>
                    <p className="mt-1 text-xl font-bold sm:text-2xl">
                      {analysis.stats.ruleRate}<span className="text-xs font-normal text-muted-foreground">%</span>
                    </p>
                  </div>
                </div>

                {/* AI 洞察报告 */}
                <div className="rounded-lg border bg-card p-3 sm:p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Brain className="size-4 text-purple-500" />
                    <h3 className="text-sm font-medium">AI 洞察报告</h3>
                  </div>
                  <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {analysis.report}
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground/50">
                    生成于 {analysis.generatedAt}
                    {analysis.fromCache && '（缓存）'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground sm:text-sm">暂无决策数据，开始记录决策后即可查看分析</p>
            )}
          </div>
      </div>
    </div>
  )
}