import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { decisionRulesApi, type DecisionRule } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Shield, Clock, Zap, X } from 'lucide-react'

interface AntiRuminationGuardProps {
  category: string
  options?: string[]
  onApplyRule?: (rule: DecisionRule) => void
  onForceDecide?: () => void
}

const MAX_OPTIONS = 3
const RUMINATION_TIME_SEC = 600

export function AntiRuminationGuard({
  category,
  options = [],
  onApplyRule,
  onForceDecide,
}: AntiRuminationGuardProps) {
  const [elapsed, setElapsed] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const startRef = useRef(Date.now())

  const { data: rules = [] } = useQuery({
    queryKey: ['decision-rules'],
    queryFn: decisionRulesApi.list,
  })

  const matchingRules = rules.filter((r: DecisionRule) => r.category === category)

  useEffect(() => {
    if (dismissed) return
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [dismissed])

  if (dismissed) return null

  const warnings: string[] = []
  if (options.length > MAX_OPTIONS) {
    warnings.push(`选项过多（${options.length}个），建议砍到${MAX_OPTIONS}个以内`)
  }
  if (elapsed > RUMINATION_TIME_SEC) {
    warnings.push(`已思考超过${Math.round(elapsed / 60)}分钟，建议直接行动`)
  }

  if (warnings.length === 0 && matchingRules.length === 0) return null

  return (
    <div className="space-y-2">
      {matchingRules.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/50 bg-primary/5 p-3">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Shield className="size-4 text-primary" />
              发现匹配规则
            </p>
            {matchingRules.slice(0, 2).map((rule) => (
              <p key={rule.id} className="text-xs text-muted-foreground">
                如果 <span className="font-medium">{rule.condition}</span>，就 <span className="font-medium text-primary">{rule.action}</span>
              </p>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => onApplyRule?.(matchingRules[0])}>
            套用
          </Button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-3">
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400">
                <Clock className="size-4" />
                {w}
              </p>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={onForceDecide}>
              <Zap className="size-3 mr-1" />
              立即决定
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              <X className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
