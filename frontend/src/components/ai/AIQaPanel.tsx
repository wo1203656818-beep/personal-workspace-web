import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, FileText, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { aiApi } from '@/lib/api/ai'

interface AIQaPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AIQaPanel({ open, onOpenChange }: AIQaPanelProps) {
  const [question, setQuestion] = useState('')
  const [submittedQuestion, setSubmittedQuestion] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ai', 'qa', submittedQuestion],
    queryFn: () => aiApi.qa(submittedQuestion),
    enabled: !!submittedQuestion,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  const handleSubmit = () => {
    if (!question.trim()) return
    setSubmittedQuestion(question.trim())
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[60vh]">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4" />
            AI 问答 — 搜索笔记和知识库
          </SheetTitle>
          <SheetClose />
        </SheetHeader>

        <div className="flex h-[calc(100%-60px)] flex-col">
          <ScrollArea className="flex-1 pr-4">
            {!submittedQuestion ? (
              <p className="text-sm text-muted-foreground">输入问题，AI 将从你的笔记和知识库中寻找答案</p>
            ) : isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                搜索并生成回答...
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="size-4" />
                回答生成失败，请重试
                <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
              </div>
            ) : data ? (
              <div className="space-y-4">
                <p className="text-sm whitespace-pre-wrap">{data.answer}</p>
                {data.sources?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">来源</p>
                    {data.sources.map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="size-3" />
                        <span>[{s.type}]</span>
                        <span>{s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.fromCache && <p className="text-[10px] text-muted-foreground">缓存结果</p>}
              </div>
            ) : null}
          </ScrollArea>

          <div className="flex items-center gap-2 pt-3">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入你的问题..."
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <Button size="icon" onClick={handleSubmit} disabled={isLoading || !question.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}