import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { StatisticsCharts } from './charts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Activity,
  BarChart3,
  DollarSign,
  Info,
  ShieldAlert,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

type TicketRecord = {
  id: string
  status: 'win' | 'loss' | 'pending'
  date: string
  stake: number | string | null
  payout: number | string | null
  combined_odds: number | string | null
  possible_win: number | string | null
  description: string | null
}

type PredictionRecord = {
  id: string
  user_id: string
  ticket_id?: string | null
  result: string | null
  odds: number | string | null
  profit?: number | string | null
  tip_date: string | null
  created_at?: string | null
  sport?: { name?: string | null } | { name?: string | null }[] | null
  league?: { name?: string | null } | { name?: string | null }[] | null
}

type UserRecord = {
  id: string
  name: string
}

type FinanceTransactionRecord = {
  id: string
  type: 'deposit' | 'withdraw' | 'bet' | 'payout'
  amount: number | string | null
  date: string
}

type PeriodKey = '7d' | '30d' | '90d' | 'ytd' | 'all'

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

type StreakPeriod = {
  start: string
  end: string
}

type StatisticsData = {
  error?: string
  asOf: string
  period: PeriodKey
  minTips: number
  rangeLabel: string
  overview: {
    ticketHitRate: number
    tipHitRate: number
    yield: number
    totalProfit: number
    totalStake: number
    avgStake: number
    profitFactor: number
    maxDrawdown: number
    closingBankroll: number
    totalTickets: number
  }
  deltas: {
    totalProfit: number | null
    yield: number | null
    ticketHitRate: number | null
    tipHitRate: number | null
  }
  quickStats: {
    avgWinningOdds: number
    avgLosingOdds: number
    volatility: number
    bestDayLabel: string
    worstDayLabel: string
  }
  weekLabels: string[]
  contextMinTips: number
  tipperInsights: Array<{
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
    longestOkStreakPeriod: StreakPeriod | null
    longestNokStreakPeriod: StreakPeriod | null
    soloWinningTipTickets: number
    brokenTickets: number
    bestSport: { name: string; yield: number; tips: number } | null
    bestLeague: { name: string; yield: number; tips: number } | null
  }>
  bestContextByTipper: Array<{
    userName: string
    bestSport: { name: string; yield: number; tips: number } | null
    bestLeague: { name: string; yield: number; tips: number } | null
  }>
  topTicketWins: Array<{
    id: string
    description: string
    date: string | null
    odds: number
    stake: number
    payout: number
    profit: number
  }>
  monthlyBettingStats: MonthlyBettingStat[]
  monthlyCashflowStats: MonthlyCashflowStat[]
  weekdayPerformance: WeekdayPerformanceStat[]
  oddsRangePerformance: OddsRangePerformanceStat[]
  dailyIntensityPerformance: DailyIntensityPerformanceStat[]
  dailyIntensityPerformanceByWeekday: Array<{
    dayKey: number
    dayLabel: string
    rows: DailyIntensityPerformanceStat[]
  }>
  streakStats: StreakStats
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeTransactionAmount(tx: FinanceTransactionRecord) {
  const raw = Math.abs(toNumber(tx.amount))
  if (tx.type === 'deposit' || tx.type === 'payout') return raw
  if (tx.type === 'withdraw' || tx.type === 'bet') return -raw
  return toNumber(tx.amount)
}

function getTicketOdds(ticket: TicketRecord) {
  const directOdds = toNumber(ticket.combined_odds)
  if (directOdds >= 1) return directOdds

  const stake = toNumber(ticket.stake)
  const possibleWin = toNumber(ticket.possible_win)
  if (stake > 0 && possibleWin > 0) {
    const inferred = possibleWin / stake
    if (Number.isFinite(inferred) && inferred >= 1) return inferred
  }

  return 0
}

function normalizeResult(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function getMonthKey(dateValue: string) {
  const date = new Date(dateValue)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('sk-SK', {
    month: 'short',
    year: '2-digit',
  })
}

function generateMonthRange(startMonthKey: string, endMonthKey: string) {
  const [startYear, startMonth] = startMonthKey.split('-').map(Number)
  const [endYear, endMonth] = endMonthKey.split('-').map(Number)
  const keys: string[] = []
  const cursor = new Date(startYear, startMonth - 1, 1)
  const end = new Date(endYear, endMonth - 1, 1)

  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return keys
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getPeriodWindow(period: PeriodKey) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'all') return { start: null as string | null, end: toDateKey(today), days: null as number | null }
  if (period === 'ytd') {
    const start = new Date(today.getFullYear(), 0, 1)
    return {
      start: toDateKey(start),
      end: toDateKey(today),
      days: Math.floor((today.getTime() - start.getTime()) / 86400000) + 1,
    }
  }

  const dayCount = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const start = new Date(today)
  start.setDate(start.getDate() - (dayCount - 1))
  return { start: toDateKey(start), end: toDateKey(today), days: dayCount }
}

function getPreviousWindow(period: PeriodKey) {
  const current = getPeriodWindow(period)
  if (period === 'all' || !current.start || !current.days) return { start: null as string | null, end: null as string | null }

  const currentStart = new Date(current.start)
  const prevEnd = new Date(currentStart)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - (current.days - 1))

  return { start: toDateKey(prevStart), end: toDateKey(prevEnd) }
}

function inRange(dateValue: string | null | undefined, start: string | null, end: string | null) {
  if (!dateValue) return false
  if (!start || !end) return true
  return dateValue >= start && dateValue <= end
}

function formatPeriodLabel(period: PeriodKey) {
  if (period === '7d') return 'Posledných 7 dní'
  if (period === '30d') return 'Posledných 30 dní'
  if (period === '90d') return 'Posledných 90 dní'
  if (period === 'ytd') return 'Od začiatku roka'
  return 'Celá história'
}

function getPredictionDate(prediction: PredictionRecord, ticketById: Map<string, TicketRecord>) {
  if (prediction.tip_date) return prediction.tip_date
  if (prediction.ticket_id && ticketById.has(prediction.ticket_id)) return ticketById.get(prediction.ticket_id)!.date
  return prediction.created_at || null
}

function toWeekStartMonday(dateValue: string) {
  const date = new Date(dateValue)
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = normalized.getDay()
  const offset = day === 0 ? -6 : 1 - day
  normalized.setDate(normalized.getDate() + offset)
  return normalized
}

function weekKey(dateValue: string) {
  const monday = toWeekStartMonday(dateValue)
  return toDateKey(monday)
}

function last8WeekKeys() {
  const today = new Date()
  const monday = toWeekStartMonday(toDateKey(today))
  const keys: string[] = []
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(monday)
    d.setDate(d.getDate() - i * 7)
    keys.push(toDateKey(d))
  }
  return keys
}

function weekLabel(weekStartKey: string) {
  const d = new Date(weekStartKey)
  return d.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })
}

function getStakeShare(prediction: PredictionRecord, ticketById: Map<string, TicketRecord>, legCountByTicket: Record<string, number>) {
  if (!prediction.ticket_id) return 0
  const ticket = ticketById.get(prediction.ticket_id)
  if (!ticket) return 0
  const legs = legCountByTicket[prediction.ticket_id] || 0
  if (legs <= 0) return 0
  return toNumber(ticket.stake) / legs
}

function getVirtualPredictionProfit(prediction: PredictionRecord, stakeShare: number) {
  if (stakeShare <= 0) return 0
  const result = normalizeResult(prediction.result)
  if (result === 'OK') return toNumber(prediction.odds) * stakeShare - stakeShare
  if (result === 'NOK') return -stakeShare
  return 0
}

function formatDelta(value: number | null, suffix = '') {
  if (value === null || Number.isNaN(value)) return 'Bez porovnania'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}${suffix} vs predch. obdobie`
}

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw new Error(error.message || 'Nepodarilo sa načítať dáta')

    const rows = data || []
    all.push(...rows)

    if (rows.length < pageSize) break
    from += pageSize
  }

  return all
}

function relationName(value: PredictionRecord['sport'] | PredictionRecord['league']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name || null
  return value.name || null
}

function computeMaxDrawdown(tickets: TicketRecord[]) {
  const sorted = [...tickets].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0

  for (const ticket of sorted) {
    if (ticket.status === 'pending') continue
    cumulative += toNumber(ticket.payout) - toNumber(ticket.stake)
    if (cumulative > peak) peak = cumulative
    const drawdown = peak - cumulative
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
  }

  return maxDrawdown
}

function computeStreakStats(tickets: TicketRecord[]): StreakStats {
  const resolved = [...tickets]
    .filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let currentWin = 0
  let currentLoss = 0
  let maxWin = 0
  let maxLoss = 0
  let trailingWin = 0
  let trailingLoss = 0

  for (const ticket of resolved) {
    if (ticket.status === 'win') {
      currentWin += 1
      currentLoss = 0
      trailingWin += 1
      trailingLoss = 0
    } else {
      currentLoss += 1
      currentWin = 0
      trailingLoss += 1
      trailingWin = 0
    }
    if (currentWin > maxWin) maxWin = currentWin
    if (currentLoss > maxLoss) maxLoss = currentLoss
  }

  return {
    currentWin: trailingWin,
    currentLoss: trailingLoss,
    maxWin,
    maxLoss,
  }
}

function buildWeekdayPerformance(tickets: TicketRecord[]): WeekdayPerformanceStat[] {
  const orderedDays = getOrderedWeekdays()

  const base = orderedDays.map(({ dayLabel, dayKey }) => ({
    dayKey,
    dayLabel,
    tickets: 0,
    wins: 0,
    profit: 0,
  }))

  for (const ticket of tickets) {
    if (ticket.status !== 'win' && ticket.status !== 'loss') continue
    const jsDayKey = new Date(ticket.date).getDay()
    const slot = base.find((day) => day.dayKey === jsDayKey)
    if (!slot) continue

    slot.tickets += 1
    if (ticket.status === 'win') slot.wins += 1
    slot.profit += toNumber(ticket.payout) - toNumber(ticket.stake)
  }

  return base.map((item) => ({
    dayKey: item.dayKey,
    dayLabel: item.dayLabel,
    tickets: item.tickets,
    winRate: item.tickets > 0 ? (item.wins / item.tickets) * 100 : 0,
    profit: item.profit,
  }))
}

function buildOddsRangePerformance(predictions: PredictionRecord[]): OddsRangePerformanceStat[] {
  const ranges = [
    { label: '1.00-1.49', min: 1, max: 1.49 },
    { label: '1.50-1.99', min: 1.5, max: 1.99 },
    { label: '2.00-2.99', min: 2, max: 2.99 },
    { label: '3.00-4.99', min: 3, max: 4.99 },
    { label: '5.00+', min: 5, max: Number.POSITIVE_INFINITY },
  ]

  const bucket = ranges.map((range) => ({
    ...range,
    tips: 0,
    wins: 0,
    stakeProxy: 0,
    profit: 0,
  }))

  for (const prediction of predictions) {
    const result = normalizeResult(prediction.result)
    if (result !== 'OK' && result !== 'NOK') continue

    const odds = toNumber(prediction.odds)
    if (odds < 1) continue
    const slot = bucket.find((item) => odds >= item.min && odds <= item.max)
    if (!slot) continue

    slot.tips += 1
    if (result === 'OK') slot.wins += 1
    slot.stakeProxy += 1
    slot.profit += toNumber(prediction.profit)
  }

  return bucket.map((item) => ({
    label: item.label,
    tickets: item.tips,
    winRate: item.tips > 0 ? (item.wins / item.tips) * 100 : 0,
    profit: item.profit,
    yield: item.stakeProxy > 0 ? (item.profit / item.stakeProxy) * 100 : 0,
  }))
}

function intensityBucketKey(dayTicketCount: number): DailyIntensityPerformanceStat['bucketKey'] {
  if (dayTicketCount <= 1) return '1'
  if (dayTicketCount === 2) return '2'
  if (dayTicketCount === 3) return '3'
  return '4+'
}

function intensityBucketLabel(bucketKey: DailyIntensityPerformanceStat['bucketKey']) {
  if (bucketKey === '1') return '1 tiket/deň'
  if (bucketKey === '2') return '2 tikety/deň'
  if (bucketKey === '3') return '3 tikety/deň'
  return '4+ tiketov/deň'
}

function getOrderedWeekdays() {
  return [
    { dayKey: 1, dayLabel: 'Po' },
    { dayKey: 2, dayLabel: 'Ut' },
    { dayKey: 3, dayLabel: 'St' },
    { dayKey: 4, dayLabel: 'Št' },
    { dayKey: 5, dayLabel: 'Pi' },
    { dayKey: 6, dayLabel: 'So' },
    { dayKey: 0, dayLabel: 'Ne' },
  ]
}

function getReliability(dayCount: number): DailyIntensityPerformanceStat['reliability'] {
  if (dayCount >= 30) return 'Vysoká'
  if (dayCount >= 10) return 'Stredná'
  return 'Nízka'
}

function buildDailyIntensityPerformance(tickets: TicketRecord[], weekdayFilter: number | null = null): DailyIntensityPerformanceStat[] {
  const byDay = new Map<string, TicketRecord[]>()
  for (const ticket of tickets) {
    if (weekdayFilter !== null && new Date(ticket.date).getDay() !== weekdayFilter) continue
    const list = byDay.get(ticket.date) || []
    list.push(ticket)
    byDay.set(ticket.date, list)
  }

  const orderedBuckets: Array<DailyIntensityPerformanceStat['bucketKey']> = ['1', '2', '3', '4+']
  const base = new Map<DailyIntensityPerformanceStat['bucketKey'], {
    dayCount: number
    resolvedDayCount: number
    tickets: number
    resolvedTickets: number
    wins: number
    stake: number
    payout: number
    unresolvedTickets: number
  }>(
    orderedBuckets.map((bucket) => [
      bucket,
      {
        dayCount: 0,
        resolvedDayCount: 0,
        tickets: 0,
        resolvedTickets: 0,
        wins: 0,
        stake: 0,
        payout: 0,
        unresolvedTickets: 0,
      },
    ]),
  )

  for (const dayTickets of byDay.values()) {
    const bucketKey = intensityBucketKey(dayTickets.length)
    const entry = base.get(bucketKey)
    if (!entry) continue

    const resolved = dayTickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
    const wins = resolved.filter((ticket) => ticket.status === 'win')
    const dayStake = resolved.reduce((sum, ticket) => sum + toNumber(ticket.stake), 0)
    const dayPayout = resolved.reduce((sum, ticket) => sum + toNumber(ticket.payout), 0)

    entry.dayCount += 1
    entry.tickets += dayTickets.length
    entry.resolvedTickets += resolved.length
    entry.wins += wins.length
    entry.stake += dayStake
    entry.payout += dayPayout
    entry.unresolvedTickets += dayTickets.length - resolved.length
    if (resolved.length > 0) entry.resolvedDayCount += 1
  }

  return orderedBuckets.map((bucketKey) => {
    const entry = base.get(bucketKey)!
    const profit = entry.payout - entry.stake
    const roi = entry.stake > 0 ? (profit / entry.stake) * 100 : 0
    const winRate = entry.resolvedTickets > 0 ? (entry.wins / entry.resolvedTickets) * 100 : 0
    const avgStakePerDay = entry.resolvedDayCount > 0 ? entry.stake / entry.resolvedDayCount : 0

    return {
      bucketKey,
      bucketLabel: intensityBucketLabel(bucketKey),
      dayCount: entry.dayCount,
      resolvedDayCount: entry.resolvedDayCount,
      tickets: entry.tickets,
      resolvedTickets: entry.resolvedTickets,
      wins: entry.wins,
      winRate,
      stake: entry.stake,
      payout: entry.payout,
      profit,
      roi,
      avgStakePerDay,
      unresolvedTickets: entry.unresolvedTickets,
      reliability: getReliability(entry.dayCount),
    }
  })
}

function buildDailyIntensityPerformanceByWeekday(tickets: TicketRecord[]) {
  return getOrderedWeekdays().map((day) => ({
    dayKey: day.dayKey,
    dayLabel: day.dayLabel,
    rows: buildDailyIntensityPerformance(tickets, day.dayKey),
  }))
}

function buildMonthlyBettingStats(tickets: TicketRecord[]): MonthlyBettingStat[] {
  const resolved = tickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
  if (resolved.length === 0) return []

  const stakeByMonth: Record<string, number> = {}
  const payoutByMonth: Record<string, number> = {}

  for (const ticket of resolved) {
    const key = getMonthKey(ticket.date)
    stakeByMonth[key] = (stakeByMonth[key] || 0) + toNumber(ticket.stake)
    payoutByMonth[key] = (payoutByMonth[key] || 0) + toNumber(ticket.payout)
  }

  const monthKeys = [...new Set([...Object.keys(stakeByMonth), ...Object.keys(payoutByMonth)])].sort()
  const fullRange = generateMonthRange(monthKeys[0], monthKeys[monthKeys.length - 1])

  let cumulativeProfit = 0
  return fullRange.map((monthKey) => {
    const stake = stakeByMonth[monthKey] || 0
    const payout = payoutByMonth[monthKey] || 0
    const profit = payout - stake
    cumulativeProfit += profit

    return {
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      stake,
      payout,
      profit,
      cumulativeProfit,
    }
  })
}

function buildMonthlyCashflowStats(transactions: FinanceTransactionRecord[], tickets: TicketRecord[]): MonthlyCashflowStat[] {
  if (transactions.length === 0 && tickets.length === 0) return []

  const byMonth: Record<string, Omit<MonthlyCashflowStat, 'monthKey' | 'monthLabel' | 'cumulativeCashflow'>> = {}

  for (const tx of transactions) {
    if (tx.type !== 'deposit' && tx.type !== 'withdraw') continue

    const key = getMonthKey(tx.date)
    const normalizedAmount = normalizeTransactionAmount(tx)

    if (!byMonth[key]) {
      byMonth[key] = {
        deposits: 0,
        withdrawals: 0,
        bets: 0,
        payouts: 0,
        netCashflow: 0,
      }
    }

    if (tx.type === 'deposit') byMonth[key].deposits += Math.abs(normalizedAmount)
    if (tx.type === 'withdraw') byMonth[key].withdrawals += Math.abs(normalizedAmount)

    byMonth[key].netCashflow += normalizedAmount
  }

  for (const ticket of tickets) {
    const key = getMonthKey(ticket.date)

    if (!byMonth[key]) {
      byMonth[key] = {
        deposits: 0,
        withdrawals: 0,
        bets: 0,
        payouts: 0,
        netCashflow: 0,
      }
    }

    const stake = Math.abs(toNumber(ticket.stake))
    const payout = Math.abs(toNumber(ticket.payout))

    byMonth[key].bets += stake
    byMonth[key].netCashflow -= stake

    if (ticket.status === 'win' && payout > 0) {
      byMonth[key].payouts += payout
      byMonth[key].netCashflow += payout
    }
  }

  const monthKeys = Object.keys(byMonth).sort()
  const fullRange = generateMonthRange(monthKeys[0], monthKeys[monthKeys.length - 1])

  let cumulativeCashflow = 0
  return fullRange.map((monthKey) => {
    const current = byMonth[monthKey] || {
      deposits: 0,
      withdrawals: 0,
      bets: 0,
      payouts: 0,
      netCashflow: 0,
    }

    cumulativeCashflow += current.netCashflow

    return {
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      ...current,
      cumulativeCashflow,
    }
  })
}

function computeDeltas(current: StatisticsData['overview'], previous: StatisticsData['overview']) {
  return {
    totalProfit: current.totalProfit - previous.totalProfit,
    yield: current.yield - previous.yield,
    ticketHitRate: current.ticketHitRate - previous.ticketHitRate,
    tipHitRate: current.tipHitRate - previous.tipHitRate,
  }
}

function computeOverview(tickets: TicketRecord[], predictions: PredictionRecord[], allTickets: TicketRecord[], allCashflow: FinanceTransactionRecord[]) {
  const resolvedTickets = tickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
  const wonTickets = resolvedTickets.filter((ticket) => ticket.status === 'win')
  const lostTickets = resolvedTickets.filter((ticket) => ticket.status === 'loss')
  const totalStake = resolvedTickets.reduce((sum, ticket) => sum + toNumber(ticket.stake), 0)
  const totalPayout = resolvedTickets.reduce((sum, ticket) => sum + toNumber(ticket.payout), 0)
  const totalProfit = totalPayout - totalStake

  const grossWins = wonTickets.reduce((sum, ticket) => sum + Math.max(0, toNumber(ticket.payout) - toNumber(ticket.stake)), 0)
  const grossLosses = lostTickets.reduce((sum, ticket) => sum + Math.abs(Math.min(0, toNumber(ticket.payout) - toNumber(ticket.stake))), 0)

  const predictionCompleted = predictions.filter((prediction) => {
    const result = normalizeResult(prediction.result)
    return result === 'OK' || result === 'NOK'
  })

  const predictionWins = predictionCompleted.filter((prediction) => normalizeResult(prediction.result) === 'OK').length

  const depositsWithdrawals = allCashflow
    .filter((tx) => tx.type === 'deposit' || tx.type === 'withdraw')
    .reduce((sum, tx) => sum + normalizeTransactionAmount(tx), 0)
  const allTimeStake = allTickets.reduce((sum, ticket) => sum + toNumber(ticket.stake), 0)
  const allTimePayout = allTickets.reduce((sum, ticket) => sum + toNumber(ticket.payout), 0)

  return {
    ticketHitRate: resolvedTickets.length > 0 ? (wonTickets.length / resolvedTickets.length) * 100 : 0,
    tipHitRate: predictionCompleted.length > 0 ? (predictionWins / predictionCompleted.length) * 100 : 0,
    yield: totalStake > 0 ? (totalProfit / totalStake) * 100 : 0,
    totalProfit,
    totalStake,
    avgStake: resolvedTickets.length > 0 ? totalStake / resolvedTickets.length : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Number.POSITIVE_INFINITY : 0,
    maxDrawdown: computeMaxDrawdown(tickets),
    closingBankroll: allTimePayout + depositsWithdrawals - allTimeStake,
    totalTickets: tickets.length,
  }
}

function computeQuickStats(tickets: TicketRecord[], weekdayPerformance: WeekdayPerformanceStat[]) {
  const resolved = tickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
  const winning = resolved.filter((ticket) => ticket.status === 'win')
  const losing = resolved.filter((ticket) => ticket.status === 'loss')
  const pnl = resolved.map((ticket) => toNumber(ticket.payout) - toNumber(ticket.stake))

  const avgWinningOdds = winning.length > 0
    ? winning.reduce((sum, ticket) => sum + getTicketOdds(ticket), 0) / winning.length
    : 0
  const avgLosingOdds = losing.length > 0
    ? losing.reduce((sum, ticket) => sum + getTicketOdds(ticket), 0) / losing.length
    : 0

  const mean = pnl.length > 0 ? pnl.reduce((sum, value) => sum + value, 0) / pnl.length : 0
  const variance = pnl.length > 0 ? pnl.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pnl.length : 0
  const volatility = Math.sqrt(variance)

  const bestDay = [...weekdayPerformance].sort((a, b) => b.profit - a.profit)[0]
  const worstDay = [...weekdayPerformance].sort((a, b) => a.profit - b.profit)[0]

  return {
    avgWinningOdds,
    avgLosingOdds,
    volatility,
    bestDayLabel: bestDay ? `${bestDay.dayLabel} (${bestDay.profit.toFixed(0)} Kč)` : '-',
    worstDayLabel: worstDay ? `${worstDay.dayLabel} (${worstDay.profit.toFixed(0)} Kč)` : '-',
  }
}

async function getStatistics(period: PeriodKey, minTips: number): Promise<StatisticsData> {
  try {
    const supabase = await createClient()

    const [tickets, predictions, users, financeTransactions] = await Promise.all([
      fetchAll<TicketRecord>(async (from, to) =>
        await supabase.from('tickets').select('id, status, date, stake, payout, combined_odds, possible_win, description').order('date', { ascending: true }).range(from, to),
      ),
      fetchAll<PredictionRecord>(async (from, to) =>
        await supabase
          .from('predictions')
          .select('id, user_id, ticket_id, result, odds, profit, tip_date, created_at, sport:sports(name), league:leagues(name)')
          .order('tip_date', { ascending: true, nullsFirst: true })
          .range(from, to),
      ),
      fetchAll<UserRecord>(async (from, to) =>
        await supabase.from('users').select('id, name').order('name', { ascending: true }).range(from, to),
      ),
      fetchAll<FinanceTransactionRecord>(async (from, to) =>
        await supabase.from('finance_transactions').select('id, type, amount, date').order('date', { ascending: true }).range(from, to),
      ),
    ])

    const { start, end } = getPeriodWindow(period)
    const { start: prevStart, end: prevEnd } = getPreviousWindow(period)
    const allTicketById = new Map<string, TicketRecord>(tickets.map((ticket) => [ticket.id, ticket]))

    const filteredTickets = tickets.filter((ticket) => inRange(ticket.date, start, end))
    const filteredPredictions = predictions.filter((prediction) => inRange(getPredictionDate(prediction, allTicketById), start, end))
    const filteredFinanceTransactions = financeTransactions.filter((tx) => inRange(tx.date, start, end))
    const ticketById = new Map<string, TicketRecord>(filteredTickets.map((ticket) => [ticket.id, ticket]))
    const legCountByTicket = filteredPredictions.reduce((acc, prediction) => {
      if (!prediction.ticket_id) return acc
      acc[prediction.ticket_id] = (acc[prediction.ticket_id] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const weekKeys = last8WeekKeys()
    const contextMinTips = 5

    const previousTickets = tickets.filter((ticket) => inRange(ticket.date, prevStart, prevEnd))
    const previousPredictions = predictions.filter((prediction) => inRange(getPredictionDate(prediction, allTicketById), prevStart, prevEnd))

    const highestWonOddsByUser = new Map<string, number>()
    for (const prediction of filteredPredictions) {
      if (normalizeResult(prediction.result) !== 'OK') continue
      const current = highestWonOddsByUser.get(prediction.user_id) ?? 0
      const odds = toNumber(prediction.odds)
      if (odds > current) highestWonOddsByUser.set(prediction.user_id, odds)
    }

    const overview = computeOverview(filteredTickets, filteredPredictions, tickets, financeTransactions)
    const previousOverview = computeOverview(previousTickets, previousPredictions, tickets, financeTransactions)
    const weekdayPerformance = buildWeekdayPerformance(filteredTickets)
    const oddsRangePerformance = buildOddsRangePerformance(filteredPredictions)
    const streakStats = computeStreakStats(filteredTickets)
    const quickStats = computeQuickStats(filteredTickets, weekdayPerformance)
    const deltas = period === 'all'
      ? { totalProfit: null, yield: null, ticketHitRate: null, tipHitRate: null }
      : computeDeltas(overview, previousOverview)

    const tipperInsights = users
      .map((user) => {
        const userPreds = filteredPredictions.filter((prediction) => prediction.user_id === user.id)
        const wins = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
        const losses = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'NOK').length
        const chickenWinsAtOddsOne = userPreds.filter((prediction) => {
          if (normalizeResult(prediction.result) !== 'OK') return false
          return Math.abs(toNumber(prediction.odds) - 1) < 0.000001
        }).length
        const completed = wins + losses
        const avgOdds = userPreds.length > 0 ? userPreds.reduce((sum, prediction) => sum + toNumber(prediction.odds), 0) / userPreds.length : 0
        const weekProfitMap = new Map<string, number>()
        const sportStats = new Map<string, { tips: number; stake: number; profit: number }>()
        const leagueStats = new Map<string, { tips: number; stake: number; profit: number }>()
        const sortedResolvedPreds = [...userPreds]
          .filter((prediction) => {
            const result = normalizeResult(prediction.result)
            return result === 'OK' || result === 'NOK'
          })
          .sort((a, b) => {
            const ad = getPredictionDate(a, ticketById) || ''
            const bd = getPredictionDate(b, ticketById) || ''
            return ad.localeCompare(bd)
          })

        let longestOkStreak = 0
        let longestNokStreak = 0
        let currentOkStreak = 0
        let currentNokStreak = 0
        let currentOkStart: string | null = null
        let currentNokStart: string | null = null
        let longestOkStreakPeriod: StreakPeriod | null = null
        let longestNokStreakPeriod: StreakPeriod | null = null

        for (const prediction of sortedResolvedPreds) {
          const result = normalizeResult(prediction.result)
          const predictionDate = getPredictionDate(prediction, ticketById)

          if (result === 'OK') {
            if (currentOkStreak === 0) currentOkStart = predictionDate
            currentOkStreak += 1
            currentNokStreak = 0
            currentNokStart = null
          } else {
            if (currentNokStreak === 0) currentNokStart = predictionDate
            currentNokStreak += 1
            currentOkStreak = 0
            currentOkStart = null
          }

          if (currentOkStreak > longestOkStreak) {
            longestOkStreak = currentOkStreak
            longestOkStreakPeriod = currentOkStart && predictionDate
              ? { start: currentOkStart, end: predictionDate }
              : null
          }
          if (currentNokStreak > longestNokStreak) {
            longestNokStreak = currentNokStreak
            longestNokStreakPeriod = currentNokStart && predictionDate
              ? { start: currentNokStart, end: predictionDate }
              : null
          }
        }

        for (const prediction of userPreds) {
          const result = normalizeResult(prediction.result)
          if (result !== 'OK' && result !== 'NOK') continue

          const predictionDate = getPredictionDate(prediction, ticketById)
          if (predictionDate) {
            const wk = weekKey(predictionDate)
            const share = getStakeShare(prediction, ticketById, legCountByTicket)
            const virtualProfit = getVirtualPredictionProfit(prediction, share)
            weekProfitMap.set(wk, (weekProfitMap.get(wk) || 0) + virtualProfit)

            const sportName = relationName(prediction.sport) || 'Nezaradené'
            const leagueName = relationName(prediction.league) || 'Nezaradené'

            const sportEntry = sportStats.get(sportName) || { tips: 0, stake: 0, profit: 0 }
            sportEntry.tips += 1
            sportEntry.stake += share
            sportEntry.profit += virtualProfit
            sportStats.set(sportName, sportEntry)

            const leagueEntry = leagueStats.get(leagueName) || { tips: 0, stake: 0, profit: 0 }
            leagueEntry.tips += 1
            leagueEntry.stake += share
            leagueEntry.profit += virtualProfit
            leagueStats.set(leagueName, leagueEntry)
          }
        }

        const trend8w = weekKeys.map((wk) => weekProfitMap.get(wk) || 0)

        const bestSport = [...sportStats.entries()]
          .filter(([, value]) => value.tips >= contextMinTips && value.stake > 0)
          .map(([name, value]) => ({
            name,
            tips: value.tips,
            yield: (value.profit / value.stake) * 100,
          }))
          .sort((a, b) => b.yield - a.yield)[0] || null

        const bestLeague = [...leagueStats.entries()]
          .filter(([, value]) => value.tips >= contextMinTips && value.stake > 0)
          .map(([name, value]) => ({
            name,
            tips: value.tips,
            yield: (value.profit / value.stake) * 100,
          }))
          .sort((a, b) => b.yield - a.yield)[0] || null

        return {
          userId: user.id,
          name: user.name,
          wins,
          losses,
          total: userPreds.length,
          winRate: completed > 0 ? (wins / completed) * 100 : 0,
          avgOdds,
          highestWonOdds: highestWonOddsByUser.get(user.id) ?? 0,
          totalCorrect: wins,
          chickenWinsAtOddsOne,
          trend8w,
          longestOkStreak,
          longestNokStreak,
          longestOkStreakPeriod,
          longestNokStreakPeriod,
          soloWinningTipTickets: 0,
          brokenTickets: 0,
          bestSport,
          bestLeague,
        }
      })
      .filter((user) => user.total >= minTips)
      .sort((a, b) => b.winRate - a.winRate)

    const brokenTicketCountByUser = new Map<string, number>()
    const soloWinningTipTicketCountByUser = new Map<string, number>()
    const predictionsByTicket = filteredPredictions.reduce((acc, prediction) => {
      if (!prediction.ticket_id) return acc
      if (!acc[prediction.ticket_id]) acc[prediction.ticket_id] = []
      acc[prediction.ticket_id].push(prediction)
      return acc
    }, {} as Record<string, PredictionRecord[]>)

    for (const ticketPredictions of Object.values(predictionsByTicket)) {
      const resolvedPredictions = ticketPredictions.filter((prediction) => {
        const result = normalizeResult(prediction.result)
        return result === 'OK' || result === 'NOK'
      })
      if (resolvedPredictions.length < 2 || resolvedPredictions.length !== ticketPredictions.length) continue

      const okPredictions = resolvedPredictions.filter((prediction) => normalizeResult(prediction.result) === 'OK')
      if (okPredictions.length === 1) {
        const soloWinnerUserId = okPredictions[0].user_id
        soloWinningTipTicketCountByUser.set(soloWinnerUserId, (soloWinningTipTicketCountByUser.get(soloWinnerUserId) || 0) + 1)
      }

      const nokPredictions = resolvedPredictions.filter((prediction) => normalizeResult(prediction.result) === 'NOK')
      if (nokPredictions.length !== 1) continue

      const culpritUserId = nokPredictions[0].user_id
      brokenTicketCountByUser.set(culpritUserId, (brokenTicketCountByUser.get(culpritUserId) || 0) + 1)
    }

    const tipperInsightsWithBrokenTickets = tipperInsights.map((user) => ({
      ...user,
      soloWinningTipTickets: soloWinningTipTicketCountByUser.get(user.userId) || 0,
      brokenTickets: brokenTicketCountByUser.get(user.userId) || 0,
    }))

    const bestContextByTipper = tipperInsights.map((user) => ({
      userName: user.name,
      bestSport: user.bestSport,
      bestLeague: user.bestLeague,
    }))

    const topTicketWins = filteredTickets
      .filter((ticket) => ticket.status === 'win')
      .map((ticket) => ({
        id: ticket.id,
        description: ticket.description || 'Výherný tiket',
        date: ticket.date || null,
        odds: getTicketOdds(ticket),
        stake: toNumber(ticket.stake),
        payout: toNumber(ticket.payout),
        profit: toNumber(ticket.payout) - toNumber(ticket.stake),
      }))
      .sort((a, b) => b.profit - a.profit || b.payout - a.payout || b.odds - a.odds)
      .slice(0, 3)

    return {
      asOf: new Date().toLocaleString('sk-SK'),
      period,
      minTips,
      rangeLabel: formatPeriodLabel(period),
      overview,
      deltas,
      quickStats,
      weekLabels: weekKeys.map(weekLabel),
      contextMinTips,
      tipperInsights: tipperInsightsWithBrokenTickets,
      bestContextByTipper,
      topTicketWins,
      monthlyBettingStats: buildMonthlyBettingStats(filteredTickets),
      monthlyCashflowStats: buildMonthlyCashflowStats(filteredFinanceTransactions, filteredTickets),
      weekdayPerformance,
      oddsRangePerformance,
      dailyIntensityPerformance: buildDailyIntensityPerformance(filteredTickets),
      dailyIntensityPerformanceByWeekday: buildDailyIntensityPerformanceByWeekday(filteredTickets),
      streakStats,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Nepodarilo sa načítať štatistiky',
      asOf: new Date().toLocaleString('sk-SK'),
      period,
      minTips,
      rangeLabel: formatPeriodLabel(period),
      overview: {
        ticketHitRate: 0,
        tipHitRate: 0,
        yield: 0,
        totalProfit: 0,
        totalStake: 0,
        avgStake: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        closingBankroll: 0,
        totalTickets: 0,
      },
      deltas: {
        totalProfit: null,
        yield: null,
        ticketHitRate: null,
        tipHitRate: null,
      },
      quickStats: {
        avgWinningOdds: 0,
        avgLosingOdds: 0,
        volatility: 0,
        bestDayLabel: '-',
        worstDayLabel: '-',
      },
      weekLabels: [],
      contextMinTips: 5,
      tipperInsights: [],
      bestContextByTipper: [],
      topTicketWins: [],
      monthlyBettingStats: [],
      monthlyCashflowStats: [],
      weekdayPerformance: [],
      oddsRangePerformance: [],
      dailyIntensityPerformance: [],
      dailyIntensityPerformanceByWeekday: [],
      streakStats: {
        currentWin: 0,
        currentLoss: 0,
        maxWin: 0,
        maxLoss: 0,
      },
    }
  }
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>
}) {
  const params = (await searchParams) || {}

  const periodCandidate = String(params.period || 'all').toLowerCase()
  const period: PeriodKey = periodCandidate === '7d' || periodCandidate === '30d' || periodCandidate === '90d' || periodCandidate === 'ytd' || periodCandidate === 'all'
    ? periodCandidate
    : 'all'

  const minTips = 0

  const stats = await getStatistics(period, minTips)

  const periodOptions: Array<{ value: PeriodKey; label: string }> = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'ALL' },
  ]

  const metricItems = [
    {
      key: 'ticket-hit-rate',
      title: 'Ticket hit rate',
      tooltip: 'Percento vyhraných uzavretých tiketov (win / (win + loss)).',
      value: `${stats.overview.ticketHitRate.toFixed(1)}%`,
      subtitle: formatDelta(stats.deltas.ticketHitRate, ' p.b.'),
      icon: Target,
      tone: 'success',
    },
    {
      key: 'tip-hit-rate',
      title: 'Tip hit rate',
      tooltip: 'Percento správnych tipov zo všetkých uzavretých tipov (OK / (OK + NOK)).',
      value: `${stats.overview.tipHitRate.toFixed(1)}%`,
      subtitle: formatDelta(stats.deltas.tipHitRate, ' p.b.'),
      icon: Activity,
      tone: 'success',
    },
    {
      key: 'yield',
      title: 'Yield',
      tooltip: 'Profitabilita stávkovania v percentách: zisk / vklady.',
      value: `${stats.overview.yield >= 0 ? '+' : ''}${stats.overview.yield.toFixed(1)}%`,
      subtitle: formatDelta(stats.deltas.yield, ' p.b.'),
      icon: TrendingUp,
      tone: stats.overview.yield >= 0 ? 'success' : 'danger',
    },
    {
      key: 'period-profit',
      title: 'Zisk obdobia',
      tooltip: 'Súčet (payout - stake) za uzavreté tikety v zvolenom období.',
      value: `${stats.overview.totalProfit >= 0 ? '+' : ''}${stats.overview.totalProfit.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`,
      subtitle: formatDelta(stats.deltas.totalProfit, ' Kč'),
      icon: Wallet,
      tone: stats.overview.totalProfit >= 0 ? 'success' : 'danger',
    },
    {
      key: 'profit-factor',
      title: 'Profit factor',
      tooltip: 'Hrubé výhry delené hrubými prehrami. Hodnota nad 1 znamená ziskové výsledky.',
      value: Number.isFinite(stats.overview.profitFactor) ? stats.overview.profitFactor.toFixed(2) : '∞',
      subtitle: 'Hrubé výhry / hrubé prehry',
      icon: BarChart3,
      tone: stats.overview.profitFactor >= 1 ? 'success' : 'danger',
    },
    {
      key: 'max-drawdown',
      title: 'Max drawdown',
      tooltip: 'Najväčší pokles od lokálneho maxima kumulatívneho zisku v období.',
      value: `${stats.overview.maxDrawdown.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`,
      subtitle: 'Najväčší pokles od maxima',
      icon: TrendingUp,
      tone: 'danger',
    },
    {
      key: 'avg-stake',
      title: 'Priemerný vklad',
      tooltip: 'Priemerná výška vkladu na uzavretý tiket v zvolenom období.',
      value: `${stats.overview.avgStake.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`,
      subtitle: `${stats.overview.totalTickets} tiketov v období`,
      icon: DollarSign,
      tone: 'neutral',
    },
    {
      key: 'bankroll',
      title: 'Aktuálny bankroll',
      tooltip: 'All-time stav účtu podľa tiketov a transakcií (vklady/výbery).',
      value: `${stats.overview.closingBankroll.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`,
      subtitle: 'All-time podľa tiketov + vkladov/výberov',
      icon: Wallet,
      tone: stats.overview.closingBankroll >= 0 ? 'success' : 'danger',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-black tracking-tight">Štatistiky</h1>
          <p className="mt-1 text-slate-600 font-medium">Profesionálny analytický prehľad výkonnosti</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {stats.rangeLabel} • Posledná aktualizácia: {stats.asOf}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-card p-1">
            {periodOptions.map((option) => (
              <Link
                key={option.value}
                href={`/statistics?period=${option.value}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors ${
                  stats.period === option.value
                    ? 'bg-slate-900 text-white'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {stats.error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            <div>
              <p className="font-bold text-rose-700">Načítanie štatistík zlyhalo</p>
              <p className="text-sm text-rose-700/90">{stats.error}</p>
              <Link href={`/statistics?period=${stats.period}`} className="mt-2 inline-block text-xs font-black uppercase tracking-widest text-rose-700 underline">
                Skúsiť znova
              </Link>
            </div>
          </div>
        </div>
      )}

      <details className="rounded-2xl border border-border/70 bg-gradient-to-br from-amber-50/70 via-card to-orange-50/70 p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer list-none select-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-card-foreground sm:text-base">KPI prehľad</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Rozbaľovací súhrn metrík. Prejdi kurzorom na info ikonu pre vysvetlenie.</p>
            </div>
            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
              Rozbaliť/Zbaliť
            </span>
          </div>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.key}
                className={cn(
                  'rounded-xl border border-border/70 bg-white/75 p-3 shadow-sm backdrop-blur transition-all',
                  item.tone === 'success' && 'border-emerald-500/20 bg-emerald-50/45',
                  item.tone === 'danger' && 'border-rose-500/20 bg-rose-50/45',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{item.title}</p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          aria-label={`Vysvetlenie metriky ${item.title}`}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6} className="max-w-64">
                        {item.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div
                    className={cn(
                      'rounded-lg border p-2 shadow-sm',
                      item.tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
                      item.tone === 'danger' && 'border-rose-500/20 bg-rose-500/10 text-rose-700',
                      item.tone === 'neutral' && 'border-amber-500/20 bg-amber-500/10 text-amber-700',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xl font-black text-card-foreground">{item.value}</p>
                  <span
                    className={cn(
                      'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      item.tone === 'success' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700',
                      item.tone === 'danger' && 'border-rose-500/25 bg-rose-500/10 text-rose-700',
                      item.tone === 'neutral' && 'border-amber-500/25 bg-amber-500/10 text-amber-700',
                    )}
                  >
                    {item.tone === 'success' ? 'Silné' : item.tone === 'danger' ? 'Riziko' : 'Prehľad'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">{item.subtitle}</p>
              </div>
            )
          })}
        </div>
      </details>

      <StatisticsCharts
        tipperInsights={stats.tipperInsights}
        weekLabels={stats.weekLabels}
        contextMinTips={stats.contextMinTips}
        bestContextByTipper={stats.bestContextByTipper}
        topTicketWins={stats.topTicketWins}
        monthlyBettingStats={stats.monthlyBettingStats}
        monthlyCashflowStats={stats.monthlyCashflowStats}
        weekdayPerformance={stats.weekdayPerformance}
        oddsRangePerformance={stats.oddsRangePerformance}
        dailyIntensityPerformance={stats.dailyIntensityPerformance}
        dailyIntensityPerformanceByWeekday={stats.dailyIntensityPerformanceByWeekday}
        streakStats={stats.streakStats}
        quickStats={stats.quickStats}
        minTips={stats.minTips}
      />
    </div>
  )
}
