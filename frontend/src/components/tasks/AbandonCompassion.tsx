import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Heart, Clock } from 'lucide-react'

const COMPASSION_MESSAGES = [
  '放弃不等于失败，是选择把精力放在更重要的事上',
  '你已经在思考了，这本身就是进步',
  '有些事现在不做，不代表永远不做',
  '放下执念，才能拿起更好的',
  '能承认"这件事我现在不想做"，是成熟的标志',
  '你的时间有限，不必为每个选择内疚',
  '今天的放弃，可能是明天的正确决定',
]

const COOLDOWN_SEC = 30

interface AbandonCompassionProps {
  taskTitle: string
  onConfirm: () => void
  onCancel: () => void
}

export function AbandonCompassion({ taskTitle, onConfirm, onCancel }: AbandonCompassionProps) {
  const [message] = useState(
    () => COMPASSION_MESSAGES[Math.floor(Math.random() * COMPASSION_MESSAGES.length)],
  )
  const [cooldown, setCooldown] = useState(COOLDOWN_SEC)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-sm rounded-xl bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Heart className="size-5 text-primary" />
          <h3 className="text-lg font-medium">确定要放弃吗？</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-1">「{taskTitle}」</p>

        <div className="rounded-lg bg-primary/5 p-3 mb-4">
          <p className="text-sm italic text-primary/80">"{message}"</p>
        </div>

        {cooldown > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 justify-center">
            <Clock className="size-3" />
            <span>冷静期 {cooldown} 秒，按钮即将可用</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}>
            再想想
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={cooldown > 0}>
            {cooldown > 0 ? `放弃 (${cooldown}s)` : '放弃'}
          </Button>
        </div>
      </div>
    </div>
  )
}
