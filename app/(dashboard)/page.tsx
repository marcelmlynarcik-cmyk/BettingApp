import { createClient } from '@/lib/supabase/server'
import { StatsCard } from '@/components/stats-card'
import { TicketCard } from '@/components/TicketCard'
import { LeaderboardCard } from '@/components/LeaderboardCard'
import {
  Ticket,
  Target,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import type { OverviewStats, UserStats, Ticket as TicketType } from '@/lib/types'

async function getDashboardData() {
  const supabase = await createClient()
  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  
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
  const firstDay = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastDay = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const todayKey = toDateKey(now)

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

  const pendingPotentialWins = (allTickets || [])
    .filter((t) => t.status === 'pending')
    .reduce((sum, t) => sum + Number(t.possible_win || 0), 0)

  const todayProfit = (allTickets || [])
    .filter((t) => t.date === todayKey && (t.status === 'win' || t.status === 'loss'))
    .reduce((sum, t) => sum + (Number(t.payout || 0) - Number(t.stake || 0)), 0)

  const openTickets = (allTickets || []).filter((t) => t.status === 'pending').length

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
    pendingPotentialWins,
    todayProfit,
    openTickets,
    recentTickets: (recentTickets as TicketType[]) || []
  }
}

export default async function OverviewPage() {
  const { stats, currentBankroll, monthlyLeaderboard, recentTickets, pendingPotentialWins, todayProfit, openTickets } = await getDashboardData()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-black tracking-tight">Prehľad</h1>
        <p className="text-slate-600 font-medium">
          Vitaj späť! Tu je tvoja aktuálna stávková štatistika.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700/80">Pending možná výhra</p>
          <p className="mt-1 text-2xl font-black text-amber-700">{pendingPotentialWins.toFixed(0)} Kč</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-card p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Dnešný profit</p>
          <p className={`mt-1 text-2xl font-black ${todayProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {todayProfit >= 0 ? '+' : ''}{todayProfit.toFixed(0)} Kč
          </p>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700/80">Otvorené tikety</p>
          <p className="mt-1 text-2xl font-black text-sky-700">{openTickets}</p>
        </div>
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
