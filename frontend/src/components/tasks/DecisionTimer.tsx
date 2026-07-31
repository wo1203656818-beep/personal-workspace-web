import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Timer, X } from 'lucide-react'

interface DecisionTimerProps {
  duration?: number // 分钟
  onTimeUp: () => void
  onCancel: () => void
}

export function DecisionTimer({ duration = 5, onTimeUp, onCancel }: DecisionTimerProps) {
  const [seconds, setSeconds] = useState(duration * 60)
  const [running, setRunning] = useState(true)
  // 用 ref 缓存回调，避免父组件渲染时产生新引用导致 effect 频繁重置
  const onTimeUpRef = useRef(onTimeUp)
  onTimeUpRef.current = onTimeUp

  useEffect(() => {
    if (!running) return
    if (seconds <= 0) {
      onTimeUpRef.current()
      return
    }
    const timer = setInterval(() => setSeconds((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [seconds, running])

  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  const progress = 1 - seconds / (duration * 60)

  // 颜色：绿→黄→红
  const color = progress < 0.5 ? 'text-green-500' : progress < 0.8 ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Timer className={`size-5 ${color}`} />
      <div className="flex-1">
        <p className="text-sm font-medium">决策倒计时</p>
        <p className="text-xs text-muted-foreground">时间到后必须做出选择，不再纠结</p>
      </div>
      <div className={`text-2xl font-mono font-bold ${color}`}>
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setRunning(!running)}>
          {running ? '暂停' : '继续'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
