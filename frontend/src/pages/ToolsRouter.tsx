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

const toolMeta: Record<string, { title: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; gradient: string }> = {
  'cyber-fortune': { title: '赛博运势', description: 'AI 占卜每日运势，获取专属指引', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-500/10', gradient: 'from-amber-500 to-orange-500' },
  'persona': { title: '今日人设', description: '生成每日角色卡片，切换生活模式', icon: Palette, color: 'text-pink-500', bg: 'bg-pink-500/10', gradient: 'from-pink-500 to-rose-500' },
  'inspiration': { title: '灵感抽屉', description: '随机获取创意灵感与写作素材', icon: Lightbulb, color: 'text-yellow-500', bg: 'bg-yellow-500/10', gradient: 'from-yellow-500 to-amber-500' },
  'challenge': { title: '随机挑战', description: '接受每日挑战，突破自我边界', icon: Target, color: 'text-red-500', bg: 'bg-red-500/10', gradient: 'from-red-500 to-rose-500' },
  'poem': { title: 'AI 写诗', description: '借助 AI 创作优美诗篇', icon: Feather, color: 'text-violet-500', bg: 'bg-violet-500/10', gradient: 'from-violet-500 to-purple-500' },
  'tarot': { title: '塔罗牌', description: '塔罗占卜，探索内心指引', icon: CreditCard, color: 'text-indigo-500', bg: 'bg-indigo-500/10', gradient: 'from-indigo-500 to-blue-500' },
  'ai-image': { title: 'AI 图片', description: '文字描述生成精美图片', icon: ImageIcon, color: 'text-sky-500', bg: 'bg-sky-500/10', gradient: 'from-sky-500 to-cyan-500' },
  'copywriting': { title: '文案生成', description: 'AI 辅助撰写营销文案与创意内容', icon: Pen, color: 'text-teal-500', bg: 'bg-teal-500/10', gradient: 'from-teal-500 to-emerald-500' },
  'rules': { title: '决策规则', description: '配置自动化决策规则与触发器', icon: Shield, color: 'text-cyan-500', bg: 'bg-cyan-500/10', gradient: 'from-cyan-500 to-blue-500' },
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
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-lg" onClick={() => navigate('/tools')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className={cn('icon-badge size-9 bg-gradient-to-br md:size-10', meta.gradient)}>
            <Icon className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">{meta.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{meta.description}</p>
          </div>
        </div>
      </div>
      <div className="page-content-wide">
        <div className="mx-auto max-w-2xl">
          <ErrorBoundary>
            <Component />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}