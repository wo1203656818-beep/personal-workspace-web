import { Sparkles, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DailyDigestCard({
  currentView,
  digestLoading,
  digestData,
  regenerateDigestMutation,
  digestExpanded,
  onDigestExpandedChange,
}: {
  currentView: string
  digestLoading: boolean
  digestData: { digest: string; cached?: boolean } | undefined
  regenerateDigestMutation: { mutate: () => void; isPending: boolean }
  digestExpanded: boolean
  onDigestExpandedChange: (expanded: boolean) => void
}) {
  if (currentView !== 'myday') return null
  if (!digestLoading && !digestData?.digest) return null

  return (
    <div className="mb-3 rounded-2xl border bg-gradient-to-r from-blue-500/5 to-violet-500/5 p-3 md:p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
          <Sparkles className="size-4" />
          今日简报
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => regenerateDigestMutation.mutate()}
            disabled={regenerateDigestMutation.isPending || digestLoading}
            title="重新生成"
          >
            <RefreshCw className={`size-3.5 ${regenerateDigestMutation.isPending || digestLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onDigestExpandedChange(!digestExpanded)}
          >
            {digestExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>
      {digestExpanded && (
        <div className="mt-2">
          {digestLoading && !digestData ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-3.5 animate-spin" /> 正在生成今日简报...
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90">{(digestData as { digest?: string } | undefined)?.digest}</p>
          )}
        </div>
      )}
    </div>
  )
}
