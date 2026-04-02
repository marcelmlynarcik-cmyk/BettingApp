import { format } from 'date-fns'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  Flame,
  LineChart,
  Medal,
  Plus,
  Sparkles,
  Trophy,
  Wallet,
  Zap,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TicketCard } from '@/components/TicketCard'
import type { OverviewStats, Ticket as TicketType } from '@/lib/types'
import {
  buildProbabilityIndex,
  estimatePredictionProbability,
  estimateTicketProbability,
  type ClosedPredictionRecord,
} from '@/lib/ticket-probability'

type FinanceTransactionRecord = {
  amount: number | string | null
  date: string
  type: string | null
}

type TipperTrendPoint = {
  label: string
  value: number
}

type TipperOverview = {
  user_id: string
  user_name: string
  total_predictions: number
  wins: number
  losses: number
  pending: number
  win_rate: number
  total_profit: number
  average_odds: number
  yield: number
  trend: TipperTrendPoint[]
}

type TrendPoint = {
  key: string
  shortLabel: string
  label: string
  bankroll: number
  dayProfit: number
}

type DashboardData = {
  stats: OverviewStats
  currentBankroll: number
  monthlyLeaderboard: TipperOverview[]
  pendingPotentialWins: number
  todayProfit: number
  yesterdayProfit: number
  openTickets: number
  recentTickets: TicketType[]
  trend: TrendPoint[]
  totalOpenExposure: number
  highConfidencePending: number
  bestPerformer: TipperOverview | null
}

type UserRecord = { id: string; name: string }
type PredictionRecord = {
  user_id: string
  ticket_id: string | null
  result: string | null
  odds: number | string | null
  tip_date: string | null
}

const TREND_DAYS = 14

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatCurrency(value: number, withSign = false) {
  const formatted = Math.abs(value).toLocaleString('sk-SK', { maximumFractionDigits: 0 })
  if (!withSign) return `${value.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`
  if (value > 0) return `+${formatted} Kč`
  if (value < 0) return `-${formatted} Kč`
  return '0 Kč'
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? '').trim().replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeResult(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) return { line: '', area: '' }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width
    const y = height - ((value - min) / range) * height
    return { x, y }
  })

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const area = `${line} L ${width} ${height} L 0 ${height} Z`

  return { line, area }
}

function TrendSparkline({
  values,
  positiveClassName,
  negativeClassName,
  height = 68,
}: {
  values: number[]
  positiveClassName: string
  negativeClassName: string
  height?: number
}) {
  if (values.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/70 bg-background/50" style={{ height }} />
  }

  const { line, area } = buildSparklinePath(values, 320, height - 10)
  const trendUp = values[values.length - 1] >= values[0]

  return (
    <svg viewBox={`0 0 320 ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="overview-spark-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={trendUp ? '#10b981' : '#fb7185'} stopOpacity="0.28" />
          <stop offset="100%" stopColor={trendUp ? '#10b981' : '#fb7185'} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#overview-spark-fill)" />
      <path
        d={line}
        fill="none"
        className={trendUp ? positiveClassName : negativeClassName}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SmallTrend({
  values,
  tone,
}: {
  values: number[]
  tone: 'emerald' | 'sky' | 'amber'
}) {
  if (values.length === 0) {
    return <div className="h-8 rounded-lg bg-muted/30" />
  }

  const { line } = buildSparklinePath(values, 96, 28)
  const stroke =
    tone === 'emerald' ? '#10b981' : tone === 'sky' ? '#0ea5e9' : '#f59e0b'

  return (
    <svg viewBox="0 0 96 28" className="h-8 w-24">
      <path d={line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient()
  const now = new Date()
  const todayKey = toDateKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toDateKey(yesterday)
  const firstDay = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastDay = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const recentPredictionsStart = new Date(now)
  recentPredictionsStart.setDate(recentPredictionsStart.getDate() - 27)
  const recentPredictionsStartKey = toDateKey(recentPredictionsStart)

  const [
    { data: allTickets },
    { data: users },
    { data: recentTicketsData },
    { data: closedPredictions },
    { data: monthlyPredictions },
    { data: recentPerformancePredictions },
    { data: financeTransactions },
  ] = await Promise.all([
    supabase.from('tickets').select('*, predictions(*)'),
    supabase.from('users').select('*'),
    supabase
      .from('tickets')
      .select(`
        *,
        predictions (
          *,
          user:users (*),
          sport:sports (*),
          league:leagues (*)
        )
      `)
      .or(`status.eq.pending,date.eq.${todayKey}`)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('predictions')
      .select('user_id, sport_id, league_id, odds, result')
      .in('result', ['OK', 'NOK']),
    supabase
      .from('predictions')
      .select('*')
      .gte('tip_date', firstDay)
      .lte('tip_date', lastDay),
    supabase
      .from('predictions')
      .select('user_id, result, tip_date')
      .gte('tip_date', recentPredictionsStartKey)
      .lte('tip_date', todayKey),
    supabase
      .from('finance_transactions')
      .select('amount, date, type')
      .in('type', ['deposit', 'withdraw']),
  ])

  const allTicketsSafe = (allTickets || []) as TicketType[]
  const safeUsers = (users || []) as UserRecord[]
  const safeMonthlyPredictions = (monthlyPredictions || []) as PredictionRecord[]
  const safeRecentPerformancePredictions = (recentPerformancePredictions || []) as PredictionRecord[]
  const safeFinanceTransactions = (financeTransactions || []) as FinanceTransactionRecord[]

  const totalPayouts = allTicketsSafe.reduce((sum, ticket) => sum + Number(ticket.payout || 0), 0)
  const totalStakes = allTicketsSafe.reduce((sum, ticket) => sum + Number(ticket.stake || 0), 0)
  const totalCashflow = safeFinanceTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  const currentBankroll = totalPayouts + totalCashflow - totalStakes

  const stats: OverviewStats =
    allTicketsSafe.length > 0
      ? {
          total_tickets: allTicketsSafe.length,
          total_stake: allTicketsSafe.reduce((sum, ticket) => sum + Number(ticket.stake || 0), 0),
          total_payout: allTicketsSafe.reduce((sum, ticket) => sum + Number(ticket.payout || 0), 0),
          total_profit: allTicketsSafe.reduce((sum, ticket) => sum + (Number(ticket.payout || 0) - Number(ticket.stake || 0)), 0),
          win_rate:
            (allTicketsSafe.filter((ticket) => ticket.status === 'win').length /
              allTicketsSafe.filter((ticket) => ticket.status !== 'pending').length || 0) * 100,
          pending_tickets: allTicketsSafe.filter((ticket) => ticket.status === 'pending').length,
          winning_tickets: allTicketsSafe.filter((ticket) => ticket.status === 'win').length,
          losing_tickets: allTicketsSafe.filter((ticket) => ticket.status === 'loss').length,
        }
      : {
          total_tickets: 0,
          total_stake: 0,
          total_payout: 0,
          total_profit: 0,
          win_rate: 0,
          pending_tickets: 0,
          winning_tickets: 0,
          losing_tickets: 0,
        }

  const pendingTickets = allTicketsSafe.filter((ticket) => ticket.status === 'pending')
  const pendingPotentialWins = pendingTickets.reduce((sum, ticket) => sum + Number(ticket.possible_win || 0), 0)
  const totalOpenExposure = pendingTickets.reduce((sum, ticket) => sum + Number(ticket.stake || 0), 0)
  const todayProfit = allTicketsSafe
    .filter((ticket) => ticket.date === todayKey && (ticket.status === 'win' || ticket.status === 'loss'))
    .reduce((sum, ticket) => sum + (Number(ticket.payout || 0) - Number(ticket.stake || 0)), 0)
  const yesterdayProfit = allTicketsSafe
    .filter((ticket) => ticket.date === yesterdayKey && (ticket.status === 'win' || ticket.status === 'loss'))
    .reduce((sum, ticket) => sum + (Number(ticket.payout || 0) - Number(ticket.stake || 0)), 0)
  const openTickets = pendingTickets.length
  const ticketStakeById = new Map<string, number>(allTicketsSafe.map((ticket) => [ticket.id, Number(ticket.stake || 0)]))

  const monthlyLeaderboard: TipperOverview[] = safeUsers
    .map((user) => {
      const userPreds = safeMonthlyPredictions.filter((prediction) => prediction.user_id === user.id)
      const wins = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
      const losses = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'NOK').length
      const completed = wins + losses
      const predictionCountByTicket = userPreds.reduce((acc, prediction) => {
        if (!prediction.ticket_id) return acc
        acc[prediction.ticket_id] = (acc[prediction.ticket_id] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      let totalStake = 0
      let totalWins = 0

      for (const prediction of userPreds) {
        const result = normalizeResult(prediction.result)
        if (result !== 'OK' && result !== 'NOK') continue

        const ticketStake = Number(ticketStakeById.get(prediction.ticket_id || '') || 0)
        const legs = prediction.ticket_id ? predictionCountByTicket[prediction.ticket_id] || 0 : 0
        const stakeShare = legs > 0 ? ticketStake / legs : 0

        totalStake += stakeShare
        if (result === 'OK') totalWins += toNumber(prediction.odds) * stakeShare
      }

      const total_profit = totalWins - totalStake
      const yield_value = totalStake > 0 ? (total_profit / totalStake) * 100 : 0
      const average_odds =
        userPreds.length > 0 ? userPreds.reduce((sum, prediction) => sum + toNumber(prediction.odds), 0) / userPreds.length : 0

      const trend = Array.from({ length: 4 }, (_, index) => {
        const bucketEnd = new Date(recentPredictionsStart)
        bucketEnd.setDate(bucketEnd.getDate() + index * 7 + 6)
        const bucketStart = new Date(recentPredictionsStart)
        bucketStart.setDate(bucketStart.getDate() + index * 7)
        const bucketPredictions = safeRecentPerformancePredictions.filter((prediction) => {
          if (prediction.user_id !== user.id || !prediction.tip_date) return false
          const key = prediction.tip_date
          return key >= toDateKey(bucketStart) && key <= toDateKey(bucketEnd)
        })
        const bucketWins = bucketPredictions.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
        const bucketLosses = bucketPredictions.filter((prediction) => normalizeResult(prediction.result) === 'NOK').length

        return {
          label: `${index + 1}`,
          value: bucketWins - bucketLosses,
        }
      })

      return {
        user_id: user.id,
        user_name: user.name,
        total_predictions: userPreds.length,
        wins,
        losses,
        pending: userPreds.filter((prediction) => normalizeResult(prediction.result) === 'PENDING').length,
        win_rate: completed > 0 ? (wins / completed) * 100 : 0,
        total_profit,
        average_odds,
        yield: yield_value,
        trend,
      }
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      if (b.yield !== a.yield) return b.yield - a.yield
      return b.average_odds - a.average_odds
    })

  const statsIndex = buildProbabilityIndex((closedPredictions || []) as ClosedPredictionRecord[])
  const recentTickets = ((recentTicketsData as TicketType[]) || []).map((ticket) => {
    const predictions = (ticket.predictions || []).map((prediction) => {
      const estimate = estimatePredictionProbability(
        {
          user_id: prediction.user_id,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          odds: Number(prediction.odds),
        },
        statsIndex,
      )

      return {
        ...prediction,
        estimated_win_probability: estimate?.probability ?? null,
        probability_sample_size: estimate?.sampleSize ?? null,
        probability_source: estimate?.sourceLabel ?? null,
      }
    })

    const ticketProbability = estimateTicketProbability(
      predictions.map((prediction) => ({
        user_id: prediction.user_id,
        sport_id: prediction.sport_id,
        league_id: prediction.league_id,
        odds: Number(prediction.odds),
        result: prediction.result,
      })),
      statsIndex,
    )

    return {
      ...ticket,
      predictions,
      estimated_win_probability: ticketProbability,
    }
  })

  const highConfidencePending = recentTickets.filter(
    (ticket) => ticket.status === 'pending' && typeof ticket.estimated_win_probability === 'number' && ticket.estimated_win_probability >= 0.45,
  ).length

  const trendStart = new Date(now)
  trendStart.setDate(trendStart.getDate() - (TREND_DAYS - 1))
  const trendStartKey = toDateKey(trendStart)

  let rollingBankroll = 0

  for (const transaction of safeFinanceTransactions) {
    if (transaction.date < trendStartKey) rollingBankroll += Number(transaction.amount || 0)
  }

  for (const ticket of allTicketsSafe) {
    if (ticket.date >= trendStartKey) continue
    rollingBankroll += Number(ticket.payout || 0) - Number(ticket.stake || 0)
  }

  const trend: TrendPoint[] = []

  for (let index = 0; index < TREND_DAYS; index += 1) {
    const day = new Date(trendStart)
    day.setDate(trendStart.getDate() + index)
    const key = toDateKey(day)
    const dayTransactions = safeFinanceTransactions.filter((transaction) => transaction.date === key)
    const dayTickets = allTicketsSafe.filter((ticket) => ticket.date === key)
    const cashflow = dayTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
    const stake = dayTickets.reduce((sum, ticket) => sum + Number(ticket.stake || 0), 0)
    const payout = dayTickets.reduce((sum, ticket) => sum + Number(ticket.payout || 0), 0)
    const dayProfit = payout - stake + cashflow
    rollingBankroll += dayProfit

    trend.push({
      key,
      shortLabel: new Intl.DateTimeFormat('sk-SK', { weekday: 'short' }).format(day).replace('.', ''),
      label: format(day, 'd. MMMM'),
      bankroll: rollingBankroll,
      dayProfit,
    })
  }

  const bestPerformer = monthlyLeaderboard[0] || null

  return {
    stats,
    currentBankroll,
    monthlyLeaderboard,
    pendingPotentialWins,
    todayProfit,
    yesterdayProfit,
    openTickets,
    recentTickets,
    trend,
    totalOpenExposure,
    highConfidencePending,
    bestPerformer,
  }
}

export default async function OverviewPage() {
  const {
    stats,
    currentBankroll,
    monthlyLeaderboard,
    recentTickets,
    pendingPotentialWins,
    todayProfit,
    yesterdayProfit,
    openTickets,
    trend,
    totalOpenExposure,
    highConfidencePending,
    bestPerformer,
  } = await getDashboardData()

  const trendValues = trend.map((point) => point.bankroll)
  const trendDelta = trend.length > 1 ? trend[trend.length - 1].bankroll - trend[0].bankroll : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/80 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-[0_30px_80px_rgba(15,23,42,0.28)] md:p-7">
        <div className="absolute -right-16 -top-14 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-40 w-40 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-20 left-14 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Hlavný prehľad
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight md:text-5xl">Prehľad</h1>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  Aktuálny stav účtu
                </span>
              </div>
              <p className="max-w-2xl text-sm font-medium leading-6 text-slate-200 md:text-base">
                Dnes máš výsledok {formatCurrency(todayProfit, true)}, otvorené sú {openTickets} tikety a na jednom mieste vidíš,
                koľko máš rozbehnuté, komu sa aktuálne darí najviac a ako sa vyvíjal účet za posledné dni.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">Aktuálny bankroll</p>
                <div className="mt-2 flex items-end gap-3">
                  <p className="text-4xl font-black tracking-tight md:text-6xl">
                    {Math.floor(currentBankroll).toLocaleString('sk-SK')}
                  </p>
                  <span className="pb-2 text-sm font-semibold text-white/65">Kč</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Zmena za 14 dní</p>
                    <p className={`mt-1 text-sm font-bold ${trendDelta >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {formatCurrency(trendDelta, true)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Rozbehnuté peniaze</p>
                    <p className="mt-1 text-sm font-bold text-amber-100">{formatCurrency(totalOpenExposure)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Sľubné otvorené tikety</p>
                    <p className="mt-1 text-sm font-bold text-cyan-100">{highConfidencePending} tiketov</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Najviac sa darí</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {bestPerformer?.user_name || 'Zatiaľ bez dát'}
                      </p>
                      <p className="text-xs text-white/60">
                        {bestPerformer
                          ? `${bestPerformer.wins} správnych tipov • úspešnosť ${formatPercent(bestPerformer.win_rate)}`
                          : 'Mesačné poradie sa zobrazí, keď budú dáta'}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100/60">Výnos</p>
                      <p className="text-sm font-black text-amber-100">
                        {bestPerformer ? formatPercent(bestPerformer.yield) : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">Trend bankrollu</p>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-white/55">
                    posledných {trend.length} dní
                  </span>
                </div>
                <div className="mt-3">
                  <TrendSparkline
                    values={trendValues}
                    positiveClassName="stroke-emerald-300"
                    negativeClassName="stroke-rose-300"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                  <span>{trend[0]?.label}</span>
                  <span>{trend[trend.length - 1]?.label}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">Rýchly stav</p>
                <Wallet className="h-4 w-4 text-white/55" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-emerald-300/10 bg-emerald-400/[0.08] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">Dnešný profit</p>
                  <p className={`mt-1 text-xl font-black ${todayProfit >= 0 ? 'text-emerald-100' : 'text-rose-100'}`}>
                    {formatCurrency(todayProfit, true)}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Možná výhra</p>
                  <p className="mt-1 text-xl font-black text-amber-50">{formatCurrency(pendingPotentialWins)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Otvorené tikety</p>
                  <p className="mt-1 text-xl font-black text-cyan-50">{openTickets}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Úspešnosť</p>
                  <p className="mt-1 text-xl font-black text-white">{formatPercent(stats.win_rate)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.08] p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">Akcie</p>
                <Zap className="h-4 w-4 text-white/55" />
              </div>
              <div className="mt-4 grid gap-2">
                <Link
                  href="/tickets"
                  className="inline-flex items-center justify-between rounded-2xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-50 transition-transform hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Pridať nový tiket
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/statistics"
                  className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-semibold text-white/[0.85] transition-transform hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-2">
                    <LineChart className="h-4 w-4" />
                    Otvoriť štatistiky
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                <LineChart className="h-3.5 w-3.5" />
                Vývoj účtu
              </p>
              <h2 className="mt-3 text-xl font-black tracking-tight text-white">Vývoj bankrollu za posledných 14 dní</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${trendDelta >= 0 ? 'bg-emerald-400/10 text-emerald-200' : 'bg-rose-400/10 text-rose-200'}`}>
              {formatCurrency(trendDelta, true)}
            </span>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.06] p-4">
            <TrendSparkline
              values={trendValues}
              positiveClassName="stroke-emerald-500"
              negativeClassName="stroke-rose-500"
              height={180}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/65 sm:grid-cols-4 md:grid-cols-7 xl:grid-cols-7">
              {trend.map((point) => (
                <div key={point.key} className="space-y-1 rounded-xl border border-white/10 bg-black/10 px-2 py-2 text-center">
                  <p className="font-semibold uppercase">{point.shortLabel}</p>
                  <p className={point.dayProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {point.dayProfit >= 0 ? '+' : ''}
                    {Math.round(point.dayProfit)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-[26px] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
                <Flame className="h-3.5 w-3.5" />
                Forma tipérov
              </p>
              <h2 className="mt-3 text-xl font-black tracking-tight text-white">Mesačný leaderboard</h2>
            </div>
            <Link href="/ranking" className="text-sm font-semibold text-emerald-200 hover:text-emerald-100">
              Viac
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {monthlyLeaderboard.slice(0, 4).map((user, index) => (
              <div
                key={user.user_id}
                className="rounded-[22px] border border-white/10 bg-white/[0.06] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black ${
                        index === 0
                          ? 'bg-amber-400/15 text-amber-200'
                          : index === 1
                            ? 'bg-slate-300/12 text-slate-200'
                            : index === 2
                              ? 'bg-orange-400/12 text-orange-200'
                              : 'bg-emerald-400/10 text-emerald-200'
                      }`}>
                        {index === 0 ? (
                          <Trophy className="h-4 w-4" />
                        ) : index === 1 ? (
                          <Medal className="h-4 w-4" />
                        ) : index === 2 ? (
                          <Award className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{user.user_name}</p>
                        <p className="text-xs text-white/60">
                          {user.wins} OK • Ø {user.average_odds.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-white">{formatPercent(user.win_rate)}</p>
                    <p className={user.total_profit >= 0 ? 'text-xs font-semibold text-emerald-300' : 'text-xs font-semibold text-rose-300'}>
                      {formatCurrency(user.total_profit, true)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-white/60">
                    <p>Yield <span className={user.yield >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>{formatPercent(user.yield)}</span></p>
                  </div>
                  <SmallTrend
                    values={user.trend.map((point) => point.value)}
                    tone={index === 0 ? 'amber' : index === 1 ? 'sky' : 'emerald'}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4">
        <article className="rounded-[26px] border border-border/80 bg-card/90 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                <Sparkles className="h-3.5 w-3.5" />
                Tikety
              </p>
              <h2 className="mt-3 text-xl font-black tracking-tight text-card-foreground">Dnešné a otvorené tikety</h2>
            </div>
            <Link href="/tickets" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-600">
              Všetky tikety
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {recentTickets.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border/80 bg-muted/20 p-12 text-center">
                <p className="font-medium text-muted-foreground">Nemáš dnešné ani otvorené tikety.</p>
                <Link
                  href="/tickets"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-2 text-sm font-semibold text-emerald-700"
                >
                  Pridať tiket
                  <Plus className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              recentTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} expandable />)
            )}
          </div>
        </article>
      </section>
    </div>
  )
}
