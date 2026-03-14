'use client'

import { cn } from '@/lib/utils'
import type { UserStats } from '@/lib/types'
import { Trophy, TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react'

interface LeaderboardCardProps {
  stats: (UserStats & { average_odds: number })[]
}

export function LeaderboardCard({ stats }: LeaderboardCardProps) {
  // Sorting: correct_predictions DESC, average_odds DESC
  const sortedStats = [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.average_odds - a.average_odds
  })

  return (
    <div className="rounded-xl border border-border bg-card shadow-md overflow-hidden">
      <div className="border-b border-border bg-secondary/50 p-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="font-bold text-card-foreground uppercase tracking-wider text-sm">Mesačný Rebríček</h3>
        </div>
      </div>
      <div className="divide-y divide-border">
        {sortedStats.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Zatiaľ žiadne dáta pre tento mesiac
          </div>
        ) : (
          sortedStats.map((user, index) => (
            <div
              key={user.user_id}
              className="flex items-center justify-between p-4 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl font-bold text-lg shadow-inner',
                    index === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 ring-2 ring-amber-200' : 
                    index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900 ring-2 ring-slate-200' :
                    index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-orange-950 ring-2 ring-orange-300' :
                    'bg-secondary text-muted-foreground'
                  )}
                >
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </div>

                <div>
                  <p className="font-bold text-card-foreground">
                    {user.user_name}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" /> {user.wins} OK
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" /> Ø {user.average_odds.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">
                  {user.win_rate.toFixed(1)}%
                </p>
                <p
                  className={cn(
                    'text-xs font-medium',
                    user.total_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  )}
                >
                  {user.total_profit >= 0 ? '+' : ''}{user.total_profit.toFixed(0)} Kč
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
