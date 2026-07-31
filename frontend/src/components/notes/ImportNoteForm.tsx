import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { notesApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export function ImportNoteForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [zipImporting, setZipImporting] = useState(false)

  const importMutation = useMutation({
    mutationFn: (data: { title: string; content: string; sourceFile?: string }) =>
      notesApi.import(data),
    onSuccess: onDone,
  })

  const handleFile = async (f: File) => {
    setFile(f)
    if (f.name.endsWith('.md') || f.name.endsWith('.markdown')) {
      const text = await f.text()
      setContent(text)
      if (!title) setTitle(f.name.replace(/\.md$/, '').replace(/\.markdown$/, ''))
    }
  }

  const handleZip = async (f: File) => {
    setZipImporting(true)
    try {
      const { unzipSync, strFromU8 } = await import('fflate')
      const buf = new Uint8Array(await f.arrayBuffer())
      const files = unzipSync(buf)
      for (const [path, data] of Object.entries(files)) {
        if (path.endsWith('.md') || path.endsWith('.markdown')) {
          const mdContent = strFromU8(data)
          const mdTitle = path
            .split('/')
            .pop()!
            .replace(/\.md$/, '')
            .replace(/\.markdown$/, '')
          await notesApi.import({ title: mdTitle, content: mdContent, sourceFile: path })
        }
      }
      onDone()
    } catch (e) {
      console.error('ZIP 解压失败:', e)
    } finally {
      setZipImporting(false)
    }
  }

  return (
    <div className="border-b bg-muted/30 px-4 py-4 md:px-6">
      <div className="surface-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" /> 导入 Markdown 笔记
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">笔记标题</Label>
            <Input
              placeholder="输入笔记标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">上传 Markdown 文件</Label>
            <Input
              type="file"
              accept=".md,.markdown"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">或上传 ZIP 批量导入</Label>
          <Input
            type="file"
            accept=".zip"
            onChange={(e) => e.target.files?.[0] && handleZip(e.target.files[0])}
            disabled={zipImporting}
          />
          {zipImporting && <p className="text-xs text-muted-foreground">解压导入中...</p>}
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Markdown 内容</Label>
          <Textarea
            className="min-h-[120px]"
            placeholder="直接粘贴 Markdown 内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!title || !content}
            onClick={() => importMutation.mutate({ title, content, sourceFile: file?.name })}
          >
            确认导入
          </Button>
        </div>
      </div>
    </div>
  )
}
