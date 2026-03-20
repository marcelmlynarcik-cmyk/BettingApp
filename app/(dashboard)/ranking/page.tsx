import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import {
  Trophy,
  Medal,
  Info,
  Star,
} from 'lucide-react'

type UserRecord = { id: string; name: string }
type TicketRecord = { id: string; stake: number; date: string }
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

function formatCurrency(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)} Kč`
}

function formatYield(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`
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
      supabase.from('tickets').select('id, stake, date').order('date', { ascending: true }).range(from, to),
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

  return {
    userYieldStats: userYieldStats.sort((a, b) => b.yield - a.yield),
    monthlyPerformanceHall: Object.values(monthlyWinners).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    top10Odds,
    monthlyOddsHall: Object.values(monthlyOddsWinners).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
  }
}

export default async function RankingPage() {
  const { userYieldStats, monthlyPerformanceHall, top10Odds, monthlyOddsHall } = await getRankingData()

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Rebríček</h1>
        <p className="mt-1 text-sm font-medium text-slate-600 md:text-base">
          Analytický pohľad na výkon, rekordy a historické úspechy tipérov
        </p>
      </div>

      <section className="space-y-3.5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-card-foreground md:text-xl">Výkonnosť tipérov (Yield)</h2>
          <p className="text-xs text-muted-foreground md:text-sm">Yield je hlavná metrika výkonu každého tipéra</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {userYieldStats.map((user, index) => (
            <article
              key={user.userId}
              className={cn(
                'relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:p-5',
                index === 0 && 'ring-1 ring-emerald-500/30',
              )}
            >
              <div className={cn(
                'absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r',
                user.yield >= 0 ? 'from-emerald-400/80 to-emerald-600/80' : 'from-rose-400/80 to-rose-600/80',
              )} />

              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {index === 0 ? (
                    <Trophy className="h-5 w-5 text-amber-500" />
                  ) : index === 1 ? (
                    <Medal className="h-5 w-5 text-slate-400" />
                  ) : index === 2 ? (
                    <Medal className="h-5 w-5 text-orange-600" />
                  ) : (
                    <Medal className="h-5 w-5 text-slate-400" />
                  )}
                  <p className="text-base font-semibold tracking-tight text-card-foreground">{user.userName}</p>
                </div>
                <div className={cn(
                  'rounded-lg px-2.5 py-1',
                  user.yield >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10',
                )}>
                  <p className={cn('text-xl font-black tracking-tight', user.yield >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {formatYield(user.yield)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
                  <p className="text-xs text-muted-foreground">OK tipy</p>
                  <p className="font-semibold text-card-foreground">{user.okTips}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Ø kurz</p>
                  <p className="font-semibold text-card-foreground">{user.avgOdds.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Čistý zisk</p>
                  <p className={cn('font-semibold', user.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {formatCurrency(user.netProfit)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-sky-500" />
              <h3 className="text-base font-semibold text-card-foreground">Čo je Yield?</h3>
            </div>
            <span className="text-xs font-medium text-muted-foreground group-open:hidden">Rozbaliť</span>
            <span className="hidden text-xs font-medium text-muted-foreground group-open:inline">Skryť</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>Yield je najdôležitejšia metrika, ktorá ukazuje, aký je tipér dlhodobo ziskový.</p>
            <p>Vyjadruje priemerný čistý zisk v percentách na každú vsadenú korunu.</p>
            <p>
              Je to najspravodlivejší ukazovateľ, pretože hodnotí úspešnosť každého jednotlivého tipu,
              bez ohľadu na výsledok spoločného tiketu.
            </p>
            <p>
              <span className="font-medium text-card-foreground">Príklad:</span> Yield +8 % znamená,
              že každá vsadená stovka vám z dlhodobého hľadiska vráti približne 108 Kč.
            </p>
            <p className="font-medium text-card-foreground">Výpočet:</p>
            <p>1. Celkový vklad: sčítajú sa všetky vklady priradené k jednotlivým tipom.</p>
            <p>2. Celkové výhry: sčítajú sa výhry z úspešných tipov (kurz × vklad na tip).</p>
            <p>3. Čistý zisk: celkové výhry − celkový vklad.</p>
            <p>4. Yield: (čistý zisk / celkový vklad) × 100.</p>
          </div>
        </details>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-card-foreground">Sieň slávy</h3>
            <p className="text-xs text-muted-foreground">Mesiac - OK tipy, potom yield</p>
          </div>
          <div className="space-y-2">
            {monthlyPerformanceHall.map((row) => (
              <div
                key={row.monthKey}
                className="rounded-xl border border-border/70 bg-card/70 px-3 py-3 shadow-sm transition-colors hover:bg-muted/35"
              >
                <div className="mb-1.5 flex items-start justify-between">
                  <p className="text-sm font-semibold tracking-tight text-card-foreground">{row.monthLabel}</p>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/12 text-sm">🥇</span>
                </div>
                <p className="text-base font-semibold text-card-foreground">{row.userName}</p>
                <div className="mt-1.5 inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <span>OK tipy: <span className="font-semibold text-card-foreground">{row.okTips}</span></span>
                  <span className="text-border">•</span>
                  <span>Yield: <span className={cn('font-semibold', row.yield >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatYield(row.yield)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-card-foreground">Sieň slávy (Kurz)</h3>
            <p className="text-xs text-muted-foreground">Rekord mesiaca</p>
          </div>
          <div className="space-y-2">
            {monthlyOddsHall.map((row) => (
              <div
                key={row.monthKey}
                className="rounded-xl border border-border/70 bg-card/70 px-3 py-3 shadow-sm transition-colors hover:bg-muted/35"
              >
                <div className="mb-1.5 flex items-start justify-between">
                  <p className="text-sm font-semibold tracking-tight text-card-foreground">{row.monthLabel}</p>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/12 text-sm">🥇</span>
                </div>
                <p className="text-base font-semibold text-card-foreground">{row.userName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{row.context}</p>
                <div className="mt-2 inline-flex items-center rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Najvyšší kurz: {row.odds.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-card-foreground">Top 10 kurzov</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5" />
            historicky najvyššie trafené kurzy
          </div>
        </div>

        <div className="space-y-2">
          {top10Odds.map((item) => (
            <div
              key={`${item.rank}-${item.userName}-${item.dateLabel}-${item.odds}`}
              className={cn(
                'grid grid-cols-[2rem,minmax(0,1fr),4.5rem] items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2.5 shadow-sm transition-colors hover:bg-muted/35',
                item.rank <= 3 && 'border-amber-500/25 bg-amber-500/[0.06]',
              )}
            >
              <p className={cn(
                'text-sm font-semibold tabular-nums text-muted-foreground',
                item.rank <= 3 && 'text-amber-700 dark:text-amber-400',
              )}>
                {item.rank}.
              </p>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-card-foreground">{item.userName}</p>
                <p className="truncate text-xs text-muted-foreground">{item.dateLabel} | {item.context}</p>
              </div>
              <div className="justify-self-end rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1">
                <p className="text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400">{item.odds.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
