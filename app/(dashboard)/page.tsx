import { createClient } from '@/lib/supabase/server'
import { TicketCard } from '@/components/TicketCard'
import { LeaderboardCard } from '@/components/LeaderboardCard'
import {
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import type { OverviewStats, UserStats, Ticket as TicketType } from '@/lib/types'

async function getDashboardData() {
  const supabase = await createClient()
  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const now = new Date()
  const todayKey = toDateKey(now)
  
  // Get all tickets for balance calculation (following user formula)
  const { data: allTickets } = await supabase
    .from('tickets')
    .select('*, predictions(*)')

  const { data: recentTicketsData } = await supabase
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
    .limit(5)

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

  // Get current month date range
  const firstDay = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastDay = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  // Get users
  const { data: users } = await supabase.from('users').select('*')
  
  // Get predictions for current month
  const { data: monthlyPredictions } = await supabase
    .from('predictions')
    .select('*')
    .gte('tip_date', firstDay)
    .lte('tip_date', lastDay)

  const allTicketsSafe = allTickets || []

  // Calculate Overview Stats using all tickets (same logic as statistics page)
  const stats: OverviewStats = allTicketsSafe.length > 0 ? {
    total_tickets: allTicketsSafe.length,
    total_stake: allTicketsSafe.reduce((sum, t) => sum + Number(t.stake), 0),
    total_payout: allTicketsSafe.reduce((sum, t) => sum + Number(t.payout), 0),
    total_profit: allTicketsSafe.reduce((sum, t) => sum + (Number(t.payout) - Number(t.stake)), 0),
    win_rate: (allTicketsSafe.filter(t => t.status === 'win').length / allTicketsSafe.filter(t => t.status !== 'pending').length || 0) * 100,
    pending_tickets: allTicketsSafe.filter(t => t.status === 'pending').length,
    winning_tickets: allTicketsSafe.filter(t => t.status === 'win').length,
    losing_tickets: allTicketsSafe.filter(t => t.status === 'loss').length,
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

  const pendingPotentialWins = allTicketsSafe
    .filter((t) => t.status === 'pending')
    .reduce((sum, t) => sum + Number(t.possible_win || 0), 0)

  const todayProfit = allTicketsSafe
    .filter((t) => t.date === todayKey && (t.status === 'win' || t.status === 'loss'))
    .reduce((sum, t) => sum + (Number(t.payout || 0) - Number(t.stake || 0)), 0)

  const openTickets = allTicketsSafe.filter((t) => t.status === 'pending').length
  const todayOrPendingTickets = allTicketsSafe.filter((t) => t.status === 'pending' || t.date === todayKey).length

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
    todayOrPendingTickets,
    recentTickets: (recentTicketsData as TicketType[]) || []
  }
}

export default async function OverviewPage() {
  const { stats, currentBankroll, monthlyLeaderboard, recentTickets, pendingPotentialWins, todayProfit, openTickets, todayOrPendingTickets } = await getDashboardData()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-black tracking-tight">Prehľad</h1>
        <p className="text-slate-600 font-medium">
          Vitaj späť! Tu je tvoja aktuálna stávková štatistika.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">KPI prehľad</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Aktuálny stav</p>
              <p className="mt-1 text-base font-black text-card-foreground">{Math.floor(currentBankroll).toLocaleString()} Kč</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tikety spolu</p>
              <p className="mt-1 text-base font-black text-card-foreground">{stats.total_tickets}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Úspešnosť</p>
              <p className="mt-1 text-base font-black text-emerald-700">{stats.win_rate.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vyhraté</p>
              <p className="mt-1 text-base font-black text-emerald-700">{stats.winning_tickets}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Prehraté</p>
              <p className="mt-1 text-base font-black text-rose-700">{stats.losing_tickets}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Čakajúce</p>
              <p className="mt-1 text-base font-black text-amber-700">{stats.pending_tickets}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Rýchly stav</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700/80">Pending možná výhra</p>
              <p className="mt-1 text-base font-black text-amber-700">{pendingPotentialWins.toFixed(0)} Kč</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dnešný profit</p>
              <p className={`mt-1 text-base font-black ${todayProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {todayProfit >= 0 ? '+' : ''}{todayProfit.toFixed(0)} Kč
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700/80">Otvorené tikety</p>
              <p className="mt-1 text-base font-black text-sky-700">{openTickets}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-black uppercase tracking-wider text-sm">Dnešné a nevyhodnotené tikety</h2>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                {todayOrPendingTickets}
              </span>
            </div>
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
              <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center">
                <p className="font-medium text-slate-500">Nemáš dnešné ani nevyhodnotené tikety</p>
                <Link
                  href="/tickets"
                  className="mt-4 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20"
                >
                  Pridať tiket
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              recentTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} expandable />
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
