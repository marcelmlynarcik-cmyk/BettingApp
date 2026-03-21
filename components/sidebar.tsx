'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Ticket,
  BarChart3,
  Trophy,
  Wallet,
  TrendingUp,
} from 'lucide-react'

const navItems = [
  {
    title: 'Prehľad',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Tikety',
    href: '/tickets',
    icon: Ticket,
  },
  {
    title: 'Štatistiky',
    href: '/statistics',
    icon: BarChart3,
  },
  {
    title: 'Sieň slávy',
    href: '/ranking',
    icon: Trophy,
  },
  {
    title: 'Financie',
    href: '/finance',
    icon: Wallet,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-4 md:hidden">
        <TrendingUp className="h-5 w-5 text-primary" />
        <span className="text-lg font-bold text-foreground">BetTracker</span>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-[64px] border-t border-border bg-card md:hidden">
        <div className="flex h-full items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-tighter transition-all active:scale-90',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span>{item.title}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-sidebar-border bg-sidebar md:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-black tracking-tight text-black">
              BetTracker
            </span>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Link>
              )
            })}
          </nav>
          <div className="p-4">
            <div className="rounded-xl bg-sidebar-accent border border-sidebar-border p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sledované tikety pre</p>
              <p className="mt-1 text-sm font-bold text-sidebar-foreground">
                Marcel, Peter & Michal
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
