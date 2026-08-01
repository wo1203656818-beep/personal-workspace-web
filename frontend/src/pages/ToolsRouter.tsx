import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Palette, Lightbulb, Target, Feather, CreditCard, ImageIcon, Pen, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CyberFortuneTool } from '@/components/tools/CyberFortuneTool'
import { DailyPersonaTool } from '@/components/tools/DailyPersonaTool'
import { InspirationDrawerTool } from '@/components/tools/InspirationDrawerTool'
import { DailyChallengeTool } from '@/components/tools/DailyChallengeTool'
import { PoemTool } from '@/components/tools/PoemTool'
import { TarotTool } from '@/components/tools/TarotTool'
import { AiImageTool } from '@/components/tools/AiImageTool'
import { CopywritingTool } from '@/components/tools/CopywritingTool'
import { DecisionRules } from '@/components/tools/DecisionRules'

const toolMeta: Record<string, { title: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  'cyber-fortune': { title: '赛博运势', description: 'AI 占卜每日运势，获取专属指引', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  'persona': { title: '今日人设', description: '生成每日角色卡片，切换生活模式', icon: Palette, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  'inspiration': { title: '灵感抽屉', description: '随机获取创意灵感与写作素材', icon: Lightbulb, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  'challenge': { title: '随机挑战', description: '接受每日挑战，突破自我边界', icon: Target, color: 'text-red-500', bg: 'bg-red-500/10' },
  'poem': { title: 'AI 写诗', description: '借助 AI 创作优美诗篇', icon: Feather, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  'tarot': { title: '塔罗牌', description: '塔罗占卜，探索内心指引', icon: CreditCard, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  'ai-image': { title: 'AI 图片', description: '文字描述生成精美图片', icon: ImageIcon, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  'copywriting': { title: '文案生成', description: 'AI 辅助撰写营销文案与创意内容', icon: Pen, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  'rules': { title: '决策规则', description: '配置自动化决策规则与触发器', icon: Shield, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
}

const toolComponents: Record<string, React.ComponentType> = {
  'cyber-fortune': CyberFortuneTool,
  'persona': DailyPersonaTool,
  'inspiration': InspirationDrawerTool,
  'challenge': DailyChallengeTool,
  'poem': PoemTool,
  'tarot': TarotTool,
  'ai-image': AiImageTool,
  'copywriting': CopywritingTool,
  'rules': DecisionRules,
}

export function ToolsRouter() {
  const { toolId } = useParams<{ toolId: string }>()
  const navigate = useNavigate()

  const meta = toolId ? toolMeta[toolId] : undefined
  const Component = toolId ? toolComponents[toolId] : undefined

  if (!meta || !Component) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">工具未找到</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/tools')}>
          返回工具箱
        </Button>
      </div>
    )
  }

  const Icon = meta.icon

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate('/tools')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', meta.bg, 'md:size-10')}>
            <Icon className={cn('size-5', meta.color)} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{meta.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{meta.description}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <ErrorBoundary>
            <Component />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}