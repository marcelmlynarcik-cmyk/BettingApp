import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Ticket } from '@/lib/types'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

interface RecentTicketsProps {
  tickets: Ticket[]
}

export function RecentTickets({ tickets }: RecentTicketsProps) {
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
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-card-foreground">Najnovšie tikety</h3>
      </div>
      <div className="divide-y divide-border">
        {tickets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Zatiaľ žiadne tikety. Pridaj svoju prvú stávku!
          </div>
        ) : (
          tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-4">
                {getStatusIcon(ticket.status)}
                <div>
                  <p className="font-medium text-card-foreground">
                    {ticket.description || `Tiket ${format(new Date(ticket.date), 'd.M.')}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(ticket.date), 'd. MMMM yyyy')} - Kurz: {ticket.combined_odds?.toFixed(2) || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    'font-semibold',
                    ticket.status === 'win' && 'text-primary',
                    ticket.status === 'loss' && 'text-destructive',
                    ticket.status === 'pending' && 'text-accent'
                  )}
                >
                  {ticket.status === 'win' ? '+' : ticket.status === 'loss' ? '-' : ''}
                  {ticket.status === 'win' ? ticket.payout.toFixed(0) : ticket.stake.toFixed(0)} Kč
                </p>
                <p className="text-sm text-muted-foreground">
                  {getStatusLabel(ticket.status)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
