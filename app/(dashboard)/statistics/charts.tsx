'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type TipperInsight = {
  name: string
  wins: number
  losses: number
  total: number
  winRate: number
  avgOdds: number
  highestWonOdds: number
  totalCorrect: number
}

type TopTicketWin = {
  id: string
  description: string
  date: string | null
  odds: number
  stake: number
  payout: number
  profit: number
}

type MonthlyAccountStat = {
  monthKey: string
  monthLabel: string
  deposits: number
  wins: number
  losses: number
  monthlyResult: number
  cumulativeResult: number
}

interface StatisticsChartsProps {
  tipperInsights: TipperInsight[]
  topTicketWins: TopTicketWin[]
  monthlyAccountStats: MonthlyAccountStat[]
}

type RankingItem = {
  id: string
  name: string
  value: number
  valueLabel: string
}

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)} Kč`
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function DashboardCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground sm:text-base">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function RankingCard({
  title,
  subtitle,
  items,
  barClassName,
  highlightTop = true,
}: {
  title: string
  subtitle: string
  items: RankingItem[]
  barClassName: string
  highlightTop?: boolean
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  return (
    <DashboardCard title={title} subtitle={subtitle}>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              'grid grid-cols-[2rem,minmax(0,1fr),3.9rem] items-center gap-2 rounded-lg px-2 py-2 transition-colors',
              highlightTop && index === 0
                ? 'bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30'
                : 'hover:bg-muted/50',
            )}
          >
            <p className="text-xs font-semibold tabular-nums text-muted-foreground">#{index + 1}</p>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/70">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-500 ease-out', barClassName)}
                  style={{ width: `${Math.max(0, Math.min(100, (item.value / maxValue) * 100))}%` }}
                />
              </div>
            </div>
            <p className="text-right text-sm font-semibold tabular-nums text-foreground">{item.valueLabel}</p>
          </div>
        ))}
      </div>
    </DashboardCard>
  )
}

function MonthlyBalanceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyAccountStat }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-card-foreground">{data.monthLabel}</p>
      <p className="text-muted-foreground">Vklady: {formatCurrency(data.deposits)}</p>
      <p className="text-muted-foreground">Výhry: {formatCurrency(data.wins)}</p>
      <p className="text-muted-foreground">Prehry: {formatCurrency(-Math.abs(data.losses))}</p>
      <p className="font-medium text-card-foreground">Čistá zmena: {formatCurrency(data.monthlyResult)}</p>
      <p className="font-semibold text-card-foreground">Kumulatívny výsledok: {formatCurrency(data.cumulativeResult)}</p>
    </div>
  )
}

function CumulativeBalanceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyAccountStat }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-card-foreground">{data.monthLabel}</p>
      <p className="font-semibold text-card-foreground">Kumulatívny výsledok: {formatCurrency(data.cumulativeResult)}</p>
      <p className="text-muted-foreground">Čistá zmena mesiaca: {formatCurrency(data.monthlyResult)}</p>
      <p className="text-muted-foreground">Vklady: {formatCurrency(data.deposits)}</p>
      <p className="text-muted-foreground">Výhry: {formatCurrency(data.wins)}</p>
      <p className="text-muted-foreground">Prehry: {formatCurrency(-Math.abs(data.losses))}</p>
    </div>
  )
}

export function StatisticsCharts({ tipperInsights, topTicketWins, monthlyAccountStats }: StatisticsChartsProps) {
  const sortedByWinRate = [...tipperInsights].sort((a, b) => b.winRate - a.winRate)
  const sortedByAvgOdds = [...tipperInsights].sort((a, b) => b.avgOdds - a.avgOdds)
  const sortedByHighestWonOdds = [...tipperInsights].sort((a, b) => b.highestWonOdds - a.highestWonOdds)
  const sortedByCorrectTips = [...tipperInsights].sort((a, b) => b.totalCorrect - a.totalCorrect)

  const topTicketWinChartData = topTicketWins.map((ticket, index) => ({
    ...ticket,
    rank: `#${index + 1}`,
    shortLabel: `${formatDate(ticket.date)} • ${ticket.odds.toFixed(2)}`,
  }))

  const hasData = tipperInsights.length > 0

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Zatiaľ nie sú dostupné dáta pre štatistiky tipérov.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RankingCard
        title="Úspešnosť podľa tipéra"
        subtitle="Zoradené od najlepšieho výsledku"
        barClassName="bg-gradient-to-r from-emerald-500 to-teal-500"
        items={sortedByWinRate.map((user) => ({
          id: `${user.name}-win-rate`,
          name: user.name,
          value: user.winRate,
          valueLabel: `${user.winRate.toFixed(1)}%`,
        }))}
      />

      <RankingCard
        title="Priemerný kurz podľa tipéra"
        subtitle="Relatívne porovnanie priemernej hodnoty kurzu"
        barClassName="bg-gradient-to-r from-sky-500 to-cyan-500"
        items={sortedByAvgOdds.map((user) => ({
          id: `${user.name}-avg-odds`,
          name: user.name,
          value: user.avgOdds,
          valueLabel: user.avgOdds.toFixed(2),
        }))}
      />

      <DashboardCard
        title="Stav účtu po mesiacoch"
        subtitle="Mesačný výsledok tipovania (výhry mínus prehry, bez vkladov)"
      >
        <div className="h-60">
          {monthlyAccountStats.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyAccountStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip content={<MonthlyBalanceTooltip />} />
                <Bar dataKey="monthlyResult">
                  {monthlyAccountStats.map((entry) => (
                    <Cell
                      key={entry.monthKey}
                      fill={entry.monthlyResult >= 0 ? 'hsl(160, 70%, 40%)' : 'hsl(10, 72%, 55%)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Zatiaľ nie sú dostupné mesačné dáta stavu účtu.</p>
            </div>
          )}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Kumulatívny stav účtu"
        subtitle="Priebežný výsledok tipovania po mesiacoch (bez vkladov)"
      >
        <div className="h-60">
          {monthlyAccountStats.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyAccountStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip content={<CumulativeBalanceTooltip />} />
                <Line
                  type="linear"
                  dataKey="cumulativeResult"
                  stroke="hsl(145, 63%, 49%)"
                  strokeWidth={3}
                  dot={{ r: 2, fill: 'hsl(145, 63%, 49%)' }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Zatiaľ nie sú dostupné kumulatívne dáta stavu účtu.</p>
            </div>
          )}
        </div>
      </DashboardCard>

      <RankingCard
        title="Najvyšší vyhratý kurz tipéra"
        subtitle="Celá história trafených tipov"
        barClassName="bg-gradient-to-r from-violet-500 to-indigo-500"
        items={sortedByHighestWonOdds.map((user) => ({
          id: `${user.name}-highest-won-odds`,
          name: user.name,
          value: user.highestWonOdds,
          valueLabel: user.highestWonOdds.toFixed(2),
        }))}
      />

      <RankingCard
        title="Uhádnuté tipy celkovo"
        subtitle="Počet tipov s výsledkom OK"
        barClassName="bg-gradient-to-r from-amber-500 to-yellow-500"
        items={sortedByCorrectTips.map((user) => ({
          id: `${user.name}-correct-tips`,
          name: user.name,
          value: user.totalCorrect,
          valueLabel: String(user.totalCorrect),
        }))}
      />

      <DashboardCard
        title="Top 3 výherné tikety"
        subtitle="Najvyšší čistý zisk na uzavretých výherných tiketoch"
        className="lg:col-span-2"
      >
        <div className="h-64">
          {topTicketWinChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTicketWinChartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`}
                />
                <YAxis
                  type="category"
                  dataKey="rank"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [`${Number(value).toFixed(0)} Kč`, 'Čistý zisk']}
                  labelFormatter={(_label, payload) => {
                    const p = payload?.[0]?.payload
                    if (!p) return 'Tiket'
                    return `${p.description} • ${p.shortLabel}`
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '10px',
                  }}
                />
                <Bar dataKey="profit" radius={[0, 8, 8, 0]} fill="hsl(160, 70%, 40%)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Zatiaľ nie sú dostupné výherné tikety.</p>
            </div>
          )}
        </div>

        {topTicketWins.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {topTicketWins.map((ticket, index) => (
              <div key={ticket.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground">#{index + 1} • {formatDate(ticket.date)}</p>
                <p className="truncate text-sm font-medium text-foreground">{ticket.description}</p>
                <p className="text-xs text-muted-foreground">Kurz {ticket.odds.toFixed(2)} • Vklad {ticket.stake.toFixed(0)} Kč</p>
                <p className="text-sm font-semibold text-emerald-600">{formatCurrency(ticket.profit)}</p>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  )
}
