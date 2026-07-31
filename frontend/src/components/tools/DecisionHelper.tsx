import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CoinTool } from '@/components/tools/CoinTool'
import { AnswerBookTool } from '@/components/tools/AnswerBookTool'
import { FortuneTool } from '@/components/tools/FortuneTool'
import { DecisionTimer } from '@/components/tasks/DecisionTimer'
import { DecisionTemplates } from '@/components/tools/DecisionTemplates'
import { DecisionRules } from '@/components/tools/DecisionRules'

export function DecisionHelper() {
  const [showTimer, setShowTimer] = useState(false)

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col">
        {showTimer && (
          <>
            <section className="p-4">
              <DecisionTimer
                duration={5}
                onTimeUp={() => {
                  setShowTimer(false)
                }}
                onCancel={() => setShowTimer(false)}
              />
            </section>
            <Separator />
          </>
        )}
        <Tabs defaultValue="templates" className="w-full">
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="templates">规则模板</TabsTrigger>
            <TabsTrigger value="rules">我的规则</TabsTrigger>
            <TabsTrigger value="tools">辅助工具</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="p-4">
            <DecisionTemplates />
          </TabsContent>
          <TabsContent value="rules" className="p-4">
            <DecisionRules />
          </TabsContent>
          <TabsContent value="tools">
            <section>
              <CoinTool onUseTimer={() => setShowTimer(true)} />
            </section>
            <Separator />
            <section>
              <AnswerBookTool />
            </section>
            <Separator />
            <section>
              <FortuneTool />
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  )
}
