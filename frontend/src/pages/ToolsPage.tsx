import { Coins, Pen, Shield, Zap, Palette, Lightbulb, Target, Feather, CreditCard } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DecisionRules } from '@/components/tools/DecisionRules'
import { CopywritingTool } from '@/components/tools/CopywritingTool'
import { CyberFortuneTool } from '@/components/tools/CyberFortuneTool'
import { DailyPersonaTool } from '@/components/tools/DailyPersonaTool'
import { InspirationDrawerTool } from '@/components/tools/InspirationDrawerTool'
import { DailyChallengeTool } from '@/components/tools/DailyChallengeTool'
import { PoemTool } from '@/components/tools/PoemTool'
import { TarotTool } from '@/components/tools/TarotTool'

const funTabs = [
  { value: 'cyber-fortune', label: '赛博运势', icon: Zap },
  { value: 'persona', label: '今日人设', icon: Palette },
  { value: 'inspiration', label: '灵感抽屉', icon: Lightbulb },
  { value: 'challenge', label: '随机挑战', icon: Target },
  { value: 'poem', label: 'AI 写诗', icon: Feather },
  { value: 'tarot', label: '塔罗牌', icon: CreditCard },
]

export function ToolsPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-amber-400 to-yellow-500 md:size-10">
            <Coins className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">工具箱</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">AI 文案 · 决策规则 · 趣味娱乐</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="cyber-fortune" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b px-4 pt-3 md:px-6">
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0 flex-wrap">
            {funTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1.5 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none md:text-sm"
              >
                <tab.icon className="size-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="copywriting"
              className="gap-1.5 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none md:text-sm"
            >
              <Pen className="size-3.5" />
              文案生成
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="gap-1.5 rounded-t-lg border-b-2 border-transparent px-3 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none md:text-sm"
            >
              <Shield className="size-3.5" />
              决策规则
            </TabsTrigger>
          </TabsList>
        </div>
        <ScrollArea className="flex-1">
          <TabsContent value="cyber-fortune" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <CyberFortuneTool />
          </TabsContent>
          <TabsContent value="persona" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <DailyPersonaTool />
          </TabsContent>
          <TabsContent value="inspiration" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <InspirationDrawerTool />
          </TabsContent>
          <TabsContent value="challenge" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <DailyChallengeTool />
          </TabsContent>
          <TabsContent value="poem" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <PoemTool />
          </TabsContent>
          <TabsContent value="tarot" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <TarotTool />
          </TabsContent>
          <TabsContent value="copywriting" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <CopywritingTool />
          </TabsContent>
          <TabsContent value="rules" className="mt-0 p-4 data-[state=inactive]:hidden md:px-6">
            <DecisionRules />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
