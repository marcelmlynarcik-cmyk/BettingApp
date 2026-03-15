import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { StatsCard } from '@/components/stats-card'
import { StatisticsCharts } from './charts'
import {
  Activity,
  BarChart3,
  DollarSign,
  Percent,
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
  description: string | null
}

type PredictionRecord = {
  id: string
  user_id: string
  result: string | null
  odds: number | string | null
  tip_date: string | null
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
  tipperInsights: Array<{
    name: string
    wins: number
    losses: number
    total: number
    winRate: number
    avgOdds: number
    highestWonOdds: number
    totalCorrect: number
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
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
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

function formatDelta(value: number | null, suffix = '') {
  if (value === null || Number.isNaN(value)) return 'Bez porovnania'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}${suffix} vs predch. obdobie`
}

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw new Error(error.message)

    const rows = data || []
    all.push(...rows)

    if (rows.length < pageSize) break
    from += pageSize
  }

  return all
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

function buildMonthlyCashflowStats(transactions: FinanceTransactionRecord[]): MonthlyCashflowStat[] {
  if (transactions.length === 0) return []

  const byMonth: Record<string, Omit<MonthlyCashflowStat, 'monthKey' | 'monthLabel' | 'cumulativeCashflow'>> = {}

  for (const tx of transactions) {
    const key = getMonthKey(tx.date)
    const amount = toNumber(tx.amount)

    if (!byMonth[key]) {
      byMonth[key] = {
        deposits: 0,
        withdrawals: 0,
        bets: 0,
        payouts: 0,
        netCashflow: 0,
      }
    }

    if (tx.type === 'deposit') byMonth[key].deposits += Math.abs(amount)
    if (tx.type === 'withdraw') byMonth[key].withdrawals += Math.abs(amount)
    if (tx.type === 'bet') byMonth[key].bets += Math.abs(amount)
    if (tx.type === 'payout') byMonth[key].payouts += Math.abs(amount)

    byMonth[key].netCashflow += amount
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
    .reduce((sum, tx) => sum + toNumber(tx.amount), 0)
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

async function getStatistics(period: PeriodKey, minTips: number): Promise<StatisticsData> {
  try {
    const supabase = await createClient()

    const [tickets, predictions, users, financeTransactions] = await Promise.all([
      fetchAll<TicketRecord>(async (from, to) =>
        await supabase.from('tickets').select('id, status, date, stake, payout, combined_odds, description').order('date', { ascending: true }).range(from, to),
      ),
      fetchAll<PredictionRecord>(async (from, to) =>
        await supabase.from('predictions').select('id, user_id, result, odds, tip_date').order('tip_date', { ascending: true, nullsFirst: true }).range(from, to),
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

    const filteredTickets = tickets.filter((ticket) => inRange(ticket.date, start, end))
    const filteredPredictions = predictions.filter((prediction) => inRange(prediction.tip_date, start, end))
    const filteredFinanceTransactions = financeTransactions.filter((tx) => inRange(tx.date, start, end))

    const previousTickets = tickets.filter((ticket) => inRange(ticket.date, prevStart, prevEnd))
    const previousPredictions = predictions.filter((prediction) => inRange(prediction.tip_date, prevStart, prevEnd))

    const highestWonOddsByUser = new Map<string, number>()
    for (const prediction of filteredPredictions) {
      if (normalizeResult(prediction.result) !== 'OK') continue
      const current = highestWonOddsByUser.get(prediction.user_id) ?? 0
      const odds = toNumber(prediction.odds)
      if (odds > current) highestWonOddsByUser.set(prediction.user_id, odds)
    }

    const overview = computeOverview(filteredTickets, filteredPredictions, tickets, financeTransactions)
    const previousOverview = computeOverview(previousTickets, previousPredictions, tickets, financeTransactions)
    const deltas = period === 'all'
      ? { totalProfit: null, yield: null, ticketHitRate: null, tipHitRate: null }
      : computeDeltas(overview, previousOverview)

    const tipperInsights = users
      .map((user) => {
        const userPreds = filteredPredictions.filter((prediction) => prediction.user_id === user.id)
        const wins = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
        const losses = userPreds.filter((prediction) => normalizeResult(prediction.result) === 'NOK').length
        const completed = wins + losses
        const avgOdds = userPreds.length > 0 ? userPreds.reduce((sum, prediction) => sum + toNumber(prediction.odds), 0) / userPreds.length : 0

        return {
          name: user.name,
          wins,
          losses,
          total: userPreds.length,
          winRate: completed > 0 ? (wins / completed) * 100 : 0,
          avgOdds,
          highestWonOdds: highestWonOddsByUser.get(user.id) ?? 0,
          totalCorrect: wins,
        }
      })
      .filter((user) => user.total >= minTips)
      .sort((a, b) => b.winRate - a.winRate)

    const topTicketWins = filteredTickets
      .filter((ticket) => ticket.status === 'win')
      .map((ticket) => ({
        id: ticket.id,
        description: ticket.description || 'Výherný tiket',
        date: ticket.date || null,
        odds: toNumber(ticket.combined_odds),
        stake: toNumber(ticket.stake),
        payout: toNumber(ticket.payout),
        profit: toNumber(ticket.payout) - toNumber(ticket.stake),
      }))
      .sort((a, b) => b.profit - a.profit || b.odds - a.odds)
      .slice(0, 3)

    return {
      asOf: new Date().toLocaleString('sk-SK'),
      period,
      minTips,
      rangeLabel: formatPeriodLabel(period),
      overview,
      deltas,
      tipperInsights,
      topTicketWins,
      monthlyBettingStats: buildMonthlyBettingStats(filteredTickets),
      monthlyCashflowStats: buildMonthlyCashflowStats(filteredFinanceTransactions),
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
      tipperInsights: [],
      topTicketWins: [],
      monthlyBettingStats: [],
      monthlyCashflowStats: [],
    }
  }
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; minTips?: string }>
}) {
  const params = (await searchParams) || {}

  const periodCandidate = String(params.period || '30d').toLowerCase()
  const period: PeriodKey = periodCandidate === '7d' || periodCandidate === '30d' || periodCandidate === '90d' || periodCandidate === 'ytd' || periodCandidate === 'all'
    ? periodCandidate
    : '30d'

  const minTipsRaw = Number.parseInt(String(params.minTips || '20'), 10)
  const minTips = Number.isFinite(minTipsRaw) && minTipsRaw >= 0 ? minTipsRaw : 20

  const stats = await getStatistics(period, minTips)

  const periodOptions: Array<{ value: PeriodKey; label: string }> = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'ALL' },
  ]

  const minTipsOptions = [0, 10, 20, 30]

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
                href={`/statistics?period=${option.value}&minTips=${stats.minTips}`}
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

          <div className="flex rounded-xl border border-border bg-card p-1">
            {minTipsOptions.map((value) => (
              <Link
                key={value}
                href={`/statistics?period=${stats.period}&minTips=${value}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors ${
                  stats.minTips === value
                    ? 'bg-emerald-600 text-white'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                min {value}
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
              <Link href={`/statistics?period=${stats.period}&minTips=${stats.minTips}`} className="mt-2 inline-block text-xs font-black uppercase tracking-widest text-rose-700 underline">
                Skúsiť znova
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Ticket hit rate"
          value={`${stats.overview.ticketHitRate.toFixed(1)}%`}
          subtitle={formatDelta(stats.deltas.ticketHitRate, ' p.b.')}
          icon={Target}
          variant="success"
        />
        <StatsCard
          title="Tip hit rate"
          value={`${stats.overview.tipHitRate.toFixed(1)}%`}
          subtitle={formatDelta(stats.deltas.tipHitRate, ' p.b.')}
          icon={Activity}
          variant="success"
        />
        <StatsCard
          title="Yield"
          value={`${stats.overview.yield >= 0 ? '+' : ''}${stats.overview.yield.toFixed(1)}%`}
          subtitle={formatDelta(stats.deltas.yield, ' p.b.')}
          icon={Percent}
          variant={stats.overview.yield >= 0 ? 'success' : 'destructive'}
        />
        <StatsCard
          title="Zisk obdobia"
          value={`${stats.overview.totalProfit >= 0 ? '+' : ''}${stats.overview.totalProfit.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`}
          subtitle={formatDelta(stats.deltas.totalProfit, ' Kč')}
          icon={TrendingUp}
          variant={stats.overview.totalProfit >= 0 ? 'success' : 'destructive'}
        />
        <StatsCard
          title="Profit factor"
          value={Number.isFinite(stats.overview.profitFactor) ? stats.overview.profitFactor.toFixed(2) : '∞'}
          subtitle="Hrubé výhry / hrubé prehry"
          icon={BarChart3}
          variant={stats.overview.profitFactor >= 1 ? 'success' : 'destructive'}
        />
        <StatsCard
          title="Max drawdown"
          value={`${stats.overview.maxDrawdown.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`}
          subtitle="Najväčší pokles od maxima"
          icon={TrendingUp}
          variant="destructive"
        />
        <StatsCard
          title="Priemerný vklad"
          value={`${stats.overview.avgStake.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`}
          subtitle={`${stats.overview.totalTickets} tiketov v období`}
          icon={DollarSign}
        />
        <StatsCard
          title="Aktuálny bankroll"
          value={`${stats.overview.closingBankroll.toLocaleString('sk-SK', { maximumFractionDigits: 0 })} Kč`}
          subtitle="All-time podľa tiketov + vkladov/výberov"
          icon={Wallet}
          variant={stats.overview.closingBankroll >= 0 ? 'success' : 'destructive'}
        />
      </div>

      <StatisticsCharts
        tipperInsights={stats.tipperInsights}
        topTicketWins={stats.topTicketWins}
        monthlyBettingStats={stats.monthlyBettingStats}
        monthlyCashflowStats={stats.monthlyCashflowStats}
        minTips={stats.minTips}
      />
    </div>
  )
}
