import { createClient } from '@/lib/supabase/server'
import { StatsCard } from '@/components/stats-card'
import { StatisticsCharts } from './charts'
import {
  Target,
  TrendingUp,
  Users,
  BarChart3,
  Percent,
  DollarSign,
} from 'lucide-react'

type MonthlyAccountStat = {
  monthKey: string
  monthLabel: string
  deposits: number
  wins: number
  losses: number
  monthlyResult: number
  cumulativeResult: number
}

function normalizeResult(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function parseOdds(value: unknown) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
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

function sumByMonth<T>(items: T[], getDate: (item: T) => string | null | undefined, getAmount: (item: T) => number) {
  const map: Record<string, number> = {}
  for (const item of items) {
    const dateValue = getDate(item)
    if (!dateValue) continue
    const key = getMonthKey(dateValue)
    map[key] = (map[key] || 0) + getAmount(item)
  }
  return map
}

function buildMonthlyAccountStats(tickets: any[], financeTransactions: any[]): MonthlyAccountStat[] {
  const resolvedTickets = tickets.filter((t) => t.status === 'win' || t.status === 'loss')

  const depositsByMonth = sumByMonth(
    financeTransactions.filter((tx) => tx.type === 'deposit'),
    (tx) => tx.date,
    (tx) => Math.abs(Number(tx.amount || 0)),
  )

  const winsByMonth = sumByMonth(
    resolvedTickets.filter((t) => t.status === 'win'),
    (t) => t.date,
    (t) => Number(t.payout || 0) - Number(t.stake || 0),
  )

  const lossesByMonth = sumByMonth(
    resolvedTickets.filter((t) => t.status === 'loss'),
    (t) => t.date,
    (t) => Math.abs(Number(t.stake || 0)),
  )

  const allMonthKeys = [
    ...new Set([
      ...Object.keys(depositsByMonth),
      ...Object.keys(winsByMonth),
      ...Object.keys(lossesByMonth),
    ]),
  ].sort()

  if (allMonthKeys.length === 0) {
    return []
  }

  const monthRange = generateMonthRange(allMonthKeys[0], allMonthKeys[allMonthKeys.length - 1])
  let runningResult = 0

  return monthRange.map((monthKey) => {
    const deposits = depositsByMonth[monthKey] || 0
    const wins = winsByMonth[monthKey] || 0
    const losses = lossesByMonth[monthKey] || 0
    const monthlyResult = wins - losses
    runningResult += monthlyResult

    return {
      monthKey,
      monthLabel: getMonthLabel(monthKey),
      deposits,
      wins,
      losses,
      monthlyResult,
      cumulativeResult: runningResult,
    }
  })
}

async function getStatistics() {
  const supabase = await createClient()

  const [
    { data: tickets },
    { data: predictions },
    { data: users },
    { data: financeTransactions },
  ] = await Promise.all([
    supabase.from('tickets').select('*').range(0, 9999),
    supabase.from('predictions').select('*, user:users(name), sport:sports(name), ticket:tickets(date, description)').range(0, 9999),
    supabase.from('users').select('*'),
    supabase.from('finance_transactions').select('*').order('date', { ascending: true }).range(0, 9999),
  ])

  // Calculate overall stats
  const totalTickets = tickets?.length || 0
  const wonTickets = tickets?.filter((t) => t.status === 'win').length || 0
  const lostTickets = tickets?.filter((t) => t.status === 'loss').length || 0
  const completedTickets = wonTickets + lostTickets
  const winRate = completedTickets > 0 ? (wonTickets / completedTickets) * 100 : 0

  const totalStake = tickets?.reduce((sum, t) => sum + Number(t.stake), 0) || 0
  const totalPayout = tickets?.reduce((sum, t) => sum + Number(t.payout), 0) || 0
  const totalProfit = totalPayout - totalStake
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0

  // Calculate average odds from individual predictions (more accurate for performance tracking)
  const avgOdds =
    predictions && predictions.length > 0
      ? predictions.reduce((sum, p) => sum + Number(p.odds || 0), 0) / predictions.length
      : 0

  // Fetch exact top won odds per user directly from DB to avoid pagination truncation artifacts
  const highestWonOddsByUser = new Map<string, number>()
  if (users && users.length > 0) {
    await Promise.all(
      users.map(async (user) => {
        const { data } = await supabase
          .from('predictions')
          .select('odds')
          .eq('user_id', user.id)
          .eq('result', 'OK')
          .order('odds', { ascending: false })
          .limit(1)

        highestWonOddsByUser.set(user.id, parseOdds(data?.[0]?.odds))
      }),
    )
  }

  // Stats by user
  const tipperInsights = users?.map((user) => {
    const userPreds = predictions?.filter((p) => p.user_id === user.id) || []
    const wins = userPreds.filter((p) => normalizeResult(p.result) === 'OK').length
    const losses = userPreds.filter((p) => normalizeResult(p.result) === 'NOK').length
    const completed = wins + losses
    const rate = completed > 0 ? (wins / completed) * 100 : 0
    const avgUserOdds =
      userPreds.length > 0
        ? userPreds.reduce((sum, p) => sum + parseOdds(p.odds), 0) / userPreds.length
        : 0
    const highestWonOdds = highestWonOddsByUser.get(user.id) ?? 0

    return {
      name: user.name,
      wins,
      losses,
      total: userPreds.length,
      winRate: rate,
      avgOdds: avgUserOdds,
      highestWonOdds,
      totalCorrect: wins,
    }
  }).sort((a, b) => b.winRate - a.winRate) || []

  const topTicketWins = (tickets || [])
    .filter((t) => t.status === 'win')
    .map((t) => ({
      id: t.id,
      description: t.description || 'Výherný tiket',
      date: t.date || null,
      odds: Number(t.combined_odds || 0),
      stake: Number(t.stake || 0),
      payout: Number(t.payout || 0),
      profit: Number(t.payout || 0) - Number(t.stake || 0),
    }))
    .sort((a, b) => b.profit - a.profit || b.odds - a.odds)
    .slice(0, 3)

  const monthlyAccountStats = buildMonthlyAccountStats(tickets || [], financeTransactions || [])

  return {
    overview: {
      totalTickets,
      winRate,
      avgOdds,
      totalProfit,
      roi,
      totalStake,
    },
    tipperInsights,
    topTicketWins,
    monthlyAccountStats,
  }
}

export default async function StatisticsPage() {
  const stats = await getStatistics()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-black tracking-tight">Štatistiky</h1>
        <p className="mt-1 text-slate-600 font-medium">
          Podrobná analýza a výkonnostné metriky
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Úspešnosť"
          value={`${stats.overview.winRate.toFixed(1)}%`}
          icon={Target}
          variant="success"
        />
        <StatsCard
          title="ROI"
          value={`${stats.overview.roi >= 0 ? '+' : ''}${stats.overview.roi.toFixed(1)}%`}
          icon={Percent}
          variant={stats.overview.roi >= 0 ? 'success' : 'destructive'}
        />
        <StatsCard
          title="Priemerný kurz"
          value={stats.overview.avgOdds.toFixed(2)}
          icon={BarChart3}
        />
        <StatsCard
          title="Celkový vklad"
          value={`${stats.overview.totalStake.toFixed(0)} Kč`}
          icon={DollarSign}
        />
        <StatsCard
          title="Celkový zisk"
          value={`${stats.overview.totalProfit >= 0 ? '+' : ''}${stats.overview.totalProfit.toFixed(0)} Kč`}
          icon={TrendingUp}
          variant={stats.overview.totalProfit >= 0 ? 'success' : 'destructive'}
        />
        <StatsCard
          title="Tikety spolu"
          value={stats.overview.totalTickets}
          icon={Users}
        />
      </div>

      <StatisticsCharts
        tipperInsights={stats.tipperInsights}
        topTicketWins={stats.topTicketWins}
        monthlyAccountStats={stats.monthlyAccountStats}
      />
    </div>
  )
}
