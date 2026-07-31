import { useRef } from 'react'
import { Send, Square, Brain, Mic, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { genId } from './types'

export function ChatInputArea({
  input,
  setInput,
  loading,
  deepThink,
  setDeepThink,
  images,
  setImages,
  speechSupported,
  listening,
  onToggleVoice,
  onSend,
  onStop,
}: {
  input: string
  setInput: (v: string) => void
  loading: boolean
  deepThink: boolean
  setDeepThink: (v: boolean | ((v: boolean) => boolean)) => void
  images: { id: string; dataUrl: string; name: string }[]
  setImages: (fn: (prev: { id: string; dataUrl: string; name: string }[]) => { id: string; dataUrl: string; name: string }[]) => void
  speechSupported: boolean
  listening: boolean
  onToggleVoice: () => void
  onSend: (text: string) => void
  onStop: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef(images)
  imagesRef.current = images

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const remain = 4 - imagesRef.current.length
    if (remain <= 0) return
    Array.from(files).slice(0, remain).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setImages((prev) => [...prev, { id: genId(), dataUrl, name: file.name }])
      }
      reader.readAsDataURL(file)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="border-t border-white/5 px-3 py-3">
      {/* 图片预览 */}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative">
              <img src={img.dataUrl} alt={img.name} className="h-14 w-14 rounded-lg border border-white/10 object-cover" />
              <button
                type="button"
                onClick={() => setImages((p) => p.filter((x) => x.id !== img.id))}
                className="absolute -right-1 -top-1 rounded-full bg-white/10 p-0.5 text-white/60 shadow-sm hover:text-white"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 pb-2 pt-2 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.07]">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend(input)
            }
          }}
          rows={1}
          placeholder="有问题，尽管问"
          className="max-h-32 min-h-[36px] w-full resize-none bg-transparent py-1 text-[14px] leading-relaxed text-white placeholder:text-white/30 focus-visible:outline-none"
        />

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDeepThink((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                deepThink
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-white/10 text-white/45 hover:border-white/20 hover:text-white/70'
              )}
              title="开启后 AI 会先一步步推理再回答，适合复杂问题（更慢）"
            >
              <Brain className="size-3.5" /> 深度思考
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {speechSupported && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('size-8 text-white/40 hover:text-white', listening && 'text-primary')}
                title={listening ? '停止语音输入' : '语音输入'}
                onClick={onToggleVoice}
              >
                <Mic className="size-4" />
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="size-8 text-white/40 hover:text-white" title="上传图片" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-4" />
            </Button>
            {loading ? (
              <Button size="icon" className="size-8 shrink-0 rounded-xl" onClick={onStop} title="停止">
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button size="icon" className="size-8 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none" disabled={!input.trim()} onClick={() => onSend(input)}>
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-1.5 px-1 text-center text-[10px] leading-relaxed text-white/20">
        Enter 发送 · Shift+Enter 换行 · 支持图片 / 语音
      </p>
    </div>
  )
}
