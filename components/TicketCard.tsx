'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Ticket } from '@/lib/types'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

interface TicketCardProps {
  ticket: Ticket
}

export function TicketCard({ ticket }: TicketCardProps) {
  const router = useRouter()

  const getStatusIcon = (status: Ticket['status']) => {
    switch (status) {
      case 'win':
        return <CheckCircle2 className="h-5 w-5 text-primary" />
      case 'loss':
        return <XCircle className="h-5 w-5 text-destructive" />
      case 'pending':
        return <Clock className="h-5 w-5 text-accent" />
    }
  }

  const getStatusLabel = (status: Ticket['status']) => {
    switch (status) {
      case 'win':
        return 'Výhra'
      case 'loss':
        return 'Prehra'
      case 'pending':
        return 'Čaká sa'
    }
  }

  return (
    <div
      onClick={() => router.push(`/tickets/${ticket.id}`)}
      className="group flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 shadow-md transition-all hover:bg-secondary active:scale-[0.98]"
    >
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-secondary p-2 group-hover:bg-muted">
          {getStatusIcon(ticket.status)}
        </div>
        <div>
          <p className="font-semibold text-card-foreground">
            {ticket.description || `Tiket ${format(new Date(ticket.date), 'd.M.')}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(ticket.date), 'd. MMMM yyyy')} • Kurz: {ticket.combined_odds?.toFixed(2) || 'N/A'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={cn(
            'text-lg font-bold',
            ticket.status === 'win' && 'text-primary',
            ticket.status === 'loss' && 'text-destructive',
            ticket.status === 'pending' && 'text-amber-500'
          )}
        >
          {ticket.status === 'win' ? '+' : ticket.status === 'loss' ? '-' : ''}
          {ticket.status === 'win' ? ticket.payout.toFixed(0) : ticket.stake.toFixed(0)} Kč
        </p>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {getStatusLabel(ticket.status)}
        </p>
      </div>
    </div>
  )
}
