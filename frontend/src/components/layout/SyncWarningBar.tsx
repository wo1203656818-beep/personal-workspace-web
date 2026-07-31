import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SyncWarningBar({
  syncFailure,
  onNavigate,
  onDismiss,
}: {
  syncFailure: { source: string; message: string }
  onNavigate: (path: string) => void
  onDismiss: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4" />
        <span className="font-medium">{syncFailure.source}</span>
        <span className="text-amber-600 dark:text-amber-400">{syncFailure.message}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200"
          onClick={() => onNavigate('/settings')}
        >
          查看设置
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 text-amber-600 hover:text-amber-800 dark:text-amber-400"
          onClick={onDismiss}
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  )
}
