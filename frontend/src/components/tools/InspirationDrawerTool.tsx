import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entertainmentApi, type Inspiration, type SavedInspiration } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Bookmark, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function InspirationDrawerTool() {
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState<Inspiration | null>(null)

  const { data: saved = [] } = useQuery({
    queryKey: ['inspirations'],
    queryFn: entertainmentApi.savedInspirations,
  })

  const drawMutation = useMutation({
    mutationFn: entertainmentApi.inspiration,
    onSuccess: setCurrent,
  })

  const saveMutation = useMutation({
    mutationFn: entertainmentApi.saveInspiration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspirations'] })
      toast.success('已收藏')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: entertainmentApi.deleteInspiration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspirations'] })
      toast.success('已删除')
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">灵感抽屉</h3>
        <p className="text-sm text-muted-foreground">随机抽取一个创意灵感</p>
      </div>

      {current ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-primary font-medium">{current.category}</span>
          </div>
          <p className="text-base font-medium leading-relaxed">{current.content}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                saveMutation.mutate({ content: current.content, category: current.category })
              }
              disabled={saveMutation.isPending}
            >
              <Bookmark className="size-3 mr-1" />
              收藏
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => drawMutation.mutate()}
              disabled={drawMutation.isPending}
            >
              再抽一张
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => drawMutation.mutate()}
          disabled={drawMutation.isPending}
          className="w-full"
        >
          {drawMutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
          打开灵感抽屉
        </Button>
      )}

      {saved.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">收藏的灵感</h4>
          <div className="space-y-1">
            {saved.map((s: SavedInspiration) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
                <span className="text-xs text-muted-foreground shrink-0">{s.category}</span>
                <span className="text-sm flex-1 truncate">{s.content}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0 shrink-0"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
