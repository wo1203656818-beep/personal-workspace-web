import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** 自定义操作区域（ReactNode），优先级高于 onAction */
  action?: ReactNode
  /** 默认操作按钮文案，与 action 互斥，提供简化用法 */
  actionLabel?: string
  /** 默认操作按钮点击回调 */
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('empty-state px-4 sm:px-6', className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-300 hover:scale-105">
        <Icon className="size-8" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mb-4 max-w-xs text-center text-sm text-muted-foreground sm:max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="flex items-center justify-center gap-2">{action}</div>}
      {!action && actionLabel && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} className="rounded-lg">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
