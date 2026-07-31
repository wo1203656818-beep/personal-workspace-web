import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Zap, Sparkles } from 'lucide-react'

interface IfThenPlanProps {
  ifThenPlan?: string | null
  onUpdate: (plan: string | null) => void
}

const IF_THEN_SUGGESTIONS = [
  { if: '早上喝完咖啡后', then: '做今天最重要的任务' },
  { if: '午休结束后', then: '处理一封邮件或回复一条消息' },
  { if: '坐到电脑前时', then: '先做2分钟最小行动' },
  { if: '感到焦虑时', then: '深呼吸3次，然后做第一个子任务' },
  { if: '不知道先做什么时', then: '选截止日期最近的那个' },
]

export function IfThenPlan({ ifThenPlan, onUpdate }: IfThenPlanProps) {
  const [editing, setEditing] = useState(false)
  const [plan, setPlan] = useState(ifThenPlan || '')

  const handleSave = () => {
    onUpdate(plan || null)
    setEditing(false)
  }

  const handleApplySuggestion = (suggestion: { if: string; then: string }) => {
    setPlan(`如果${suggestion.if}，我就${suggestion.then}`)
  }

  if (!editing && !ifThenPlan) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setEditing(true)}
      >
        <Zap className="size-3" />
        添加 if-then 计划
      </Button>
    )
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          预定义"如果X发生，我就做Y"，减少决策消耗
        </p>
        <Input
          placeholder="如果...我就..."
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="text-sm"
        />

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3" />
            推荐模板：
          </p>
          {IF_THEN_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
              onClick={() => handleApplySuggestion(s)}
            >
              如果{s.if}，我就{s.then}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>保存</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Zap className="size-3 text-primary" />
      <span className="text-sm">{ifThenPlan}</span>
      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditing(true)}>
        修改
      </Button>
    </div>
  )
}
