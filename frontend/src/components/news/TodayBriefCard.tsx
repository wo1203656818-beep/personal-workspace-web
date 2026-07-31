import { CalendarDays } from 'lucide-react'

interface TodayBrief {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

function parseTopItems(
  json: string,
): Array<{ title: string; summary?: string; url?: string; reason?: string }> {
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

export function TodayBriefCard({
  todayBrief,
  onOpenDigest,
}: {
  todayBrief: TodayBrief
  onOpenDigest: () => void
}) {
  return (
    <div className="border rounded-xl p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold">{todayBrief.title || `今日简报 · ${todayBrief.date}`}</h2>
        </div>
        <button
          onClick={onOpenDigest}
          className="px-2.5 py-1 text-xs border rounded-lg hover:bg-muted flex items-center gap-1.5"
        >
          <CalendarDays className="w-3.5 h-3.5" /> 历史
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{todayBrief.overview}</p>
      <div className="space-y-2">
        {parseTopItems(todayBrief.topItems).map((t, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              {t.url ? (
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {t.title}
                </a>
              ) : (
                <span className="font-medium">{t.title}</span>
              )}
              {t.summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.summary}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
