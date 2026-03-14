'use client'

import { useState } from 'react'
import { TicketCard } from '@/components/TicketCard'
import { AddTicketForm } from '@/components/add-ticket-form'
import type { Ticket, Prediction, User, Sport, League } from '@/lib/types'
import { Plus } from 'lucide-react'

interface TicketsPageClientProps {
  tickets: (Ticket & { predictions: (Prediction & { user: User })[] })[]
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

  const filteredTickets = tickets.filter((ticket) => {
    if (statusFilter === 'all') return true
    return ticket.status === statusFilter
  })

  const stats = {
    total: tickets.length,
    pending: tickets.filter((t) => t.status === 'pending').length,
    won: tickets.filter((t) => t.status === 'win').length,
    lost: tickets.filter((t) => t.status === 'loss').length,
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-black tracking-tight">Moje tikety</h1>
          <p className="mt-1 text-slate-600 font-medium">
            Prehľad a správa tvojich stávok
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-emerald-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all hover:bg-emerald-400"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Pridať tiket</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <button
          onClick={() => setStatusFilter('all')}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'all'
              ? 'bg-slate-800 text-white border border-slate-700 shadow-lg'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Všetky ({stats.total})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'pending'
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-lg shadow-amber-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Čakajúce ({stats.pending})
        </button>
        <button
          onClick={() => setStatusFilter('win')}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'win'
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-lg shadow-emerald-500/5'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Výherné ({stats.won})
        </button>
        <button
          onClick={() => setStatusFilter('loss')}
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
          filteredTickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))
        )}
      </div>

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
