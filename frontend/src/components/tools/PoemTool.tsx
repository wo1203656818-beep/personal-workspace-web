import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { entertainmentApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Feather } from 'lucide-react'

const STYLES = [
  { value: 'modern', label: '现代诗' },
  { value: 'classical', label: '古风' },
  { value: 'acrostic', label: '藏头诗' },
  { value: 'humor', label: '打油诗' },
]

export function PoemTool() {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('modern')
  const [poem, setPoem] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => entertainmentApi.aiPoem({ topic, style }),
    onSuccess: (data) => setPoem(data.poem),
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">AI 写诗</h3>
        <p className="text-sm text-muted-foreground">输入主题，AI 为你写一首诗</p>
      </div>

      <input
        type="text"
        placeholder="输入主题，如：秋天、思念、代码..."
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="flex gap-2">
        {STYLES.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={style === s.value ? 'default' : 'outline'}
            onClick={() => setStyle(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={!topic || mutation.isPending}
        className="w-full"
      >
        {mutation.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Feather className="size-4 mr-2" />}
        写诗
      </Button>

      {poem && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap font-serif">{poem}</p>
        </div>
      )}
    </div>
  )
}
