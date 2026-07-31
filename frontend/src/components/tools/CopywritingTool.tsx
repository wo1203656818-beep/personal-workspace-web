import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2, Copy, Check, Bookmark, ChevronDown, ChevronUp,
} from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { PLATFORMS, STYLES } from '@/lib/constants/copywriting'

interface CopyResult {
  content: string
  hashtags: string[]
  hook: string
}

interface SavedCopy {
  id: string
  platform: string
  style: string
  topic: string
  content: string
  hashtags: string[]
  createdAt: number
}

function loadSaved(): SavedCopy[] {
  try { return JSON.parse(localStorage.getItem('copywriting:saved') || '[]') } catch { return [] }
}
function saveToLocal(item: SavedCopy) {
  const list = loadSaved()
  list.unshift(item)
  if (list.length > 50) list.length = 50
  localStorage.setItem('copywriting:saved', JSON.stringify(list))
}
function removeSaved(id: string) {
  const list = loadSaved().filter(i => i.id !== id)
  localStorage.setItem('copywriting:saved', JSON.stringify(list))
}

export function CopywritingTool() {
  const [platform, setPlatform] = useState('xiaohongshu')
  const [style, setStyle] = useState('daily')
  const [topic, setTopic] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [showRef, setShowRef] = useState(false)
  const [results, setResults] = useState<CopyResult[]>([])
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [saved, setSaved] = useState<SavedCopy[]>(loadSaved())

  const generateMutation = useMutation({
    mutationFn: () => aiApi.copywriting({
      platform,
      topic,
      style,
      referenceUrl: referenceUrl.trim() || undefined,
      count: 3,
    }),
    onSuccess: (data) => {
      setResults(data.results || [])
      if (data.results?.length === 0) toast.info('生成结果为空，请换个描述重试')
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIdx(idx)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch { toast.error('复制失败') }
  }

  const handleSave = (item: CopyResult) => {
    const entry: SavedCopy = {
      id: crypto.randomUUID(),
      platform,
      style,
      topic,
      content: item.content,
      hashtags: item.hashtags,
      createdAt: Date.now(),
    }
    saveToLocal(entry)
    setSaved(loadSaved())
    toast.success('已收藏')
  }

  const handleRemoveSaved = (id: string) => {
    removeSaved(id)
    setSaved(loadSaved())
  }

  const formatFullText = (item: { content: string; hashtags: string[] }) => {
    const tags = item.hashtags.length > 0
      ? '\n\n' + item.hashtags.map(t => `#${t}#`).join(' ')
      : ''
    return item.content + tags
  }

  const platformLabel = PLATFORMS.find(p => p.value === platform)?.label || ''
  const styleLabel = STYLES.find(s => s.value === style)?.label || ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4 md:p-6">
          {/* 平台选择 */}
          <div>
            <label className="text-sm font-medium mb-2 block">目标平台</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPlatform(p.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all',
                    platform === p.value
                      ? 'border-primary bg-primary/5 font-medium shadow-sm'
                      : 'border-border hover:bg-muted text-muted-foreground'
                  )}
                >
                  <p.icon className={cn('size-4', platform === p.value ? p.color : '')} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 风格选择 */}
          <div>
            <label className="text-sm font-medium mb-2 block">写作风格</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full border text-sm transition-all',
                    style === s.value
                      ? 'border-primary bg-primary/5 font-medium shadow-sm'
                      : 'border-border hover:bg-muted text-muted-foreground'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 主题输入 */}
          <div>
            <label className="text-sm font-medium mb-2 block">主题 / 关键词</label>
            <Textarea
              placeholder="输入你想写的主题，例如：推荐一款好用的降噪耳机、分享我的健身餐食谱、对比 iPhone 和 Android 的拍照效果..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* 参考链接 */}
          <div>
            <button
              onClick={() => setShowRef(!showRef)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRef ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              参考链接（可选）
            </button>
            {showRef && (
              <Input
                placeholder="粘贴一个链接，AI 会提取内容后生成文案"
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* 生成按钮 */}
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !topic.trim()}
            className="w-full"
            size="lg"
          >
            {generateMutation.isPending
              ? <><Loader2 className="mr-2 size-4 animate-spin" />AI 正在撰写{platformLabel}文案...</>
              : <>生成文案</>
            }
          </Button>

          {/* 生成结果 */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                生成了 {results.length} 条{platformLabel}·{styleLabel}文案
              </h3>
              {results.map((item, idx) => (
                <div key={idx} className="border rounded-xl p-4 space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">方案 {idx + 1}</span>
                    <span className="text-xs text-muted-foreground italic">{item.hook}</span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{item.content}</div>
                  {item.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.hashtags.map((tag, ti) => (
                        <span key={ti} className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs">
                          #{tag}#
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(formatFullText(item), idx)}
                      className="gap-1.5"
                    >
                      {copiedIdx === idx ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                      {copiedIdx === idx ? '已复制' : '复制全文'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSave(item)}
                      className="gap-1.5"
                    >
                      <Bookmark className="size-3.5" />
                      收藏
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 历史收藏 */}
          {saved.length > 0 && (
            <div className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-medium text-muted-foreground">收藏记录（{saved.length}）</h3>
              {saved.slice(0, 20).map(item => {
                const p = PLATFORMS.find(pp => pp.value === item.platform)
                return (
                  <div key={item.id} className="border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{p?.label || item.platform}</span>
                        <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveSaved(item.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        删除
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">{item.content}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleCopy(formatFullText(item), -1)}
                      >
                        <Copy className="size-3" /> 复制
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
