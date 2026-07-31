import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function ChatSettingsModal({
  open,
  onClose,
  customPrompt,
  setCustomPrompt,
}: {
  open: boolean
  onClose: () => void
  customPrompt: string
  setCustomPrompt: (v: string) => void
}) {
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-80 rounded-2xl border border-white/10 bg-[#1a1a1a] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          title="关闭"
          className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <X className="size-4" />
        </button>
        <div className="mb-1 pr-6 text-[14px] font-medium text-white/90">回复偏好</div>
        <p className="mb-3 text-[12px] leading-relaxed text-white/40">
          告诉 AI 你希望它怎么回答你，之后每次对话都会自动生效。不填就用默认方式回答。
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {['回答尽量简短', '多用列表和表格', '解释得通俗一点', '像朋友一样聊天'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() =>
                setCustomPrompt(
                  customPrompt.includes(s)
                    ? customPrompt
                    : (customPrompt ? customPrompt + '；' : '') + s,
                )
              }
              className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
            >
              + {s}
            </button>
          ))}
        </div>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={3}
          placeholder="例如：回答尽量简短；专业术语要解释…"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
        />
        <div className="mt-3 flex gap-2">
          {customPrompt && (
            <button
              type="button"
              onClick={() => setCustomPrompt('')}
              className="rounded-xl border border-white/10 px-3 py-2 text-[12px] text-white/50 hover:border-white/20 hover:text-white/70"
            >
              清空
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-primary py-2 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
