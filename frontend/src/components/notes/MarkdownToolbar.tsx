import { Bold, Italic, Heading, Link as LinkIcon, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

type MarkdownType = 'bold' | 'italic' | 'heading' | 'link' | 'list'

interface MarkdownToolbarProps {
  onInsert: (type: MarkdownType) => void
}

export function MarkdownToolbar({ onInsert }: MarkdownToolbarProps) {
  return (
    <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-muted/30 p-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onInsert('bold')}
        title="粗体"
      >
        <Bold className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onInsert('italic')}
        title="斜体"
      >
        <Italic className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onInsert('heading')}
        title="标题"
      >
        <Heading className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onInsert('link')}
        title="链接"
      >
        <LinkIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => onInsert('list')}
        title="列表"
      >
        <List className="size-4" />
      </Button>
    </div>
  )
}
