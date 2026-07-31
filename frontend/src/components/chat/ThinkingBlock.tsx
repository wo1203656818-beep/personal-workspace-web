import { useState } from 'react'
import { Brain } from 'lucide-react'

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-[12px] font-medium text-white/50 transition-colors hover:text-white/70"
      >
        <Brain className="size-3.5" />
        <span>思考过程</span>
        <span className="ml-auto text-white/30">{open ? '收起 ▾' : '展开 ▸'}</span>
      </button>
      {open && (
        <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[12px] leading-relaxed text-white/35">
          {text}
        </div>
      )}
    </div>
  )
}
