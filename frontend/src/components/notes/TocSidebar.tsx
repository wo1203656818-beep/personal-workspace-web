import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TocItem {
  level: number
  text: string
  slug: string
}

interface TocSidebarProps {
  items: TocItem[]
  activeSlug: string
  onTocClick: (slug: string) => void
  mobileOpen?: boolean
  onMobileToggle?: () => void
  onMobileItemClick?: () => void
}

export function TocSidebar({
  items,
  activeSlug,
  onTocClick,
}: Pick<TocSidebarProps, 'items' | 'activeSlug' | 'onTocClick'>) {
  if (items.length === 0) return null
  return (
    <aside className="hidden w-64 shrink-0 overflow-y-auto p-4 md:block">
      <div className="rounded-xl bg-muted/30 p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">目录</p>
        <nav className="space-y-1">
          {items.map((item) => (
            <a
              key={item.slug}
              href={`#${item.slug}`}
              onClick={(e) => {
                e.preventDefault()
                onTocClick(item.slug)
              }}
              className={cn(
                'block truncate border-l-2 border-transparent text-xs transition-colors',
                activeSlug === item.slug
                  ? 'border-primary font-medium text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
              title={item.text}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  )
}

export function MobileTocDropdown({
  items,
  activeSlug,
  onTocClick,
  mobileOpen,
  onMobileToggle,
  onMobileItemClick,
}: TocSidebarProps) {
  if (items.length === 0) return null
  return (
    <div className="mb-3 md:hidden">
      <Button
        variant="outline"
        size="sm"
        onClick={onMobileToggle}
        className="w-full justify-between"
      >
        目录
        <ChevronDown className={`size-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} />
      </Button>
      {mobileOpen && (
        <nav className="mt-2 space-y-1 rounded-xl bg-muted/30 p-2">
          {items.map((item) => (
            <a
              key={item.slug}
              href={`#${item.slug}`}
              onClick={(e) => {
                e.preventDefault()
                onTocClick(item.slug)
                onMobileItemClick?.()
              }}
              className={`block truncate text-xs transition-colors ${
                activeSlug === item.slug
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{ paddingLeft: `${(item.level - 1) * 0.75}rem` }}
              title={item.text}
            >
              {item.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
