import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  variant?: 'default' | 'success' | 'warning' | 'destructive'
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
}: StatsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-md transition-all hover:bg-secondary/50">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-2xl font-black text-card-foreground md:text-3xl">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={cn(
            'rounded-lg p-2.5 shadow-inner',
            variant === 'default' && 'bg-secondary text-muted-foreground',
            variant === 'success' && 'bg-emerald-500/10 text-emerald-600',
            variant === 'warning' && 'bg-amber-500/10 text-amber-600',
            variant === 'destructive' && 'bg-rose-500/10 text-rose-600'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
