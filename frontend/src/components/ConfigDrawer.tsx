import { Settings, Sun, Moon, Monitor, PanelLeft, PanelLeftClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useTheme } from '@/lib/theme'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

// Theme option card
function ThemeCard({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string
  icon: React.ElementType
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all',
        isActive
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

// Sidebar variant card
function SidebarCard({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string
  icon: React.ElementType
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all',
        isActive
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-5" />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

// Keyboard shortcut row
function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate">{label}</span>
      <kbd className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {keys}
      </kbd>
    </div>
  )
}

export function ConfigDrawer() {
  const { theme, setTheme } = useTheme()
  const { setOpen, state } = useSidebar()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <Settings className="size-4" />
          <span className="sr-only">配置</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="size-4" />
            配置面板
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-5 py-6">
          {/* Theme */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">主题</Label>
            <div className="grid grid-cols-3 gap-2">
              <ThemeCard
                label="亮色"
                icon={Sun}
                isActive={theme === 'light'}
                onClick={() => setTheme('light')}
              />
              <ThemeCard
                label="暗色"
                icon={Moon}
                isActive={theme === 'dark'}
                onClick={() => setTheme('dark')}
              />
              <ThemeCard
                label="系统"
                icon={Monitor}
                isActive={theme === 'system'}
                onClick={() => setTheme('system')}
              />
            </div>
          </div>

          <Separator />

          {/* Sidebar */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">侧边栏</Label>
            <div className="grid grid-cols-2 gap-2">
              <SidebarCard
                label="展开"
                icon={PanelLeft}
                isActive={state === 'expanded'}
                onClick={() => setOpen(true)}
              />
              <SidebarCard
                label="收起"
                icon={PanelLeftClose}
                isActive={state === 'collapsed'}
                onClick={() => setOpen(false)}
              />
            </div>
          </div>

          <Separator />

          {/* Keyboard shortcuts */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">快捷键</Label>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <ShortcutRow label="命令面板" keys="⌘/Ctrl K" />
              <ShortcutRow label="切换侧边栏" keys="⌘/Ctrl B" />
              <ShortcutRow label="新建任务" keys="⌘/Ctrl N" />
              <ShortcutRow label="新建笔记" keys="⌘/Ctrl ⇧ N" />
              <ShortcutRow label="跳转日记" keys="⌘/Ctrl J" />
              <ShortcutRow label="打开设置" keys="⌘/Ctrl ," />
              <ShortcutRow label="切换主题" keys="⌘/Ctrl E" />
              <ShortcutRow label="首页 / 任务 / 笔记 / 知识库" keys="⌘/Ctrl 1-4" />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
