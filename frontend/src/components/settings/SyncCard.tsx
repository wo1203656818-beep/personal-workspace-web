import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'

interface SyncCardProps {
  lastSync?: string | number | null
  onSync: () => void
  syncing?: boolean
  disabled?: boolean
  syncLabel?: string
  syncingLabel?: string
  children?: ReactNode
  className?: string
}

export function SyncCard({
  lastSync,
  onSync,
  syncing = false,
  disabled = false,
  syncLabel = '立即同步',
  syncingLabel = '同步中...',
  children,
  className,
}: SyncCardProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      <Button
        size="sm"
        disabled={syncing || disabled}
        onClick={onSync}
        className="rounded-lg"
      >
        {syncing ? syncingLabel : syncLabel}
      </Button>
      {lastSync && (
        <p className="text-xs text-muted-foreground">
          上次同步: {formatCST(String(lastSync), 'datetime')}
        </p>
      )}
    </div>
  )
}

export type { SyncCardProps }
