import { cn } from '@/lib/utils'
import type { UserStats } from '@/lib/types'
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react'

interface UserLeaderboardProps {
  stats: UserStats[]
}

export function UserLeaderboard({ stats }: UserLeaderboardProps) {
  const sortedStats = [...stats].sort((a, b) => b.win_rate - a.win_rate)

  const getMedalColor = (index: number) => {
    switch (index) {
      case 0:
        return 'text-accent'
      case 1:
        return 'text-muted-foreground'
      case 2:
        return 'text-orange-600'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-card-foreground">Sieň slávy</h3>
      </div>
      <div className="divide-y divide-border">
        {sortedStats.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Zatiaľ žiadne tipy
          </div>
        ) : (
          sortedStats.map((user, index) => (
            <div
              key={user.user_id}
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    index === 0 ? 'bg-accent/10' : 'bg-secondary'
                  )}
                >
                  {index < 3 ? (
                    <Trophy className={cn('h-4 w-4', getMedalColor(index))} />
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-medium text-card-foreground">
                    {user.user_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {user.wins}V - {user.losses}P - {user.pending}Č
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-card-foreground">
                    {user.win_rate.toFixed(1)}%
                  </span>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-1 text-sm',
                    user.total_profit >= 0 ? 'text-primary' : 'text-destructive'
                  )}
                >
                  {user.total_profit >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>
                    {user.total_profit >= 0 ? '+' : ''}{user.total_profit.toFixed(0)} Kč
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
