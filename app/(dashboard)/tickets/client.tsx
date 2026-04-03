'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TicketCard } from '@/components/TicketCard'
import { AddTicketForm } from '@/components/add-ticket-form'
import type { Ticket, Prediction, User, Sport, League } from '@/lib/types'
import { SportsLeaguesManager } from '@/components/sports-leagues-manager'
import { ArrowRight, Flame, Plus, Sparkles } from 'lucide-react'

interface TicketsPageClientProps {
  tickets: (Ticket & { predictions: (Prediction & { user?: User; sport?: Sport; league?: League })[] })[]
  users: User[]
  sports: Sport[]
  leagues: League[]
  currentBankroll: number
}

export function TicketsPageClient({
  tickets,
  users,
  sports,
  leagues,
  currentBankroll,
}: TicketsPageClientProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const listTopRef = useRef<HTMLDivElement>(null)
  const hasMountedRef = useRef(false)
  const PAGE_SIZE = 10

  const filteredTickets = useMemo(() => {
    const filtered = tickets.filter((ticket) => {
      if (statusFilter === 'all') return true
      return ticket.status === statusFilter
    })

    return filtered.sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
      if (dateDiff !== 0) return dateDiff

      const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (createdDiff !== 0) return createdDiff

      return b.id.localeCompare(a.id)
    })
  }, [tickets, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginatedTickets = filteredTickets.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [currentPage, statusFilter])

  const stats = {
    total: tickets.length,
    pending: tickets.filter((t) => t.status === 'pending').length,
    won: tickets.filter((t) => t.status === 'win').length,
    lost: tickets.filter((t) => t.status === 'loss').length,
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-6">
      <div className="pointer-events-none absolute inset-x-6 top-6 -z-10 h-56 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-72 -z-10 h-64 w-64 rounded-full bg-orange-300/15 blur-3xl" />

      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-amber-50/80 via-card to-orange-50/70 p-5 text-card-foreground shadow-sm md:p-6">
        <div className="absolute -right-12 -top-10 h-40 w-40 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-36 w-36 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              <Sparkles className="h-3.5 w-3.5" />
              Správa tiketov
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">Tikety</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted-foreground">
              Tu máš všetky otvorené, dnešné aj uzavreté tikety na jednom mieste. Stačí si vybrať filter a pokračovať tam,
              kde potrebuješ.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[24px] border border-border/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Rýchle akcie</p>
                <span className="text-xs font-semibold text-muted-foreground/80">filtrovanie a pridanie</span>
              </div>
              <div className="mt-4 grid gap-2">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center justify-between rounded-2xl border border-emerald-300/30 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Pridať nový tiket
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setStatusFilter('pending')
                    setPage(1)
                  }}
                  className="inline-flex items-center justify-between rounded-2xl border border-amber-300/30 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm transition-transform hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-2">
                    <Flame className="h-4 w-4" />
                    Len otvorené tikety
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-border/70 bg-white/75 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Správa súťaží</p>
                <span className="text-xs font-semibold text-muted-foreground/80">športy a ligy</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Uprav si zoznam športov a líg bez odchodu zo stránky.
              </p>
              <div className="mt-4">
                <SportsLeaguesManager sports={sports} leagues={leagues} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-[24px] border border-border/70 bg-gradient-to-br from-amber-50/80 via-card to-orange-50/70 p-3 shadow-sm">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => {
            setStatusFilter('all')
            setPage(1)
          }}
          className={`shrink-0 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            statusFilter === 'all'
              ? 'border border-border/70 bg-white/85 text-card-foreground shadow-sm'
              : 'text-muted-foreground hover:text-card-foreground'
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
              ? 'border border-amber-400/20 bg-amber-100/80 text-amber-700 shadow-sm'
              : 'text-muted-foreground hover:text-card-foreground'
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
              ? 'border border-emerald-400/20 bg-emerald-100/80 text-emerald-700 shadow-sm'
              : 'text-muted-foreground hover:text-card-foreground'
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
              ? 'border border-rose-400/20 bg-rose-100/80 text-rose-700 shadow-sm'
              : 'text-muted-foreground hover:text-card-foreground'
          }`}
        >
          Prehraté ({stats.lost})
        </button>
      </div>
      </div>

      <div ref={listTopRef} className="grid gap-3">
        {filteredTickets.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-border/70 bg-white/70 p-12 text-center font-medium text-muted-foreground shadow-sm backdrop-blur">
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
        <div className="flex items-center justify-between rounded-[22px] border border-border/70 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
          <p className="text-xs font-medium text-muted-foreground">
            Strana {currentPage} z {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-xl border border-border/70 bg-white/85 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-card-foreground disabled:opacity-40"
            >
              Predchádzajúca
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-xl border border-border/70 bg-white/85 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-card-foreground disabled:opacity-40"
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
          currentBankroll={currentBankroll}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}
