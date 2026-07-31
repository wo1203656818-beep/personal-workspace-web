import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function SettingCard({
  icon: Icon,
  title,
  description,
  gradient,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  gradient: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <div className={cn('icon-badge size-8', gradient)}>
            <Icon className="size-4" />
          </div>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
