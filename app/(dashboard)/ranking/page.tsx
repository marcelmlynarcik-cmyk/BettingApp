import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Calendar,
  Gauge,
  Medal,
  Milestone,
  Sparkles,
  Star,
  Trophy,
} from 'lucide-react'

type UserRecord = { id: string; name: string }
type TicketRecord = {
  id: string
  stake: number
  date: string
  status?: 'win' | 'loss' | 'pending' | string | null
  payout?: number | string | null
}
type PredictionRecord = {
  id: string
  user_id: string
  ticket_id: string | null
  odds: number | string | null
  result: string | null
  tip_date: string | null
  created_at: string | null
  sport?: { name?: string | null } | null
  league?: { name?: string | null } | null
}

type UserYieldStat = {
  userId: string
  userName: string
  yield: number
  okTips: number
  avgOdds: number
  totalStake: number
  netProfit: number
}

type MonthlyPerformanceWinner = {
  monthKey: string
  monthLabel: string
  userName: string
  okTips: number
  yield: number
  avgOdds: number
}

type TopOddsItem = {
  rank: number
  userName: string
  odds: number
  dateLabel: string
  context: string
}

type MonthlyOddsWinner = {
  monthKey: string
  monthLabel: string
  userName: string
  odds: number
  context: string
}

type MilestoneMetric = 'teamTickets' | 'teamProfit' | 'okTips' | 'hitRate' | 'wonOdds'

type MilestoneEvent = {
  userId: string
  userName: string
  metric: MilestoneMetric
  milestone: number
  achievedAt: string
}

type UserMilestoneProgress = {
  userId: string
  userName: string
  okTips: number
  resolvedTips: number
  hitRate: number
  bestWonOdds: number
  nextOkTipsMilestone: number | null
  nextHitRateMilestone: number | null
  nextWonOddsMilestone: number | null
  okTipsProgressPct: number
  hitRateProgressPct: number
  wonOddsProgressPct: number
  reachedOkTipMilestones: Array<{ value: number; achievedAt: string }>
  reachedHitRateMilestones: Array<{ value: number; achievedAt: string }>
  reachedWonOddsMilestones: Array<{ value: number; achievedAt: string }>
}

type TeamTicketProgress = {
  totalTickets: number
  nextMilestone: number | null
  progressPct: number
  reachedMilestones: Array<{ value: number; achievedAt: string }>
}

type TeamProfitProgress = {
  totalProfit: number
  nextMilestone: number | null
  progressPct: number
  reachedMilestones: Array<{ value: number; achievedAt: string }>
}

const TICKET_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const OK_TIPS_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const TEAM_PROFIT_MILESTONES = [10000, 25000, 50000, 100000]
const HIT_RATE_MILESTONES = [55, 60, 65, 70]
const WON_ODDS_MILESTONES = [3, 5, 8, 10]
const HIT_RATE_MIN_SAMPLE = 40

function normalizeResult(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function parseOdds(value: unknown) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function getPredictionDate(prediction: PredictionRecord, ticketById: Map<string, TicketRecord>) {
  if (prediction.tip_date) return prediction.tip_date
  if (prediction.ticket_id && ticketById.has(prediction.ticket_id)) return ticketById.get(prediction.ticket_id)!.date
  return prediction.created_at || null
}

function toMonthKey(dateValue: string) {
  const d = new Date(dateValue)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('sk-SK', {
    month: 'long',
    year: 'numeric',
  })
}

function shortDateLabel(dateValue: string) {
  const d = new Date(dateValue)
  return d.toLocaleDateString('sk-SK', {
    month: 'numeric',
    year: 'numeric',
  })
}

function fullDateLabel(dateValue: string) {
  const d = new Date(dateValue)
  return d.toLocaleDateString('sk-SK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)} Kč`
}

function formatYield(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`
}

function getMetricLabel(metric: MilestoneMetric) {
  if (metric === 'teamTickets') return 'spoločných tiketov'
  if (metric === 'teamProfit') return 'tímového profitu'
  if (metric === 'hitRate') return 'úspešnosti'
  if (metric === 'wonOdds') return 'trafeného kurzu'
  return 'OK tipov'
}

function getMilestoneVerb(metric: MilestoneMetric) {
  return metric === 'teamTickets' || metric === 'teamProfit' ? 'dosiahnutý' : 'dosiahol'
}

function formatMilestoneValue(metric: MilestoneMetric, value: number) {
  if (metric === 'teamProfit') return `+${value.toFixed(0)} Kč`
  if (metric === 'hitRate') return `${value.toFixed(0)}%`
  if (metric === 'wonOdds') return value.toFixed(2)
  return `${value.toFixed(0)}`
}

function formatMilestoneEvent(metric: MilestoneMetric, value: number) {
  if (metric === 'teamProfit') return `${formatMilestoneValue(metric, value)} ${getMetricLabel(metric)}`
  if (metric === 'hitRate') return `${formatMilestoneValue(metric, value)} ${getMetricLabel(metric)}`
  if (metric === 'wonOdds') return `kurz ${formatMilestoneValue(metric, value)}`
  return `${formatMilestoneValue(metric, value)} ${getMetricLabel(metric)}`
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value))
}

function getProgressToNext(current: number, milestones: number[]) {
  const next = milestones.find((m) => current < m) ?? null
  if (!next) {
    return { next: null as number | null, pct: 100 }
  }

  const previous = [...milestones].reverse().find((m) => current >= m) ?? 0
  const span = Math.max(1, next - previous)
  const pct = ((current - previous) / span) * 100

  return {
    next,
    pct: clampProgress(pct),
  }
}

async function fetchAllRows<T>(getPage: (from: number, to: number) => unknown) {
  const pageSize = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data } = (await getPage(from, to)) as { data: T[] | null }
    const chunk = data || []

    all.push(...chunk)
    if (chunk.length < pageSize) break

    from += pageSize
  }

  return all
}

async function getRankingData() {
  const supabase = await createClient()

  const [{ data: users }, tickets, predictions] = await Promise.all([
    supabase.from('users').select('id, name'),
    fetchAllRows<TicketRecord>((from, to) =>
      supabase
        .from('tickets')
        .select('id, stake, date, status, payout')
        .order('date', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<PredictionRecord>((from, to) =>
      supabase
        .from('predictions')
        .select('id, user_id, ticket_id, odds, result, tip_date, created_at, sport:sports(name), league:leagues(name)')
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
  ])

  const safeUsers = (users || []) as UserRecord[]
  const safeTickets = tickets || []
  const safePredictions = predictions || []

  const ticketById = new Map<string, TicketRecord>(safeTickets.map((t) => [t.id, t]))

  const predictionCountByTicket = safePredictions.reduce((acc, pred) => {
    if (!pred.ticket_id) return acc
    acc[pred.ticket_id] = (acc[pred.ticket_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const completedPredictions = safePredictions.filter((p) => {
    const result = normalizeResult(p.result)
    return result === 'OK' || result === 'NOK'
  })

  const userYieldStats: UserYieldStat[] = safeUsers.map((user) => {
    const userPreds = completedPredictions.filter((p) => p.user_id === user.id)

    let totalStake = 0
    let totalWins = 0
    let okTips = 0
    let oddsSum = 0
    let oddsCount = 0

    for (const pred of userPreds) {
      const odds = parseOdds(pred.odds)
      const ticketStake = pred.ticket_id ? Number(ticketById.get(pred.ticket_id)?.stake || 0) : 0
      const legs = pred.ticket_id ? predictionCountByTicket[pred.ticket_id] || 0 : 0
      const stakeShare = legs > 0 ? ticketStake / legs : 0

      totalStake += stakeShare
      oddsSum += odds
      oddsCount += 1

      if (normalizeResult(pred.result) === 'OK') {
        okTips += 1
        totalWins += odds * stakeShare
      }
    }

    const netProfit = totalWins - totalStake
    const yieldValue = totalStake > 0 ? (netProfit / totalStake) * 100 : 0
    const avgOdds = oddsCount > 0 ? oddsSum / oddsCount : 0

    return {
      userId: user.id,
      userName: user.name,
      yield: yieldValue,
      okTips,
      avgOdds,
      totalStake,
      netProfit,
    }
  })

  const monthlyByUser = completedPredictions.reduce((acc, pred) => {
    const dateValue = getPredictionDate(pred, ticketById)
    if (!dateValue) return acc

    const key = `${toMonthKey(dateValue)}__${pred.user_id}`
    const odds = parseOdds(pred.odds)
    const ticketStake = pred.ticket_id ? Number(ticketById.get(pred.ticket_id)?.stake || 0) : 0
    const legs = pred.ticket_id ? predictionCountByTicket[pred.ticket_id] || 0 : 0
    const stakeShare = legs > 0 ? ticketStake / legs : 0

    if (!acc[key]) {
      acc[key] = {
        monthKey: toMonthKey(dateValue),
        userId: pred.user_id,
        okTips: 0,
        oddsSum: 0,
        oddsCount: 0,
        totalStake: 0,
        totalWins: 0,
      }
    }

    acc[key].oddsSum += odds
    acc[key].oddsCount += 1
    acc[key].totalStake += stakeShare

    if (normalizeResult(pred.result) === 'OK') {
      acc[key].okTips += 1
      acc[key].totalWins += odds * stakeShare
    }

    return acc
  }, {} as Record<string, { monthKey: string; userId: string; okTips: number; oddsSum: number; oddsCount: number; totalStake: number; totalWins: number }>)

  const monthlyWinners = Object.values(monthlyByUser).reduce((acc, entry) => {
    const avgOdds = entry.oddsCount > 0 ? entry.oddsSum / entry.oddsCount : 0
    const netProfit = entry.totalWins - entry.totalStake
    const yieldValue = entry.totalStake > 0 ? (netProfit / entry.totalStake) * 100 : 0
    const userName = safeUsers.find((u) => u.id === entry.userId)?.name || 'Neznámy tipér'

    const candidate: MonthlyPerformanceWinner = {
      monthKey: entry.monthKey,
      monthLabel: monthLabel(entry.monthKey),
      userName,
      okTips: entry.okTips,
      yield: yieldValue,
      avgOdds,
    }

    if (!acc[entry.monthKey]) {
      acc[entry.monthKey] = candidate
      return acc
    }

    const current = acc[entry.monthKey]
    if (
      candidate.okTips > current.okTips ||
      (candidate.okTips === current.okTips && candidate.yield > current.yield) ||
      (candidate.okTips === current.okTips && candidate.yield === current.yield && candidate.avgOdds > current.avgOdds)
    ) {
      acc[entry.monthKey] = candidate
    }

    return acc
  }, {} as Record<string, MonthlyPerformanceWinner>)

  const successfulPredictions = completedPredictions.filter((p) => normalizeResult(p.result) === 'OK')

  const top10Odds: TopOddsItem[] = successfulPredictions
    .map((pred) => {
      const dateValue = getPredictionDate(pred, ticketById)
      if (!dateValue) return null

      const sport = pred.sport?.name || ''
      const league = pred.league?.name || ''
      const context = league
        ? `${sport ? `${sport} - ` : ''}${league}`
        : sport || 'Nezaradené'

      return {
        userName: safeUsers.find((u) => u.id === pred.user_id)?.name || 'Neznámy tipér',
        odds: parseOdds(pred.odds),
        dateLabel: shortDateLabel(dateValue),
        context,
      }
    })
    .filter((item): item is { userName: string; odds: number; dateLabel: string; context: string } => Boolean(item))
    .sort((a, b) => b.odds - a.odds)
    .slice(0, 10)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }))

  const monthlyOddsWinners = successfulPredictions.reduce((acc, pred) => {
    const dateValue = getPredictionDate(pred, ticketById)
    if (!dateValue) return acc

    const key = toMonthKey(dateValue)
    const odds = parseOdds(pred.odds)
    const sport = pred.sport?.name || ''
    const league = pred.league?.name || ''
    const context = league
      ? `${sport ? `${sport} - ` : ''}${league}`
      : sport || 'Nezaradené'

    const candidate: MonthlyOddsWinner = {
      monthKey: key,
      monthLabel: monthLabel(key),
      userName: safeUsers.find((u) => u.id === pred.user_id)?.name || 'Neznámy tipér',
      odds,
      context,
    }

    if (!acc[key] || candidate.odds > acc[key].odds) {
      acc[key] = candidate
    }

    return acc
  }, {} as Record<string, MonthlyOddsWinner>)

  const predictionsByUser = safePredictions.reduce((acc, pred) => {
    if (!acc[pred.user_id]) acc[pred.user_id] = []
    acc[pred.user_id].push(pred)
    return acc
  }, {} as Record<string, PredictionRecord[]>)

  const milestoneEvents: MilestoneEvent[] = []
  const milestoneProgressByUser = new Map<string, UserMilestoneProgress>()

  for (const user of safeUsers) {
    const userPreds = (predictionsByUser[user.id] || [])
      .map((pred) => ({
        pred,
        dateValue: getPredictionDate(pred, ticketById),
      }))
      .filter((item): item is { pred: PredictionRecord; dateValue: string } => Boolean(item.dateValue))
      .sort((a, b) => new Date(a.dateValue).getTime() - new Date(b.dateValue).getTime())

    let okTipsCount = 0
    let resolvedTipsCount = 0
    let bestWonOdds = 0

    const okReached: Array<{ value: number; achievedAt: string }> = []
    const hitRateReached: Array<{ value: number; achievedAt: string }> = []
    const wonOddsReached: Array<{ value: number; achievedAt: string }> = []

    let okMilestoneIndex = 0
    let hitRateMilestoneIndex = 0
    let wonOddsMilestoneIndex = 0

    for (const { pred, dateValue } of userPreds) {
      const result = normalizeResult(pred.result)
      if (result === 'OK' || result === 'NOK') {
        resolvedTipsCount += 1
      }

      if (result === 'OK') {
        okTipsCount += 1
        const odds = parseOdds(pred.odds)
        if (odds > bestWonOdds) bestWonOdds = odds

        while (okMilestoneIndex < OK_TIPS_MILESTONES.length && okTipsCount >= OK_TIPS_MILESTONES[okMilestoneIndex]) {
          const milestone = OK_TIPS_MILESTONES[okMilestoneIndex]
          okReached.push({ value: milestone, achievedAt: dateValue })
          milestoneEvents.push({
            userId: user.id,
            userName: user.name,
            metric: 'okTips',
            milestone,
            achievedAt: dateValue,
          })
          okMilestoneIndex += 1
        }

        while (wonOddsMilestoneIndex < WON_ODDS_MILESTONES.length && bestWonOdds >= WON_ODDS_MILESTONES[wonOddsMilestoneIndex]) {
          const milestone = WON_ODDS_MILESTONES[wonOddsMilestoneIndex]
          wonOddsReached.push({ value: milestone, achievedAt: dateValue })
          milestoneEvents.push({
            userId: user.id,
            userName: user.name,
            metric: 'wonOdds',
            milestone,
            achievedAt: dateValue,
          })
          wonOddsMilestoneIndex += 1
        }
      }

      if (resolvedTipsCount >= HIT_RATE_MIN_SAMPLE) {
        const hitRate = (okTipsCount / Math.max(1, resolvedTipsCount)) * 100
        while (hitRateMilestoneIndex < HIT_RATE_MILESTONES.length && hitRate >= HIT_RATE_MILESTONES[hitRateMilestoneIndex]) {
          const milestone = HIT_RATE_MILESTONES[hitRateMilestoneIndex]
          hitRateReached.push({ value: milestone, achievedAt: dateValue })
          milestoneEvents.push({
            userId: user.id,
            userName: user.name,
            metric: 'hitRate',
            milestone,
            achievedAt: dateValue,
          })
          hitRateMilestoneIndex += 1
        }
      }
    }

    const okProgress = getProgressToNext(okTipsCount, OK_TIPS_MILESTONES)
    const wonOddsProgress = getProgressToNext(bestWonOdds, WON_ODDS_MILESTONES)

    const currentHitRate = resolvedTipsCount > 0 ? (okTipsCount / resolvedTipsCount) * 100 : 0
    const hitRateProgress =
      resolvedTipsCount < HIT_RATE_MIN_SAMPLE
        ? {
            next: HIT_RATE_MILESTONES[0] ?? null,
            pct: clampProgress((resolvedTipsCount / HIT_RATE_MIN_SAMPLE) * 100),
          }
        : getProgressToNext(currentHitRate, HIT_RATE_MILESTONES)

    milestoneProgressByUser.set(user.id, {
      userId: user.id,
      userName: user.name,
      okTips: okTipsCount,
      resolvedTips: resolvedTipsCount,
      hitRate: currentHitRate,
      bestWonOdds,
      nextOkTipsMilestone: okProgress.next,
      nextHitRateMilestone: hitRateProgress.next,
      nextWonOddsMilestone: wonOddsProgress.next,
      okTipsProgressPct: okProgress.pct,
      hitRateProgressPct: hitRateProgress.pct,
      wonOddsProgressPct: wonOddsProgress.pct,
      reachedOkTipMilestones: okReached,
      reachedHitRateMilestones: hitRateReached,
      reachedWonOddsMilestones: wonOddsReached,
    })
  }

  const sortedTickets = [...safeTickets].sort((a, b) => {
    const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
    if (timeDiff !== 0) return timeDiff
    return a.id.localeCompare(b.id)
  })

  const teamReachedMilestones: Array<{ value: number; achievedAt: string }> = []
  let teamMilestoneIndex = 0
  let processedTickets = 0

  for (const ticket of sortedTickets) {
    processedTickets += 1
    while (teamMilestoneIndex < TICKET_MILESTONES.length && processedTickets >= TICKET_MILESTONES[teamMilestoneIndex]) {
      const milestone = TICKET_MILESTONES[teamMilestoneIndex]
      teamReachedMilestones.push({ value: milestone, achievedAt: ticket.date })
      milestoneEvents.push({
        userId: 'team',
        userName: 'Tím',
        metric: 'teamTickets',
        milestone,
        achievedAt: ticket.date,
      })
      teamMilestoneIndex += 1
    }
  }

  const teamProgress = getProgressToNext(safeTickets.length, TICKET_MILESTONES)
  const teamTicketProgress: TeamTicketProgress = {
    totalTickets: safeTickets.length,
    nextMilestone: teamProgress.next,
    progressPct: teamProgress.pct,
    reachedMilestones: teamReachedMilestones,
  }

  const teamProfitReachedMilestones: Array<{ value: number; achievedAt: string }> = []
  let teamProfitMilestoneIndex = 0
  let teamCumulativeProfit = 0

  for (const ticket of sortedTickets) {
    const status = normalizeResult(ticket.status)
    if (status !== 'WIN' && status !== 'LOSS') continue

    const stake = Number(ticket.stake || 0)
    const payout = Number(ticket.payout || 0)
    teamCumulativeProfit += payout - stake

    while (
      teamProfitMilestoneIndex < TEAM_PROFIT_MILESTONES.length &&
      teamCumulativeProfit >= TEAM_PROFIT_MILESTONES[teamProfitMilestoneIndex]
    ) {
      const milestone = TEAM_PROFIT_MILESTONES[teamProfitMilestoneIndex]
      teamProfitReachedMilestones.push({ value: milestone, achievedAt: ticket.date })
      milestoneEvents.push({
        userId: 'team',
        userName: 'Tím',
        metric: 'teamProfit',
        milestone,
        achievedAt: ticket.date,
      })
      teamProfitMilestoneIndex += 1
    }
  }

  const teamProfitProgress = getProgressToNext(Math.max(0, teamCumulativeProfit), TEAM_PROFIT_MILESTONES)
  const teamProfitMilestoneProgress: TeamProfitProgress = {
    totalProfit: teamCumulativeProfit,
    nextMilestone: teamProfitProgress.next,
    progressPct: teamProfitProgress.pct,
    reachedMilestones: teamProfitReachedMilestones,
  }

  const userMilestoneProgress = safeUsers
    .map((user) => milestoneProgressByUser.get(user.id))
    .filter((item): item is UserMilestoneProgress => Boolean(item))
    .sort((a, b) => {
      if (b.okTips !== a.okTips) return b.okTips - a.okTips
      if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate
      return b.bestWonOdds - a.bestWonOdds
    })

  milestoneEvents.sort((a, b) => {
    const timeDiff = new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime()
    if (timeDiff !== 0) return timeDiff
    return b.milestone - a.milestone
  })

  return {
    userYieldStats: userYieldStats.sort((a, b) => b.yield - a.yield),
    monthlyPerformanceHall: Object.values(monthlyWinners).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    top10Odds,
    monthlyOddsHall: Object.values(monthlyOddsWinners).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    userMilestoneProgress,
    milestoneEvents,
    teamTicketProgress,
    teamProfitMilestoneProgress,
  }
}

export default async function RankingPage() {
  const {
    userYieldStats,
    monthlyPerformanceHall,
    top10Odds,
    monthlyOddsHall,
    userMilestoneProgress,
    milestoneEvents,
    teamTicketProgress,
    teamProfitMilestoneProgress,
  } = await getRankingData()

  const recentPerformanceHall = monthlyPerformanceHall.slice(0, 6)
  const archivedPerformanceHall = monthlyPerformanceHall.slice(6)
  const recentOddsHall = monthlyOddsHall.slice(0, 6)
  const archivedOddsHall = monthlyOddsHall.slice(6)
  const latestMilestones = milestoneEvents.slice(0, 12)

  return (
    <div className="space-y-7">
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-slate-100 via-amber-50 to-orange-100 p-5 shadow-sm md:p-6">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="absolute -bottom-12 left-16 h-44 w-44 rounded-full bg-orange-300/20 blur-2xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-white/60 px-3 py-1 text-xs font-semibold text-amber-700 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Sieň slávy
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Milníky, rekordy a forma tipérov</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-700 md:text-base">
            Jasný prehľad kto, kedy a aký míľnik dosiahol, čo je ďalší cieľ a ako ďaleko je od neho.
          </p>
        </div>
      </div>

      <section className="space-y-3.5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-card-foreground md:text-xl">Profil tipérov a progres milníkov</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Osobné metriky: OK tipy, úspešnosť, najvyšší trafený kurz</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {userMilestoneProgress.map((user, index) => (
            <article
              key={user.userId}
              className={cn(
                'relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card via-card to-muted/15 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:p-5',
                index === 0 && 'ring-1 ring-amber-500/35',
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {index === 0 ? (
                      <Trophy className="h-5 w-5 text-amber-500" />
                    ) : index === 1 ? (
                      <Medal className="h-5 w-5 text-slate-500" />
                    ) : index === 2 ? (
                      <Medal className="h-5 w-5 text-orange-600" />
                    ) : (
                      <Milestone className="h-5 w-5 text-slate-500" />
                    )}
                    <p className="truncate text-base font-semibold tracking-tight text-card-foreground">{user.userName}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">#{index + 1} podľa osobných výsledkov</p>
                </div>
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-right">
                  <p className="text-xs text-emerald-700">OK tipy</p>
                  <p className="text-sm font-bold text-emerald-700">{user.okTips}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-card-foreground">OK tipy: {user.okTips}</span>
                    <span className="text-muted-foreground">
                      {user.nextOkTipsMilestone ? `ďalší ${user.nextOkTipsMilestone}` : 'max level'}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                      style={{ width: `${user.okTipsProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-card-foreground">
                      Úspešnosť: {user.hitRate.toFixed(1)}% ({user.resolvedTips} vyhodnotených)
                    </span>
                    <span className="text-muted-foreground">
                      {user.resolvedTips < HIT_RATE_MIN_SAMPLE
                        ? `unlock po ${HIT_RATE_MIN_SAMPLE}`
                        : user.nextHitRateMilestone
                          ? `ďalší ${user.nextHitRateMilestone}%`
                          : 'max level'}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600"
                      style={{ width: `${user.hitRateProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-card-foreground">Najvyšší trafený kurz: {user.bestWonOdds.toFixed(2)}</span>
                    <span className="text-muted-foreground">
                      {user.nextWonOddsMilestone ? `ďalší ${user.nextWonOddsMilestone.toFixed(2)}` : 'max level'}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                      style={{ width: `${user.wonOddsProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {user.reachedOkTipMilestones.slice(-2).map((item) => (
                  <span
                    key={`ok-${user.userId}-${item.value}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                  >
                    <Calendar className="h-3 w-3" />
                    {item.value} OK ({fullDateLabel(item.achievedAt)})
                  </span>
                ))}
                {user.reachedHitRateMilestones.slice(-1).map((item) => (
                  <span
                    key={`hr-${user.userId}-${item.value}`}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700"
                  >
                    <Calendar className="h-3 w-3" />
                    úspešnosť {item.value.toFixed(0)}% ({fullDateLabel(item.achievedAt)})
                  </span>
                ))}
                {user.reachedWonOddsMilestones.slice(-1).map((item) => (
                  <span
                    key={`odds-${user.userId}-${item.value}`}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                  >
                    <Calendar className="h-3 w-3" />
                    kurz {item.value.toFixed(2)} ({fullDateLabel(item.achievedAt)})
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Trophy className="h-4.5 w-4.5 text-sky-600" />
            Spoločné tímové milníky
          </h3>
          <p className="text-xs text-muted-foreground">zdieľaný cieľ pre všetkých</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <p className="font-semibold text-card-foreground">Spolu podaných tiketov: {teamTicketProgress.totalTickets}</p>
              <p className="text-muted-foreground">
                {teamTicketProgress.nextMilestone ? `ďalší cieľ ${teamTicketProgress.nextMilestone}` : 'max level'}
              </p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600"
                style={{ width: `${teamTicketProgress.progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teamTicketProgress.reachedMilestones.slice(-3).map((item) => (
                <span
                  key={`team-ticket-${item.value}-${item.achievedAt}`}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700"
                >
                  <Calendar className="h-3 w-3" />
                  {item.value} tiketov ({fullDateLabel(item.achievedAt)})
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <p className="font-semibold text-card-foreground">Tímový profit: {formatCurrency(teamProfitMilestoneProgress.totalProfit)}</p>
              <p className="text-muted-foreground">
                {teamProfitMilestoneProgress.nextMilestone
                  ? `ďalší cieľ +${teamProfitMilestoneProgress.nextMilestone.toFixed(0)} Kč`
                  : 'max level'}
              </p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{ width: `${teamProfitMilestoneProgress.progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teamProfitMilestoneProgress.reachedMilestones.slice(-3).map((item) => (
                <span
                  key={`team-profit-${item.value}-${item.achievedAt}`}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                >
                  <Calendar className="h-3 w-3" />
                  +{item.value.toFixed(0)} Kč ({fullDateLabel(item.achievedAt)})
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
              <Milestone className="h-4.5 w-4.5 text-sky-600" />
              Posledné dosiahnuté milníky
            </h3>
            <p className="text-xs text-muted-foreground">kto • čo • kedy</p>
          </div>

          <div className="space-y-2">
            {latestMilestones.length === 0 ? (
              <p className="rounded-xl border border-border/70 bg-card/70 p-3 text-sm text-muted-foreground">Zatiaľ žiadny milestone nebol dosiahnutý.</p>
            ) : (
              <>
                {latestMilestones.map((event) => (
                  <div
                    key={`${event.userId}-${event.metric}-${event.milestone}-${event.achievedAt}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-card-foreground">{event.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {getMilestoneVerb(event.metric)} {formatMilestoneEvent(event.metric, event.milestone)}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground">
                      {fullDateLabel(event.achievedAt)}
                    </div>
                  </div>
                ))}

                <details className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-card-foreground">
                    Zobraziť celkovú históriu milníkov ({milestoneEvents.length})
                  </summary>
                  <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {milestoneEvents.map((event, index) => (
                      <div
                        key={`${event.userId}-${event.metric}-${event.milestone}-${event.achievedAt}-full-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2"
                      >
                        <p className="truncate text-xs text-card-foreground">
                          <span className="font-semibold">{event.userName}</span> - {formatMilestoneEvent(event.metric, event.milestone)}
                        </p>
                        <p className="shrink-0 text-[11px] text-muted-foreground">{fullDateLabel(event.achievedAt)}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
              <Gauge className="h-4.5 w-4.5 text-emerald-600" />
              Výkonnosť tipérov (Yield)
            </h3>
            <p className="text-xs text-muted-foreground">podľa čistého ROI</p>
          </div>

          <div className="space-y-2">
            {userYieldStats.map((user, index) => (
              <div
                key={user.userId}
                className={cn(
                  'rounded-xl border border-border/70 bg-card/70 px-3 py-3',
                  index < 3 && 'border-amber-500/25 bg-amber-500/[0.06]',
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-card-foreground">{index + 1}. {user.userName}</p>
                  <p className={cn('text-sm font-bold', user.yield >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {formatYield(user.yield)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <p>OK: <span className="font-semibold text-card-foreground">{user.okTips}</span></p>
                  <p>Ø kurz: <span className="font-semibold text-card-foreground">{user.avgOdds.toFixed(2)}</span></p>
                  <p>Zisk: <span className={cn('font-semibold', user.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(user.netProfit)}</span></p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-card-foreground">Sieň slávy (mesiace - výkon)</h3>
            <p className="text-xs text-muted-foreground">aktuálne 6 mesiacov</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {recentPerformanceHall.map((row) => (
              <div key={row.monthKey} className="rounded-xl border border-border/70 bg-card/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.monthLabel}</p>
                <p className="mt-1 text-sm font-semibold text-card-foreground">{row.userName}</p>
                <p className="mt-1 text-xs text-muted-foreground">OK {row.okTips} • Yield {formatYield(row.yield)}</p>
              </div>
            ))}
          </div>

          {archivedPerformanceHall.length > 0 ? (
            <details className="mt-3 rounded-xl border border-border/70 bg-card/70 p-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-card-foreground">Zobraziť staršie mesiace ({archivedPerformanceHall.length})</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {archivedPerformanceHall.map((row) => (
                  <div key={`old-perf-${row.monthKey}`} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
                    <p className="font-medium text-card-foreground">{row.monthLabel}</p>
                    <p className="text-muted-foreground">{row.userName} • OK {row.okTips} • {formatYield(row.yield)}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-card-foreground">Sieň slávy (mesiace - kurz)</h3>
            <p className="text-xs text-muted-foreground">rekordný trafený kurz</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {recentOddsHall.map((row) => (
              <div key={row.monthKey} className="rounded-xl border border-border/70 bg-card/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.monthLabel}</p>
                <p className="mt-1 text-sm font-semibold text-card-foreground">{row.userName}</p>
                <p className="mt-1 text-xs text-muted-foreground truncate">{row.context}</p>
                <p className="mt-1.5 inline-flex rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Kurz {row.odds.toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          {archivedOddsHall.length > 0 ? (
            <details className="mt-3 rounded-xl border border-border/70 bg-card/70 p-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-card-foreground">Zobraziť staršie mesiace ({archivedOddsHall.length})</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {archivedOddsHall.map((row) => (
                  <div key={`old-odds-${row.monthKey}`} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-xs">
                    <p className="font-medium text-card-foreground">{row.monthLabel}</p>
                    <p className="text-muted-foreground">{row.userName} • kurz {row.odds.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <Star className="h-4.5 w-4.5 text-amber-500" />
            Top 10 kurzov
          </h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            historicky najvyššie trafené
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {top10Odds.map((item) => (
            <div
              key={`${item.rank}-${item.userName}-${item.dateLabel}-${item.odds}`}
              className={cn(
                'rounded-xl border border-border/70 bg-card/70 p-3',
                item.rank <= 3 && 'border-amber-500/30 bg-amber-500/[0.06]',
              )}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <p className={cn('text-sm font-semibold text-muted-foreground', item.rank <= 3 && 'text-amber-700')}>#{item.rank}</p>
                <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {item.odds.toFixed(2)}
                </p>
              </div>
              <p className="truncate text-sm font-semibold text-card-foreground">{item.userName}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.dateLabel} • {item.context}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
