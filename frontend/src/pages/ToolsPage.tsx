import { Coins, BookOpen, Scroll } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CoinTool } from '@/components/tools/CoinTool'
import { AnswerBookTool } from '@/components/tools/AnswerBookTool'
import { FortuneTool } from '@/components/tools/FortuneTool'

const tabs = [
  { value: 'coin', label: '天意硬币', icon: Coins },
  { value: 'answer', label: '答案之书', icon: BookOpen },
  { value: 'fortune', label: '每日一签', icon: Scroll },
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
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">决策工具</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">基于物理熵的真随机选择</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="coin" className="flex flex-1 flex-col">
        <div className="border-b px-4 pt-3 md:px-6">
          <TabsList className="w-full justify-start gap-1 bg-transparent p-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2 rounded-t-lg border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <tab.icon className="size-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="coin" className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <CoinTool />
        </TabsContent>
        <TabsContent value="answer" className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <AnswerBookTool />
        </TabsContent>
        <TabsContent value="fortune" className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <FortuneTool />
        </TabsContent>
      </Tabs>
    </div>
  )
}
