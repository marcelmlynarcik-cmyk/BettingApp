import { createClient } from '@/lib/supabase/server'
import { StatsCard } from '@/components/stats-card'
import { TicketCard } from '@/components/TicketCard'
import { LeaderboardCard } from '@/components/LeaderboardCard'
import {
  Ticket,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import type { OverviewStats, UserStats, Ticket as TicketType } from '@/lib/types'

async function getDashboardData() {
  const supabase = await createClient()
  
  // Get all tickets for balance calculation (following user formula)
  const { data: allTickets } = await supabase
    .from('tickets')
    .select('*, predictions(*)')

  // Get only deposit/withdraw transactions (following user formula)
  const { data: cashflow } = await supabase
    .from('finance_transactions')
    .select('amount')
    .in('type', ['deposit', 'withdraw'])

  const totalPayouts = allTickets?.reduce((sum, t) => sum + Number(t.payout || 0), 0) || 0
  const totalStakes = allTickets?.reduce((sum, t) => sum + Number(t.stake || 0), 0) || 0
  const totalCashflow = cashflow?.reduce((sum, t) => sum + Number(t.amount || 0), 0) || 0

  // Formula: SUM(Payouts) + SUM(Deposits/Withdrawals) - SUM(Stakes)
  const currentBankroll = totalPayouts + totalCashflow - totalStakes

  // Filter for valid tickets (exactly 3 predictions) for other dashboard stats
  const validTickets = allTickets?.filter(t => t.predictions?.length === 3) || []
  
  // Get current month date range
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()

  // Get users
  const { data: users } = await supabase.from('users').select('*')
  
  // Get predictions for current month
  const { data: monthlyPredictions } = await supabase
    .from('predictions')
    .select('*')
    .gte('tip_date', firstDay)
    .lte('tip_date', lastDay)

  // Get recent valid tickets
  const recentTickets = [...validTickets]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  // Calculate Overview Stats using only valid tickets
  const stats: OverviewStats = validTickets.length > 0 ? {
    total_tickets: validTickets.length,
    total_stake: validTickets.reduce((sum, t) => sum + Number(t.stake), 0),
    total_payout: validTickets.reduce((sum, t) => sum + Number(t.payout), 0),
    total_profit: validTickets.reduce((sum, t) => sum + (Number(t.payout) - Number(t.stake)), 0),
    win_rate: (validTickets.filter(t => t.status === 'win').length / validTickets.filter(t => t.status !== 'pending').length || 0) * 100,
    pending_tickets: validTickets.filter(t => t.status === 'pending').length,
    winning_tickets: validTickets.filter(t => t.status === 'win').length,
    losing_tickets: validTickets.filter(t => t.status === 'loss').length,
  } : {
    total_tickets: 0,
    total_stake: 0,
    total_payout: 0,
    total_profit: 0,
    win_rate: 0,
    pending_tickets: 0,
    winning_tickets: 0,
    losing_tickets: 0,
  }

  // Calculate Monthly User Stats for Leaderboard
  const monthlyLeaderboard = users?.map((user) => {
    const userPreds = monthlyPredictions?.filter((p) => p.user_id === user.id) || []
    const wins = userPreds.filter((p) => p.result === 'OK').length
    const losses = userPreds.filter((p) => p.result === 'NOK').length
    const completed = wins + losses
    const win_rate = completed > 0 ? (wins / completed) * 100 : 0
    const total_profit = userPreds.reduce((sum, p) => sum + Number(p.profit || 0), 0)
    const average_odds = userPreds.length > 0 
      ? userPreds.reduce((sum, p) => sum + Number(p.odds), 0) / userPreds.length 
      : 0

    return {
      user_id: user.id,
      user_name: user.name,
      total_predictions: userPreds.length,
      wins,
      losses,
      pending: userPreds.filter((p) => p.result === 'Pending').length,
      win_rate,
      total_profit,
      average_odds
    }
  }) || []

  return {
    stats,
    currentBankroll,
    monthlyLeaderboard,
    recentTickets: (recentTickets as TicketType[]) || []
  }
}

export default async function OverviewPage() {
  const { stats, currentBankroll, monthlyLeaderboard, recentTickets } = await getDashboardData()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-black tracking-tight">Prehľad</h1>
        <p className="text-slate-600 font-medium">
          Vitaj späť! Tu je tvoja aktuálna stávková štatistika.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          title="Aktuálny stav"
          value={`${Math.floor(currentBankroll).toLocaleString()} Kč`}
          icon={Wallet}
          variant="default"
        />
        <StatsCard
          title="Tikety spolu"
          value={stats.total_tickets}
          subtitle={`${stats.pending_tickets} čakajúcich`}
          icon={Ticket}
        />
        <StatsCard
          title="Úspešnosť"
          value={`${stats.win_rate.toFixed(1)}%`}
          subtitle={`${stats.winning_tickets}V - ${stats.losing_tickets}P`}
          icon={Target}
          variant="success"
        />
        <StatsCard
          title="Celkový vklad"
          value={`${Math.floor(stats.total_stake).toLocaleString()} Kč`}
          icon={DollarSign}
        />
        <StatsCard
          title="Celkový zisk"
          value={`${stats.total_profit >= 0 ? '+' : ''}${Math.floor(stats.total_profit).toLocaleString()} Kč`}
          icon={stats.total_profit >= 0 ? TrendingUp : TrendingDown}
          variant={stats.total_profit >= 0 ? 'success' : 'destructive'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-black uppercase tracking-wider text-sm">Najnovšie tikety</h2>
            <Link 
              href="/tickets" 
              className="group flex items-center gap-1 text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              Všetky tikety
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid gap-3">
            {recentTickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500 font-medium">
                Zatiaľ žiadne tikety
              </div>
            ) : (
              recentTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <LeaderboardCard stats={monthlyLeaderboard} />
        </div>
      </div>
    </div>
  )
}
