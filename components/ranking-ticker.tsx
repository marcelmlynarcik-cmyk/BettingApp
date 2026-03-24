'use client'

type RankingTickerItem = {
  userId: string
  userName: string
  winRate: number
  averageOdds: number
  netProfit: number
  okTips: number
}

function formatWinRate(value: number) {
  return `${value.toFixed(1)}%`
}

function formatProfit(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`
}

export function RankingTicker({ items }: { items: RankingTickerItem[] }) {
  if (items.length === 0) return null

  const duplicatedItems = [...items, ...items]

  return (
    <div className="relative overflow-hidden border-b border-border bg-card/85">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
      <div className="ranking-ticker-track flex w-max min-w-full items-center gap-4 px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-card-foreground/90">
        {duplicatedItems.map((item, index) => (
          <span
            key={`${item.userId}-${index}`}
            className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-1"
          >
            <span className="text-muted-foreground">#{(index % items.length) + 1}</span>
            <span>{item.userName}</span>
            <span className="text-sky-700">OK {item.okTips}</span>
            <span className="text-muted-foreground">Ø {item.averageOdds.toFixed(2)}</span>
            <span className="text-primary">WR {formatWinRate(item.winRate)}</span>
            <span className={item.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>Zisk {formatProfit(item.netProfit)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
