'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Ticket } from '@/lib/types'
import { CheckCircle2, ChevronDown, ChevronUp, Clock, ExternalLink, XCircle } from 'lucide-react'

interface TicketCardProps {
  ticket: Ticket
  expandable?: boolean
  showRelativeDate?: boolean
}

function relativeDateLabel(dateValue: string) {
  const target = new Date(dateValue)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86400000)

  if (dayDiff === 0) return 'dnes'
  if (dayDiff === 1) return 'včera'
  if (dayDiff > 1) return `pred ${dayDiff} dňami`
  return `o ${Math.abs(dayDiff)} dní`
}

export function TicketCard({ ticket, expandable = false, showRelativeDate = false }: TicketCardProps) {
  const router = useRouter()
  const pendingAmount = Number(ticket.possible_win || 0)
  const [isExpanded, setIsExpanded] = useState(false)
  const predictions = ticket.predictions || []
  const predictionSegments = Array.from({ length: 3 }, (_, index) => predictions[index]?.result || 'Pending')

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

  const getSegmentClassName = (result: 'OK' | 'NOK' | 'Pending') => {
    switch (result) {
      case 'OK':
        return 'border-emerald-500/30 bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.45)]'
      case 'NOK':
        return 'border-rose-500/30 bg-gradient-to-r from-rose-400 to-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
      case 'Pending':
        return 'border-amber-500/30 bg-gradient-to-r from-amber-400 to-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.45)]'
    }
  }

  return (
    <div
      className="group rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:bg-secondary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-secondary p-1.5 group-hover:bg-muted">
            {getStatusIcon(ticket.status)}
          </div>
          <div>
            <p className="text-sm font-semibold text-card-foreground">
              {ticket.description || `Tiket ${format(new Date(ticket.date), 'd.M.')}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(ticket.date), 'd. MMMM yyyy')}
              {showRelativeDate && <span> ({relativeDateLabel(ticket.date)})</span>}
              {' • '}
              Kurz: {ticket.combined_odds?.toFixed(2) || 'N/A'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p
            className={cn(
              'text-base font-bold',
              ticket.status === 'win' && 'text-primary',
              ticket.status === 'loss' && 'text-destructive',
              ticket.status === 'pending' && 'text-amber-500'
            )}
          >
            {ticket.status === 'win' ? '+' : ticket.status === 'loss' ? '-' : ''}
            {ticket.status === 'win'
              ? ticket.payout.toFixed(0)
              : ticket.status === 'pending'
                ? (pendingAmount > 0 ? pendingAmount : ticket.stake).toFixed(0)
                : ticket.stake.toFixed(0)} Kč
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {ticket.status === 'pending' ? 'Možná výhra' : getStatusLabel(ticket.status)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Stav tipov</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
          {predictionSegments.map((result, index) => (
            <div
              key={`${ticket.id}-segment-${index}`}
              className={cn('h-2 rounded-md border transition-all duration-300', getSegmentClassName(result))}
            />
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        {expandable && predictions.length > 0 ? (
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:bg-secondary"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? 'Skryť tipy' : `Zobraziť tipy (${predictions.length})`}
          </button>
        ) : (
          <span />
        )}

        <button
          onClick={() => router.push(`/tickets/${ticket.id}`)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 hover:bg-emerald-500/20"
        >
          Detail
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {expandable && isExpanded && predictions.length > 0 && (
        <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
          {predictions.map((prediction) => {
            const userName =
              typeof prediction.user === 'object' && prediction.user && 'name' in prediction.user
                ? prediction.user.name
                : 'Tipér'

            return (
              <div
                key={prediction.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-2.5 py-1.5"
              >
                <div>
                  <p className="text-xs font-semibold text-card-foreground">{userName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {prediction.sport?.name || 'Šport'} • {prediction.league?.name || 'Liga'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-primary">@{Number(prediction.odds || 0).toFixed(2)}</p>
                  <p
                    className={cn(
                      'text-[11px] font-bold uppercase',
                      prediction.result === 'OK' && 'text-emerald-600',
                      prediction.result === 'NOK' && 'text-rose-600',
                      prediction.result === 'Pending' && 'text-amber-600'
                    )}
                  >
                    {prediction.result === 'Pending' ? 'Čaká' : prediction.result}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
