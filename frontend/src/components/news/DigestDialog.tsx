import { Loader2, CalendarDays } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

interface DigestItem {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

function parseTopItems(json: string): Array<{ title: string; summary?: string; url?: string; reason?: string }> {
  try { return JSON.parse(json) } catch { return [] }
}

export function DigestDialog({
  open,
  onOpenChange,
  digests,
  expandedDigestId,
  onToggleDigest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  digests: DigestItem[] | undefined
  expandedDigestId: string | null
  onToggleDigest: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5" /> 历史简报</DialogTitle>
          <DialogDescription>浏览过往的每日资讯简报。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {digests && digests.length > 0 ? (
            digests.map(digest => {
              const topItems = parseTopItems(digest.topItems)
              const isExpanded = expandedDigestId === digest.id
              return (
                <div key={digest.id} className="border rounded-lg overflow-hidden">
                  <button onClick={() => onToggleDigest(digest.id)} className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs text-muted-foreground">{digest.date}</span>
                      <p className="font-medium text-sm truncate">{digest.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? '收起' : '展开'}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t">
                      <p className="text-sm text-muted-foreground mt-2 mb-2">{digest.overview}</p>
                      <div className="space-y-1.5">
                        {topItems.map((t, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                            <div className="min-w-0">
                              {t.url ? (
                                <a href={t.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">{t.title}</a>
                              ) : (
                                <span className="font-medium">{t.title}</span>
                              )}
                              {t.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.summary}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              {digests ? '暂无历史简报' : <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
