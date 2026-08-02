import { Link, useLocation } from 'react-router-dom'
import { Home, ListTodo, FileText, BookHeart, BookOpen, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/', icon: Home, label: '首页' },
  { href: '/tasks', icon: ListTodo, label: '任务' },
  { href: '/notes', icon: FileText, label: '笔记' },
  { href: '/knowledge', icon: BookOpen, label: '知识库' },
  { href: '/journal', icon: BookHeart, label: '日记' },
  { href: '/files', icon: FolderOpen, label: '文件' },
]

export function MobileBottomNav() {
  const location = useLocation()

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-2xl backdrop-saturate-150 md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.25)] safe-area-bottom">
      <div className="flex items-center justify-around px-1 py-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'group relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-all duration-300 ease-spring active:scale-90',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <span className="absolute -top-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60" />
              )}
              <div
                className={cn(
                  'relative flex size-8 items-center justify-center rounded-xl transition-all duration-300 ease-spring',
                  active
                    ? 'bg-primary/10 text-primary shadow-[0_2px_8px_-2px] shadow-primary/20'
                    : 'group-hover:bg-accent/60',
                )}
              >
                <tab.icon
                  className={cn(
                    'size-[18px] transition-transform duration-300 ease-spring',
                    active && 'scale-110',
                  )}
                />
              </div>
              <span className={cn('transition-all duration-200', active && 'font-semibold')}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}