import { useState } from 'react'
import { ImageIcon, Loader2, Sparkles, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const SIZE_OPTIONS = [
  { value: '1024x1024', label: '方形 1024x1024' },
  { value: '1024x1792', label: '竖版 1024x1792' },
  { value: '1792x1024', label: '横版 1792x1024' },
]

export function AiImageTool() {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [style, setStyle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ prompt: string; url: string; time: string }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('aiImageHistory') || '[]')
    } catch { return [] }
  })

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    setImageUrl(null)
    
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
      const res = await fetch(`${API_BASE}/tools/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt: prompt.trim(), size, style: style || undefined }),
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '生成失败' }))
        throw new Error(err.error || `请求失败 (${res.status})`)
      }
      
      const data = await res.json()
      setImageUrl(data.imageUrl || data.url)
      const newEntry = { prompt: prompt.trim(), url: data.imageUrl || data.url, time: new Date().toLocaleString('zh-CN') }
      const updated = [newEntry, ...history].slice(0, 20)
      setHistory(updated)
      localStorage.setItem('aiImageHistory', JSON.stringify(updated))
      toast.success('图片已生成')
    } catch (err: any) {
      setError(err.message)
      toast.error(`生成失败: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const downloadImage = () => {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `ai-image-${Date.now()}.png`
    a.click()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">描述图片内容</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="一只可爱的猫在阳光下打盹，水彩风格..."
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">风格:</span>
            <div className="flex flex-wrap gap-1">
              {['', '写实', '水彩', '油画', '二次元', '赛博朋克', '水墨'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                    style === s
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'border border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {s || '默认'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generate} disabled={generating || !prompt.trim()} className="gap-1.5 rounded-lg">
              {generating ? (
                <><Loader2 className="size-4 animate-spin" /> 生成中...</>
              ) : (
                <><Sparkles className="size-4" /> 生成</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {imageUrl && (
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <img src={imageUrl} alt={prompt} className="w-full rounded-lg" />
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 gap-1 rounded-lg"
                onClick={downloadImage}
              >
                <Download className="size-3.5" /> 下载
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!imageUrl && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <ImageIcon className="size-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">输入描述，AI 将为你生成图片</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">生成历史</h3>
            <button
              type="button"
              onClick={() => {
                setHistory([])
                localStorage.removeItem('aiImageHistory')
              }}
              className="text-[10px] text-destructive hover:text-destructive/80"
            >
              清空历史
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {history.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrompt(item.prompt)
                  setImageUrl(item.url)
                }}
                className="group relative overflow-hidden rounded-lg border"
              >
                <img src={item.url} alt={item.prompt} className="aspect-square w-full object-cover" />
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-1 text-[10px] text-white">{item.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}