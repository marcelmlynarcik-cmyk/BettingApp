import { Sidebar } from '@/components/sidebar'
import { PushNotificationBanner } from '@/components/push-notification-banner'
import { RankingTicker } from '@/components/ranking-ticker'
import { createClient } from '@/lib/supabase/server'

type UserRecord = { id: string; name: string }
type TicketRecord = { id: string; stake: number | string | null }
type PredictionRecord = {
  user_id: string
  ticket_id: string | null
  result: string | null
  odds: number | string | null
  tip_date: string | null
}

type RankingTickerItem = {
  userId: string
  userName: string
  winRate: number
  averageOdds: number
  netProfit: number
  okTips: number
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

async function fetchAllRows<T>(getPage: (from: number, to: number) => unknown) {
  const pageSize = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data } = (await getPage(from, to)) as { data: T[] | null }
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }

  return all
}

async function getRankingTickerData(): Promise<RankingTickerItem[]> {
  try {
    const supabase = await createClient()
    const now = new Date()
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastDayDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`

    const [{ data: users }, tickets, predictions] = await Promise.all([
      supabase.from('users').select('id, name'),
      fetchAllRows<TicketRecord>((from, to) =>
        supabase.from('tickets').select('id, stake').range(from, to),
      ),
      fetchAllRows<PredictionRecord>((from, to) =>
        supabase
          .from('predictions')
          .select('user_id, ticket_id, result, odds, tip_date')
          .gte('tip_date', firstDay)
          .lte('tip_date', lastDay)
          .range(from, to),
      ),
    ])

    const safeUsers = (users || []) as UserRecord[]
    const safeTickets = tickets || []
    const safePredictions = predictions || []

    const ticketStakeById = new Map<string, number>(safeTickets.map((ticket) => [ticket.id, toNumber(ticket.stake)]))

    return safeUsers
      .map((user) => {
        const userPredictions = safePredictions.filter((prediction) => prediction.user_id === user.id)
        const wins = userPredictions.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
        const losses = userPredictions.filter((prediction) => normalizeResult(prediction.result) === 'NOK').length
        const completed = wins + losses

        const predictionCountByTicket = userPredictions.reduce((acc, prediction) => {
          if (!prediction.ticket_id) return acc
          acc[prediction.ticket_id] = (acc[prediction.ticket_id] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        let totalStake = 0
        let totalWins = 0
        for (const prediction of userPredictions) {
          const result = normalizeResult(prediction.result)
          if (result !== 'OK' && result !== 'NOK') continue

          const ticketStake = prediction.ticket_id ? ticketStakeById.get(prediction.ticket_id) || 0 : 0
          const legs = prediction.ticket_id ? predictionCountByTicket[prediction.ticket_id] || 0 : 0
          const stakeShare = legs > 0 ? ticketStake / legs : 0

          totalStake += stakeShare
          if (result === 'OK') totalWins += toNumber(prediction.odds) * stakeShare
        }

        const netProfit = totalWins - totalStake
        const yieldValue = totalStake > 0 ? (netProfit / totalStake) * 100 : 0
        const averageOdds = userPredictions.length > 0
          ? userPredictions.reduce((sum, prediction) => sum + toNumber(prediction.odds), 0) / userPredictions.length
          : 0
        const winRate = completed > 0 ? (wins / completed) * 100 : 0

        return {
          userId: user.id,
          userName: user.name,
          winRate,
          averageOdds,
          netProfit,
          okTips: wins,
          yield: yieldValue,
        }
      })
      .sort((a, b) => {
        if (b.okTips !== a.okTips) return b.okTips - a.okTips
        if (b.yield !== a.yield) return b.yield - a.yield
        return b.averageOdds - a.averageOdds
      })
      .map(({ userId, userName, winRate, averageOdds, netProfit, okTips }) => ({
        userId,
        userName,
        winRate,
        averageOdds,
        netProfit,
        okTips,
      }))
  } catch {
    return []
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const rankingTickerItems = await getRankingTickerData()

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_30%,#eef2ff_60%,#f8fafc_100%)]">
      <Sidebar />
      {/* Mobile: top header + bottom nav spacing */}
      {/* Desktop: left sidebar spacing */}
      <main className="min-h-screen pb-[64px] pt-14 md:ml-64 md:pb-0 md:pt-0">
        <RankingTicker items={rankingTickerItems} />
        <div className="p-4 md:p-6">
          <PushNotificationBanner />
          {children}
        </div>
      </main>
    </div>
  )
}
