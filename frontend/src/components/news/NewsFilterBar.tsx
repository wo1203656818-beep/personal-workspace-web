import { Bookmark, Filter, Search, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

export function NewsFilterBar({
  categories,
  category,
  showSaved,
  sort,
  search,
  onCategoryClick,
  onSortChange,
  onSearchChange,
}: {
  categories: string[]
  category: string
  showSaved: boolean
  sort: string
  search: string
  onCategoryClick: (cat: string) => void
  onSortChange: (sort: string) => void
  onSearchChange: (search: string) => void
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryClick(cat)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-full border transition-colors',
              (cat === '收藏' ? showSaved : category === cat && !showSaved)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground hover:bg-muted border-border',
            )}
          >
            {cat === '收藏' && <Bookmark className="w-3 h-3 inline mr-1" />}
            {cat}
          </button>
        ))}
      </div>
      <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Select value={sort} onValueChange={onSortChange}>
          <SelectTrigger className="h-8 w-[110px] shrink-0 text-xs">
            <ArrowUpDown className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">按评分</SelectItem>
            <SelectItem value="time">按时间</SelectItem>
            <SelectItem value="personal">个性化</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background sm:w-[180px]"
          />
        </div>
      </div>
    </div>
  )
}
