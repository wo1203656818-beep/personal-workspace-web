import { Link, useLocation } from 'react-router-dom'
import { Home, ListTodo, FileText, BookOpen, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/', icon: Home, label: '首页' },
  { href: '/tasks/today', icon: ListTodo, label: '任务' },
  { href: '/notes', icon: FileText, label: '笔记' },
  { href: '/knowledge', icon: BookOpen, label: '知识' },
  { href: '/news', icon: MoreHorizontal, label: '更多' },
]

export function MobileBottomNav() {
  const location = useLocation()

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-md md:hidden">
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className={cn('size-5', active && 'text-primary')} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
