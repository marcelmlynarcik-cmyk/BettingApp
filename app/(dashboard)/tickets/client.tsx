'use client'

import { useState } from 'react'
import { TicketCard } from '@/components/TicketCard'
import { AddTicketForm } from '@/components/add-ticket-form'
import type { Ticket, Prediction, User, Sport, League } from '@/lib/types'
import { SportsLeaguesManager } from '@/components/sports-leagues-manager'
import { Plus } from 'lucide-react'

interface TicketsPageClientProps {
  tickets: (Ticket & { predictions: (Prediction & { user?: User; sport?: Sport; league?: League })[] })[]
  users: User[]
  sports: Sport[]
  leagues: League[]
}

export function TicketsPageClient({
  tickets,
  users,
  sports,
  leagues,
}: TicketsPageClientProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  const filteredTickets = tickets.filter((ticket) => {
    if (statusFilter === 'all') return true
    return ticket.status === statusFilter
  })

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedTickets = filteredTickets.slice(pageStart, pageStart + PAGE_SIZE)

  const stats = {
    total: tickets.length,
    pending: tickets.filter((t) => t.status === 'pending').length,
    won: tickets.filter((t) => t.status === 'win').length,
    lost: tickets.filter((t) => t.status === 'loss').length,
  }

  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const pendingPotentialWins = tickets
    .filter((t) => t.status === 'pending')
    .reduce((sum, t) => sum + Number(t.possible_win || 0), 0)

  const todayProfit = tickets
    .filter((t) => t.date === todayKey && (t.status === 'win' || t.status === 'loss'))
    .reduce((sum, t) => sum + (Number(t.payout || 0) - Number(t.stake || 0)), 0)

  const openTickets = stats.pending

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-black tracking-tight">Moje tikety</h1>
          <p className="mt-1 text-slate-600 font-medium">
            Prehľad a správa tvojich stávok
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SportsLeaguesManager sports={sports} leagues={leagues} />
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-emerald-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all hover:bg-emerald-400"
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Pridať tiket</span>
          </button>
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

      {/* Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <button
          onClick={() => {
            setStatusFilter('all')
            setPage(1)
          }}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'all'
              ? 'bg-slate-800 text-white border border-slate-700 shadow-lg'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Všetky ({stats.total})
        </button>
        <button
          onClick={() => {
            setStatusFilter('pending')
            setPage(1)
          }}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'pending'
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Čakajúce ({stats.pending})
        </button>
        <button
          onClick={() => {
            setStatusFilter('win')
            setPage(1)
          }}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'win'
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-lg shadow-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Výherné ({stats.won})
        </button>
        <button
          onClick={() => {
            setStatusFilter('loss')
            setPage(1)
          }}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'loss'
              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-lg shadow-rose-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Prehraté ({stats.lost})
        </button>
      </div>

      <div className="grid gap-3">
        {filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center text-slate-500 font-medium">
            V tejto kategórii zatiaľ nemáš žiadne tikety.
          </div>
        ) : (
          paginatedTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              expandable
              showRelativeDate
            />
          ))
        )}
      </div>

      {filteredTickets.length > PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Strana {currentPage} z {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-card-foreground disabled:opacity-40"
            >
              Predchádzajúca
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-card-foreground disabled:opacity-40"
            >
              Ďalšia
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <AddTicketForm
          users={users}
          sports={sports}
          leagues={leagues}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
