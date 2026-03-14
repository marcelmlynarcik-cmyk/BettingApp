'use client'

import { TicketCard } from './TicketCard'
import type { Ticket, Prediction, User } from '@/lib/types'

interface TicketsTableProps {
  tickets: (Ticket & { predictions: (Prediction & { user: User })[] })[]
}

export function TicketsTable({ tickets }: TicketsTableProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center text-slate-500 font-medium">
        Zatiaľ žiadne tikety.
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  )
}
