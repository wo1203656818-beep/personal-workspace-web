import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useSidebar } from '@/components/ui/sidebar'
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type NavItemData = {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: Array<{
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
  }>
}

export function NavItem({ item, isActive }: { item: NavItemData; isActive: boolean }) {
  const { setOpenMobile } = useSidebar()
  const location = useLocation()
  const [open, setOpen] = useState(isActive)

  if (item.children) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={isActive}
              className="h-10 gap-3 rounded-lg px-3 transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <item.icon className="size-[18px]" />
              <span className="flex-1 text-sm text-left">{item.title}</span>
              <ChevronDown
                className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
              />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => {
                const childActive = location.pathname === child.href
                return (
                  <SidebarMenuSubItem key={child.href}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={childActive}
                      className="h-9 gap-2 rounded-lg px-2.5 text-sm transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <Link to={child.href} onClick={() => setOpenMobile(false)}>
                        <child.icon className="size-4" />
                        <span>{child.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  return (
    <SidebarMenuItem className="relative">
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px] shadow-primary/40" />
      )}
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="h-10 gap-3 rounded-lg px-3 transition-all duration-200 ease-spring data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
      >
        <Link to={item.href} onClick={() => setOpenMobile(false)}>
          <item.icon
            className={cn(
              'size-[18px] transition-transform duration-200 ease-spring',
              isActive && 'scale-105',
            )}
          />
          <span className="text-sm">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
