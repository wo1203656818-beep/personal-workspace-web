import { useState } from 'react'
import { ChevronDown, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/api'
import { MoodWeatherCard } from '@/components/tasks/MoodWeatherCard'
import { MoodHistory } from '@/components/tasks/MoodHistory'
import { QuickActionPool } from '@/components/tasks/QuickActionPool'
import { StaleTaskNudge } from '@/components/tasks/StaleTaskNudge'
import { DailyDigestCard } from '@/components/tasks/DailyDigestCard'
import { PrioritySuggestionsCard } from '@/components/tasks/PrioritySuggestionsCard'
import { NightlyReviewCard } from '@/components/tasks/NightlyReviewCard'

/**
 * 今日概览面板：聚合心情、情绪趋势、快速行动池、久未行动提醒、
 * AI 今日简报、AI 优先级建议、睡前回顾等今日工作台组件。
 * 默认收起，避免遮挡任务列表；AI 类功能按需点击生成，不消耗神经元。
 */
export function TodayPanel({
  tasks,
  onSelectTask,
}: {
  tasks: Task[]
  onSelectTask: (taskId: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border bg-card p-4 hover-lift">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="size-4" />
        </div>
        <span className="text-sm font-medium">今日概览</span>
        <span className="text-xs text-muted-foreground">心情 · 简报 · 建议</span>
        <ChevronDown
          className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="grid gap-3 border-t pt-3 sm:gap-4 sm:pt-4 md:grid-cols-2">
          <MoodWeatherCard />
          <MoodHistory />
          <QuickActionPool />
          <StaleTaskNudge />
          <DailyDigestCard />
          <PrioritySuggestionsCard tasks={tasks} onSelectTask={onSelectTask} />
          <div className="md:col-span-2">
            <NightlyReviewCard />
          </div>
        </div>
      )}
    </div>
  )
}
