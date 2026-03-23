'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type TipperInsight = {
  userId: string
  name: string
  wins: number
  losses: number
  total: number
  winRate: number
  avgOdds: number
  highestWonOdds: number
  totalCorrect: number
  chickenWinsAtOddsOne: number
  trend8w: number[]
  longestOkStreak: number
  longestNokStreak: number
  longestOkStreakPeriod: { start: string; end: string } | null
  longestNokStreakPeriod: { start: string; end: string } | null
  soloWinningTipTickets: number
  brokenTickets: number
  bestSport: { name: string; yield: number; tips: number } | null
  bestLeague: { name: string; yield: number; tips: number } | null
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

type MonthlyBettingStat = {
  monthKey: string
  monthLabel: string
  stake: number
  payout: number
  profit: number
  cumulativeProfit: number
}

type MonthlyCashflowStat = {
  monthKey: string
  monthLabel: string
  deposits: number
  withdrawals: number
  bets: number
  payouts: number
  netCashflow: number
  cumulativeCashflow: number
}

type WeekdayPerformanceStat = {
  dayKey: number
  dayLabel: string
  tickets: number
  winRate: number
  profit: number
}

type OddsRangePerformanceStat = {
  label: string
  tickets: number
  winRate: number
  profit: number
  yield: number
}

type DailyIntensityPerformanceStat = {
  bucketKey: '1' | '2' | '3' | '4+'
  bucketLabel: string
  dayCount: number
  resolvedDayCount: number
  tickets: number
  resolvedTickets: number
  wins: number
  winRate: number
  stake: number
  payout: number
  profit: number
  roi: number
  avgStakePerDay: number
  unresolvedTickets: number
  reliability: 'Nízka' | 'Stredná' | 'Vysoká'
}

type StreakStats = {
  currentWin: number
  currentLoss: number
  maxWin: number
  maxLoss: number
}

interface StatisticsChartsProps {
  tipperInsights: TipperInsight[]
  weekLabels: string[]
  contextMinTips: number
  bestContextByTipper: Array<{
    userName: string
    bestSport: { name: string; yield: number; tips: number } | null
    bestLeague: { name: string; yield: number; tips: number } | null
  }>
  topTicketWins: TopTicketWin[]
  monthlyBettingStats: MonthlyBettingStat[]
  monthlyCashflowStats: MonthlyCashflowStat[]
  weekdayPerformance: WeekdayPerformanceStat[]
  oddsRangePerformance: OddsRangePerformanceStat[]
  dailyIntensityPerformance: DailyIntensityPerformanceStat[]
  streakStats: StreakStats
  quickStats: {
    avgWinningOdds: number
    avgLosingOdds: number
    volatility: number
    bestDayLabel: string
    worstDayLabel: string
  }
  minTips: number
}

type RankingItem = {
  id: string
  name: string
  value: number
  valueLabel: string
  sparkline?: number[]
  contextLabel?: string
}

function rankBadgeClass(index: number) {
  if (index === 0) return 'border-amber-300/80 bg-amber-100 text-amber-700'
  if (index === 1) return 'border-slate-300/80 bg-slate-100 text-slate-700'
  if (index === 2) return 'border-orange-300/80 bg-orange-100 text-orange-700'
  return 'border-border/70 bg-muted/60 text-muted-foreground'
}

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatStreakPeriod(period: { start: string; end: string } | null) {
  if (!period?.start || !period?.end) return null
  const start = formatDate(period.start)
  const end = formatDate(period.end)
  if (period.start === period.end) return `Obdobie: ${start}`
  return `Obdobie: ${start} - ${end}`
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
    <div className={cn('min-w-0 rounded-xl border border-border/80 bg-card p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-card-foreground sm:text-base">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <div className="h-6 w-24 rounded bg-muted/40" />
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 96
  const height = 24
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / range) * height
    return { x, y }
  })

  const linePath = points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`
      const prev = points[index - 1]
      const cx = (prev.x + point.x) / 2
      return `Q ${cx} ${prev.y} ${point.x} ${point.y}`
    })
    .join(' ')

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  const trend = values[values.length - 1] - values[0]
  const stroke = trend >= 0 ? 'hsl(145, 63%, 49%)' : 'hsl(10, 72%, 55%)'
  const fill = trend >= 0 ? 'hsla(145, 63%, 49%, 0.2)' : 'hsla(10, 72%, 55%, 0.2)'
  const endPoint = points[points.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-6 w-24">
      <line x1="0" x2={width} y1={height} y2={height} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.4" />
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={endPoint.x} cy={endPoint.y} r="1.8" fill={stroke} stroke="white" strokeWidth="1" />
    </svg>
  )
}

function RankingCard({
  title,
  subtitle,
  items,
  barClassName,
  emptyText,
}: {
  title: string
  subtitle: string
  items: RankingItem[]
  barClassName: string
  emptyText: string
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  return (
    <DashboardCard title={title} subtitle={subtitle}>
      {items.length === 0 ? (
        <EmptySection text={emptyText} />
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const width = Math.max(0, Math.min(100, (item.value / maxValue) * 100))

            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border border-border/70 bg-gradient-to-r from-background to-muted/20 px-3 py-2.5 shadow-sm transition-colors hover:border-border hover:bg-muted/20',
                  index === 0 && 'border-emerald-300/70 from-emerald-50/80 to-teal-50/60',
                )}
              >
                <div className="grid grid-cols-[2.3rem,minmax(0,1fr),auto] items-start gap-2.5">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold tabular-nums',
                      rankBadgeClass(index),
                    )}
                  >
                    #{index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                      <span className="rounded-full border border-border/70 bg-background/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                        {item.valueLabel}
                      </span>
                    </div>
                    {item.contextLabel && (
                      <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">{item.contextLabel}</p>
                    )}

                    {item.sparkline && (
                      <div className="mt-1.5">
                        <Sparkline values={item.sparkline} />
                      </div>
                    )}

                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted/70">
                      <div
                        className={cn('relative h-full rounded-full transition-[width] duration-700 ease-out', barClassName)}
                        style={{ width: `${width}%` }}
                      >
                        <span className="absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.28)_45%,transparent_100%)] opacity-80" />
                      </div>
                    </div>
                  </div>

                  <p className="pt-1 text-xs font-medium tabular-nums text-muted-foreground">{width.toFixed(0)}%</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </DashboardCard>
  )
}

function BettingTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyBettingStat }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-card-foreground">{data.monthLabel}</p>
      <p className="text-muted-foreground">Vklady: {formatCurrency(-Math.abs(data.stake))}</p>
      <p className="text-muted-foreground">Výplaty: {formatCurrency(data.payout)}</p>
      <p className="font-medium text-card-foreground">Mesačný zisk: {formatCurrency(data.profit)}</p>
      <p className="font-semibold text-card-foreground">Kumulatívny zisk: {formatCurrency(data.cumulativeProfit)}</p>
    </div>
  )
}

function CashflowTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyCashflowStat }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-card-foreground">{data.monthLabel}</p>
      <p className="text-muted-foreground">Vklady: {formatCurrency(data.deposits)}</p>
      <p className="text-muted-foreground">Výbery: {formatCurrency(-Math.abs(data.withdrawals))}</p>
      <p className="text-muted-foreground">Stávky: {formatCurrency(-Math.abs(data.bets))}</p>
      <p className="text-muted-foreground">Payouty: {formatCurrency(data.payouts)}</p>
      <p className="font-medium text-card-foreground">Mesačný cashflow: {formatCurrency(data.netCashflow)}</p>
      <p className="font-semibold text-card-foreground">Kumulatívny cashflow: {formatCurrency(data.cumulativeCashflow)}</p>
    </div>
  )
}

export function StatisticsCharts({
  tipperInsights,
  weekLabels,
  contextMinTips,
  bestContextByTipper,
  topTicketWins,
  monthlyBettingStats,
  monthlyCashflowStats,
  weekdayPerformance,
  oddsRangePerformance,
  dailyIntensityPerformance,
  streakStats,
  quickStats,
  minTips,
}: StatisticsChartsProps) {
  const sortedByWinRate = [...tipperInsights].sort((a, b) => b.winRate - a.winRate)
  const sortedByAvgOdds = [...tipperInsights].sort((a, b) => b.avgOdds - a.avgOdds)
  const sortedByHighestWonOdds = [...tipperInsights].sort((a, b) => b.highestWonOdds - a.highestWonOdds)
  const sortedByCorrectTips = [...tipperInsights].sort((a, b) => b.totalCorrect - a.totalCorrect)
  const sortedByChickenWinsAtOddsOne = [...tipperInsights].sort((a, b) => b.chickenWinsAtOddsOne - a.chickenWinsAtOddsOne)
  const sortedByLongestOkStreak = [...tipperInsights].sort((a, b) => b.longestOkStreak - a.longestOkStreak)
  const sortedByLongestNokStreak = [...tipperInsights].sort((a, b) => b.longestNokStreak - a.longestNokStreak)
  const sortedBySoloWinningTipTickets = [...tipperInsights].sort((a, b) => b.soloWinningTipTickets - a.soloWinningTipTickets)
  const sortedByBrokenTickets = [...tipperInsights].sort((a, b) => b.brokenTickets - a.brokenTickets)
  const chartSurfaceClass = 'rounded-xl border border-border/70 bg-gradient-to-r from-background to-muted/20 p-2 shadow-sm'
  const todayLabel = new Intl.DateTimeFormat('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())

  const topTicketWinChartData = topTicketWins.map((ticket, index) => ({
    ...ticket,
    rank: `#${index + 1}`,
    shortLabel: `${formatDate(ticket.date)} • ${ticket.odds.toFixed(2)}`,
  }))
  const intensityRows = dailyIntensityPerformance.filter((row) => row.dayCount > 0)
  const intensityResolvedRows = intensityRows.filter((row) => row.resolvedTickets > 0)
  const bestIntensityRow = [...intensityResolvedRows].sort((a, b) => b.roi - a.roi || b.dayCount - a.dayCount)[0]
  const weakestIntensityRow = [...intensityResolvedRows].sort((a, b) => a.roi - b.roi || b.dayCount - a.dayCount)[0]
  const recommendedIntensityRows = intensityResolvedRows.filter((row) => row.roi > 0 && (row.reliability === 'Stredná' || row.reliability === 'Vysoká'))
  const intensityRecommendation = recommendedIntensityRows.length > 0
    ? `Držať sa ${recommendedIntensityRows.map((row) => row.bucketLabel.replace('/deň', '')).join(' / ')}`
    : 'Zatiaľ bez stabilného odporúčania'
  const totalIntensityDays = intensityRows.reduce((sum, row) => sum + row.dayCount, 0)
  const totalIntensityResolvedTickets = intensityRows.reduce((sum, row) => sum + row.resolvedTickets, 0)

  return (
    <div className="space-y-4">
      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer list-none select-none text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Výkonnosť tipérov
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <RankingCard
            title="Úspešnosť podľa tipéra"
            subtitle={
              weekLabels.length > 0
                ? `Zoradené od najlepšieho výsledku • trend od ${weekLabels[0]} po dnes (${todayLabel})`
                : 'Zoradené od najlepšieho výsledku'
            }
            barClassName="bg-gradient-to-r from-emerald-500 to-teal-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByWinRate.map((user) => ({
              id: `${user.userId}-win-rate`,
              name: user.name,
              value: user.winRate,
              valueLabel: `${user.winRate.toFixed(1)}%`,
              sparkline: user.trend8w,
            }))}
          />

          <RankingCard
            title="Priemerný kurz podľa tipéra"
            subtitle="Relatívne porovnanie priemernej hodnoty kurzu"
            barClassName="bg-gradient-to-r from-sky-500 to-cyan-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByAvgOdds.map((user) => ({
              id: `${user.name}-avg-odds`,
              name: user.name,
              value: user.avgOdds,
              valueLabel: user.avgOdds.toFixed(2),
            }))}
          />

          <RankingCard
            title="Najvyšší vyhratý kurz"
            subtitle="Najvyšší OK kurz v zvolenom období"
            barClassName="bg-gradient-to-r from-violet-500 to-indigo-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
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
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByCorrectTips.map((user) => ({
              id: `${user.name}-correct-tips`,
              name: user.name,
              value: user.totalCorrect,
              valueLabel: String(user.totalCorrect),
            }))}
          />

          <RankingCard
            title="🐔 Chicken mód: výhry, čo nič nepridali"
            subtitle="Koľkokrát mal tipér OK tip s kurzom 1.00 (t. j. pre tiket 0 prínos)"
            barClassName="bg-gradient-to-r from-orange-500 to-amber-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByChickenWinsAtOddsOne.map((user) => ({
              id: `${user.name}-chicken-wins-odds-one`,
              name: user.name,
              value: user.chickenWinsAtOddsOne,
              valueLabel: String(user.chickenWinsAtOddsOne),
            }))}
          />

          <RankingCard
            title="Najdlhšia OK šnúra"
            subtitle="Najdlhšia séria správnych tipov"
            barClassName="bg-gradient-to-r from-lime-500 to-emerald-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByLongestOkStreak.map((user) => ({
              id: `${user.name}-ok-streak`,
              name: user.name,
              value: user.longestOkStreak,
              valueLabel: String(user.longestOkStreak),
              contextLabel: formatStreakPeriod(user.longestOkStreakPeriod) ?? undefined,
            }))}
          />

          <RankingCard
            title="Najdlhšia NOK šnúra"
            subtitle="Najdlhšia séria neúspešných tipov"
            barClassName="bg-gradient-to-r from-rose-500 to-red-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByLongestNokStreak.map((user) => ({
              id: `${user.name}-nok-streak`,
              name: user.name,
              value: user.longestNokStreak,
              valueLabel: String(user.longestNokStreak),
              contextLabel: formatStreakPeriod(user.longestNokStreakPeriod) ?? undefined,
            }))}
          />

          <RankingCard
            title="Sólista: jediný výherný tip"
            subtitle="Počet tiketov, kde bol OK iba jeho tip"
            barClassName="bg-gradient-to-r from-cyan-500 to-blue-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedBySoloWinningTipTickets.map((user) => ({
              id: `${user.name}-solo-winning-tip-ticket`,
              name: user.name,
              value: user.soloWinningTipTickets,
              valueLabel: String(user.soloWinningTipTickets),
            }))}
          />

          <RankingCard
            title="Pokazené tikety"
            subtitle="2 tipy OK + 1 tip NOK (ten NOK „pokazil“ tiket)"
            barClassName="bg-gradient-to-r from-rose-500 to-orange-500"
            emptyText={`Žiadny tipér nemá aspoň ${minTips} tipov v tomto období.`}
            items={sortedByBrokenTickets.map((user) => ({
              id: `${user.name}-broken-tickets`,
              name: user.name,
              value: user.brokenTickets,
              valueLabel: String(user.brokenTickets),
            }))}
          />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer list-none select-none text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Výkonnosť tipovania
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Mesačný zisk / strata"
            subtitle="Výplaty mínus vklady na uzavretých tiketoch"
          >
            <div className={cn('h-60', chartSurfaceClass)}>
              {monthlyBettingStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyBettingStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(160, 70%, 40%)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="hsl(160, 70%, 40%)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Tooltip content={<BettingTooltip />} />
                    <Area type="monotone" dataKey="profit" stroke="hsl(160, 70%, 40%)" strokeWidth={2.5} fill="url(#profitGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú uzavreté tikety." />
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Kumulatívny zisk"
            subtitle="Priebežný vývoj profitabilnosti tipovania"
          >
            <div className={cn('h-60', chartSurfaceClass)}>
              {monthlyBettingStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyBettingStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Tooltip content={<BettingTooltip />} />
                    <Line type="linear" dataKey="cumulativeProfit" stroke="hsl(145, 63%, 49%)" strokeWidth={3} dot={{ r: 2, fill: 'hsl(145, 63%, 49%)' }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú uzavreté tikety." />
              )}
            </div>
          </DashboardCard>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer list-none select-none text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cashflow účtu
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Mesačný cashflow"
            subtitle="Súčet transakcií (vklady, výbery, stávky, payouty)"
          >
            <div className={cn('h-60', chartSurfaceClass)}>
              {monthlyCashflowStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyCashflowStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Tooltip content={<CashflowTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="deposits" name="Vklady" fill="hsl(10, 72%, 55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="withdrawals" name="Výbery" fill="hsl(145, 63%, 49%)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="netCashflow" name="Netto cashflow" stroke="hsl(215, 90%, 55%)" strokeWidth={2.5} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú finančné transakcie." />
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Kumulatívny cashflow"
            subtitle="Priebežný vývoj stavu účtu podľa transakcií"
          >
            <div className={cn('h-60', chartSurfaceClass)}>
              {monthlyCashflowStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyCashflowStats} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Tooltip content={<CashflowTooltip />} />
                    <Line type="linear" dataKey="cumulativeCashflow" stroke="hsl(210, 90%, 56%)" strokeWidth={3} dot={{ r: 2, fill: 'hsl(210, 90%, 56%)' }} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú finančné transakcie." />
              )}
            </div>
          </DashboardCard>
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer list-none select-none text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Pokročilé štatistiky
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DashboardCard
            title="Výkon podľa dňa v týždni"
            subtitle="Kombinácia profitu a úspešnosti podľa dňa"
          >
            <div className={cn('h-64', chartSurfaceClass)}>
              {weekdayPerformance.some((day) => day.tickets > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weekdayPerformance} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="dayLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'Profit') return [`${value.toFixed(0)} Kč`, name]
                        return [`${value.toFixed(1)}%`, name]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="profit" name="Profit" radius={[4, 4, 0, 0]}>
                      {weekdayPerformance.map((entry) => (
                        <Cell key={entry.dayKey} fill={entry.profit >= 0 ? 'hsl(160, 70%, 40%)' : 'hsl(10, 72%, 55%)'} />
                      ))}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="winRate" name="Win rate" stroke="hsl(210, 90%, 56%)" strokeWidth={2.5} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú uzavreté tikety." />
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Výkon podľa kurzových pásiem"
            subtitle="Porovnanie win rate a yield naprieč kurzami jednotlivých tipov"
          >
            <div className={cn('h-64', chartSurfaceClass)}>
              {oddsRangePerformance.some((bucket) => bucket.tickets > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={oddsRangePerformance} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                      labelFormatter={(label, payload) => {
                        const p = payload?.[0]?.payload
                        if (!p) return String(label)
                        return `${label} • ${p.tickets} tipov`
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="winRate" name="Win rate" fill="hsl(160, 70%, 40%)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="yield" name="Yield" stroke="hsl(280, 72%, 55%)" strokeWidth={2.5} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptySection text="V tomto období nie sú dáta pre kurzové pásma." />
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Výkon podľa dennej intenzity"
            subtitle="Buckety podľa počtu podaných tiketov v jeden deň (1 / 2 / 3 / 4+)"
            className="lg:col-span-2"
          >
            {intensityRows.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Najlepší bucket</p>
                    <p className="mt-1 break-words text-sm font-black text-card-foreground">{bestIntensityRow?.bucketLabel || '-'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ROI {bestIntensityRow ? `${bestIntensityRow.roi >= 0 ? '+' : ''}${bestIntensityRow.roi.toFixed(1)}%` : '-'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vzorka dní</p>
                    <p className="mt-1 text-sm font-black text-card-foreground">{totalIntensityDays}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{totalIntensityResolvedTickets} uzavretých tiketov</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Odporúčanie</p>
                    <p className="mt-1 break-words text-sm font-black text-card-foreground">{intensityRecommendation}</p>
                  </div>
                </div>

                <div className={cn('h-64', chartSurfaceClass)}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyIntensityPerformance} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="bucketKey" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Tooltip
                        formatter={(value: number, _name, props) => {
                          const p = props?.payload as DailyIntensityPerformanceStat
                          return [`${value.toFixed(1)}%`, `ROI • ${p.resolvedTickets} uzavretých tiketov`]
                        }}
                        labelFormatter={(label, payload) => {
                          const p = payload?.[0]?.payload as DailyIntensityPerformanceStat | undefined
                          if (!p) return String(label)
                          return `${p.bucketLabel} • ${p.dayCount} dní`
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="roi" name="ROI" radius={[4, 4, 0, 0]}>
                        {dailyIntensityPerformance.map((entry) => {
                          let fill = 'hsl(160, 70%, 40%)'
                          if (entry.dayCount < 10) fill = 'hsl(214, 14%, 68%)'
                          else if (entry.roi < 0) fill = 'hsl(10, 72%, 55%)'
                          return <Cell key={entry.bucketKey} fill={fill} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 md:hidden">
                  {[...dailyIntensityPerformance]
                    .sort((a, b) => b.roi - a.roi || b.dayCount - a.dayCount)
                    .map((row) => (
                      <div key={`mobile-${row.bucketKey}`} className="rounded-lg border border-border bg-muted/10 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{row.bucketLabel}</p>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                              row.reliability === 'Vysoká' && 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700',
                              row.reliability === 'Stredná' && 'border-amber-300/70 bg-amber-500/10 text-amber-700',
                              row.reliability === 'Nízka' && 'border-slate-300/70 bg-slate-500/10 text-slate-700',
                            )}
                          >
                            {row.reliability}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <p className="text-muted-foreground">Dní: <span className="font-semibold text-foreground">{row.dayCount}</span></p>
                          <p className="text-muted-foreground">Tiketov: <span className="font-semibold text-foreground">{row.tickets}</span></p>
                          <p className="text-muted-foreground">Win rate: <span className="font-semibold text-foreground">{row.winRate.toFixed(1)}%</span></p>
                          <p className="text-muted-foreground">Avg stake/deň: <span className="font-semibold text-foreground">{row.avgStakePerDay.toFixed(0)} Kč</span></p>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <p className={cn('font-semibold', row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            Profit: {formatCurrency(row.profit)}
                          </p>
                          <p className={cn('font-semibold', row.roi >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            ROI: {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Bucket</th>
                        <th className="px-3 py-2 text-right">Dní</th>
                        <th className="px-3 py-2 text-right">Tiketov</th>
                        <th className="px-3 py-2 text-right">Win rate</th>
                        <th className="px-3 py-2 text-right">Profit</th>
                        <th className="px-3 py-2 text-right">ROI</th>
                        <th className="px-3 py-2 text-right">Avg stake/deň</th>
                        <th className="px-3 py-2 text-center">Spoľahlivosť</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dailyIntensityPerformance]
                        .sort((a, b) => b.roi - a.roi || b.dayCount - a.dayCount)
                        .map((row) => (
                          <tr key={row.bucketKey} className="border-t border-border/70">
                            <td className="px-3 py-2 font-semibold text-foreground">{row.bucketLabel}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.dayCount}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {row.tickets}
                              {row.unresolvedTickets > 0 ? (
                                <span className="ml-1 text-[11px] text-muted-foreground/80">({row.unresolvedTickets} pending)</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.winRate.toFixed(1)}%</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {formatCurrency(row.profit)}
                            </td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', row.roi >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                              {row.roi >= 0 ? '+' : ''}{row.roi.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.avgStakePerDay.toFixed(0)} Kč</td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                  row.reliability === 'Vysoká' && 'border-emerald-300/70 bg-emerald-500/10 text-emerald-700',
                                  row.reliability === 'Stredná' && 'border-amber-300/70 bg-amber-500/10 text-amber-700',
                                  row.reliability === 'Nízka' && 'border-slate-300/70 bg-slate-500/10 text-slate-700',
                                )}
                              >
                                {row.reliability}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <p>
                    {bestIntensityRow
                      ? `Najlepšie vychádza režim ${bestIntensityRow.bucketLabel} (ROI ${bestIntensityRow.roi >= 0 ? '+' : ''}${bestIntensityRow.roi.toFixed(1)}%, ${bestIntensityRow.dayCount} dní).`
                      : 'Najlepší bucket zatiaľ nie je možné určiť z uzavretých tiketov.'}
                    {' '}
                    {weakestIntensityRow
                      ? `Najslabší je ${weakestIntensityRow.bucketLabel} (ROI ${weakestIntensityRow.roi >= 0 ? '+' : ''}${weakestIntensityRow.roi.toFixed(1)}%, ${weakestIntensityRow.dayCount} dní).`
                      : ''}
                  </p>
                  <p className="mt-1">
                    Bucket je podľa počtu podaných tiketov za deň, KPI (win rate/profit/ROI) sú počítané z uzavretých tiketov.
                  </p>
                </div>
              </div>
            ) : (
              <EmptySection text="V tomto období zatiaľ nie sú dni s podanými tiketmi." />
            )}
          </DashboardCard>
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Streak monitor"
          subtitle="Aktuálne a historické série výsledkov"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Aktuálna win séria</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{streakStats.currentWin}</p>
            </div>
            <div className="rounded-lg border border-rose-300/30 bg-rose-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700/80">Aktuálna loss séria</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{streakStats.currentLoss}</p>
            </div>
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">Najdlhšia win séria</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{streakStats.maxWin}</p>
            </div>
            <div className="rounded-lg border border-rose-300/30 bg-rose-500/5 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700/80">Najdlhšia loss séria</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{streakStats.maxLoss}</p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Quick stats lab"
          subtitle="Doplnkové metriky pre detailnejší pohľad"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Priemerný výherný kurz</p>
              <p className="mt-1 text-lg font-black text-card-foreground">{quickStats.avgWinningOdds.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Priemerný prehratý kurz</p>
              <p className="mt-1 text-lg font-black text-card-foreground">{quickStats.avgLosingOdds.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Volatilita P/L</p>
              <p className="mt-1 text-lg font-black text-card-foreground">{quickStats.volatility.toFixed(0)} Kč</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Najlepší deň</p>
              <p className="mt-1 text-sm font-black text-emerald-700">{quickStats.bestDayLabel}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Najslabší deň</p>
              <p className="mt-1 text-sm font-black text-rose-700">{quickStats.worstDayLabel}</p>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Najlepší šport/liga podľa tipéra"
          subtitle={`Yield podľa kategórií, minimum ${contextMinTips} tipov`}
        >
          {bestContextByTipper.length === 0 ? (
            <EmptySection text="Zatiaľ nie sú dostupné dáta pre športové/ligové porovnanie tipérov." />
          ) : (
            <div className="space-y-2">
              {bestContextByTipper.map((row) => (
                <div key={row.userName} className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-sm font-semibold text-card-foreground">{row.userName}</p>
                  <div className="mt-1 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
                      <p className="text-muted-foreground">Top šport</p>
                      <p className="font-semibold text-card-foreground">
                        {row.bestSport ? `${row.bestSport.name} (${row.bestSport.yield.toFixed(1)}%, ${row.bestSport.tips} tipov)` : 'Nedostatok dát'}
                      </p>
                    </div>
                    <div className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
                      <p className="text-muted-foreground">Top liga</p>
                      <p className="font-semibold text-card-foreground">
                        {row.bestLeague ? `${row.bestLeague.name} (${row.bestLeague.yield.toFixed(1)}%, ${row.bestLeague.tips} tipov)` : 'Nedostatok dát'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Top 3 výherné tikety"
        subtitle="Najvyšší čistý zisk na výherných tiketoch v období"
        className="lg:col-span-2"
      >
        <div className={cn('h-64', chartSurfaceClass)}>
          {topTicketWinChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTicketWinChartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)} Kč`} />
                <YAxis type="category" dataKey="rank" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
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
            <EmptySection text="V tomto období nie sú výherné tikety." />
          )}
        </div>

        {topTicketWins.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {topTicketWins.map((ticket, index) => (
              <div key={ticket.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground">#{index + 1} • {formatDate(ticket.date)}</p>
                <p className="truncate text-sm font-medium text-foreground">{ticket.description}</p>
                <p className="text-xs text-muted-foreground">Kurz {ticket.odds.toFixed(2)} • Vklad {ticket.stake.toFixed(0)} Kč</p>
                <p className="text-sm font-semibold text-emerald-600">Čistý zisk: {formatCurrency(ticket.profit)}</p>
                <p className="text-xs text-muted-foreground">Výhra (payout): {formatCurrency(ticket.payout)}</p>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  )
}
