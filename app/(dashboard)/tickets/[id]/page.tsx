import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  BarChart3, 
  Target, 
  Info,
  ExternalLink,
  History,
} from 'lucide-react'
import Link from 'next/link'
import { PredictionResolver } from '@/components/PredictionResolver'
import { TicketActions } from '@/components/TicketActions'
import type { League, Prediction, Sport, Ticket, User } from '@/lib/types'
import {
  buildProbabilityIndex,
  estimatePredictionProbability,
  estimateTicketProbability,
  type ClosedPredictionRecord,
} from '@/lib/ticket-probability'

export const dynamic = 'force-dynamic'

type AuditLogRecord = {
  id: string
  ticket_id: string
  prediction_id: string
  auth_user_id: string | null
  actor_name: string | null
  actor_email: string | null
  previous_result: 'OK' | 'NOK' | 'Pending' | null
  next_result: 'OK' | 'NOK' | 'Pending' | null
  action: 'single_result_update' | 'mark_all_ok' | 'ticket_edit'
  created_at: string
}

type EnrichedPrediction = Prediction & { user?: User; sport?: Sport; league?: League }
type EnrichedAuditLog = AuditLogRecord & { prediction?: EnrichedPrediction }

function formatAuditAction(action: AuditLogRecord['action']) {
  switch (action) {
    case 'single_result_update':
      return 'Vyhodnotenie tipu'
    case 'mark_all_ok':
      return 'Všetko OK'
    case 'ticket_edit':
      return 'Editácia tiketu'
  }
}

function formatAuditResult(result: AuditLogRecord['previous_result']) {
  if (result === 'OK') return 'OK'
  if (result === 'NOK') return 'NOK'
  return 'Čaká'
}

async function getTicketData(id: string) {
  const supabase = createAdminClient()

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .single()

  if (ticketError) {
    console.error('Error fetching ticket:', {
      id,
      message: ticketError.message,
      code: ticketError.code,
      details: ticketError.details,
      hint: ticketError.hint
    })
    return null
  }

  if (!ticket) return null

  const { data: predictions, error: predError } = await supabase
    .from('predictions')
    .select('*')
    .eq('ticket_id', id)

  if (predError) {
    console.error('Error fetching predictions:', predError)
  }

  // Get users for the predictions
  const [{ data: users }, { data: sports }, { data: leagues }, { data: closedPredictions }, { data: auditLogs }] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('sports').select('*'),
    supabase.from('leagues').select('*'),
    supabase.from('predictions').select('user_id, sport_id, league_id, odds, result').in('result', ['OK', 'NOK']),
    supabase
      .from('prediction_audit_logs')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const statsIndex = buildProbabilityIndex((closedPredictions || []) as ClosedPredictionRecord[])

  const enrichedPredictions = predictions?.map((p) => {
    const estimate = estimatePredictionProbability(
      {
        user_id: p.user_id,
        sport_id: p.sport_id,
        league_id: p.league_id,
        odds: Number(p.odds),
      },
      statsIndex,
    )

    return {
      ...p,
      estimated_win_probability: estimate?.probability ?? null,
      probability_sample_size: estimate?.sampleSize ?? null,
      probability_source: estimate?.sourceLabel ?? null,
      user: users?.find((u) => u.id === p.user_id),
      sport: sports?.find((s) => s.id === p.sport_id),
      league: leagues?.find((l) => l.id === p.league_id),
    }
  }) || []

  const ticketWinProbability = estimateTicketProbability(
    enrichedPredictions.map((p) => ({
      user_id: p.user_id,
      sport_id: p.sport_id,
      league_id: p.league_id,
      odds: Number(p.odds),
      result: p.result,
    })),
    statsIndex,
  )

  const predictionById = new Map(enrichedPredictions.map((prediction) => [prediction.id, prediction]))
  const enrichedAuditLogs = ((auditLogs || []) as AuditLogRecord[]).map((log) => ({
    ...log,
    prediction: predictionById.get(log.prediction_id),
  }))

  return {
    ticket: {
      ...(ticket as Ticket),
      estimated_win_probability: ticketWinProbability,
    },
    predictions: enrichedPredictions,
    auditLogs: enrichedAuditLogs,
  }
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTicketData(id)

  if (!data) {
    notFound()
  }

  const { ticket, predictions, auditLogs } = data

  const getStatusLabel = (status: Ticket['status']) => {
    switch (status) {
      case 'win': return 'Výhra'
      case 'loss': return 'Prehra'
      default: return 'Čaká sa'
    }
  }

  const externalTicketHref =
    ticket.ticket_url && /^https?:\/\//i.test(ticket.ticket_url) ? ticket.ticket_url : ticket.ticket_url ? `https://${ticket.ticket_url}` : null

  return (
    <div className="relative mx-auto max-w-4xl space-y-6">
      <div className="pointer-events-none absolute inset-x-8 top-4 -z-10 h-48 rounded-full bg-amber-300/15 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-64 -z-10 h-56 w-56 rounded-full bg-orange-300/15 blur-3xl" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link 
          href="/tickets" 
          className="flex items-center gap-2 text-muted-foreground hover:text-emerald-600 transition-colors font-bold text-sm uppercase tracking-wider"
        >
          <ArrowLeft className="h-4 w-4" />
          Späť na tikety
        </Link>
        <TicketActions ticketId={ticket.id} description={ticket.description || undefined} />
      </div>

      <div className="rounded-[28px] border border-border/70 bg-gradient-to-br from-amber-50/80 via-card to-orange-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-black tracking-tight">
            {ticket.description || 'Detail tiketu'}
          </h1>
          <p className="flex items-center gap-2 font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {format(new Date(ticket.date), 'd. MMMM yyyy')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-amber-50/70 via-card to-orange-50/40 shadow-sm">
            <div className="border-b border-border/70 bg-white/60 p-4 backdrop-blur">
              <h3 className="font-bold text-card-foreground uppercase tracking-wider text-xs">Tipy na tikete</h3>
            </div>
            <div className="p-4">
              <PredictionResolver initialPredictions={predictions} ticket={ticket} />
              {predictions.length === 0 && (
                <p className="text-center py-8 text-slate-500">Žiadne tipy pre tento tiket.</p>
              )}
            </div>
          </div>

          {externalTicketHref && (
            <div className="flex items-center justify-between rounded-2xl border border-emerald-300/25 bg-emerald-50/80 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/10 p-2">
                  <ExternalLink className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-card-foreground">Externý odkaz</p>
                  <p className="text-xs text-muted-foreground">Zobraziť originál tiketu u stávkovej kancelárie</p>
                </div>
              </div>
              <a 
                href={externalTicketHref} 
                target="_blank" 
                rel="noopener noreferrer"
                className="rounded-xl border border-emerald-400/20 bg-emerald-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-emerald-400 shadow-lg shadow-emerald-500/20"
              >
                Otvoriť
              </a>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border/70 bg-white/70 p-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-bold text-card-foreground uppercase tracking-wider text-xs">História zmien</h3>
            </div>
            <div className="divide-y divide-border">
              {auditLogs.length > 0 ? (
                auditLogs.map((log: EnrichedAuditLog) => {
                  const prediction = log.prediction
                  const actor = log.actor_name || log.actor_email || 'Neznámy používateľ'
                  const userName = prediction?.user?.name || 'Neznámy tipér'
                  const sportName = prediction?.sport?.name || 'Neznámy šport'
                  const leagueName = prediction?.league?.name || 'Neznáma liga'

                  return (
                    <div key={log.id} className="p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-card-foreground">
                            {formatAuditAction(log.action)}
                          </p>
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            {actor} • {format(new Date(log.created_at), 'd.M.yyyy HH:mm')}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {userName} • {sportName} / {leagueName}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs font-black">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                            {formatAuditResult(log.previous_result)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className={cn(
                            'rounded-full px-2.5 py-1',
                            log.next_result === 'OK' && 'bg-emerald-500/10 text-emerald-600',
                            log.next_result === 'NOK' && 'bg-rose-500/10 text-rose-600',
                            log.next_result === 'Pending' && 'bg-amber-500/10 text-amber-600',
                          )}>
                            {formatAuditResult(log.next_result)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Zatiaľ žiadne zaznamenané zmeny.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="sticky top-6 rounded-2xl border border-border/70 bg-gradient-to-br from-amber-50/70 via-card to-orange-50/40 p-6 shadow-sm">
            <h3 className="font-bold text-card-foreground uppercase tracking-wider text-xs mb-6">Súhrn tiketu</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Vklad
                </span>
                <span className="text-card-foreground font-bold">{ticket.stake.toFixed(0)} Kč</span>
              </div>
              
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-white/70 px-3 py-2 shadow-sm backdrop-blur">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Kurz
                </span>
                <span className="text-card-foreground font-bold">{ticket.combined_odds?.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-50/70 px-3 py-2 shadow-sm">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" /> Možná výhra
                </span>
                <span className="text-emerald-600 font-black">
                  {ticket.possible_win?.toFixed(0)} Kč
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-cyan-300/20 bg-cyan-50/75 px-3 py-2 shadow-sm">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" /> Šanca tiketu
                </span>
                <span className="text-cyan-700 font-black">
                  {typeof ticket.estimated_win_probability === 'number'
                    ? `${(ticket.estimated_win_probability * 100).toFixed(1)}%`
                    : 'Nedostatok dát'}
                </span>
              </div>

              <div className="pt-4">
                <div className={cn(
                  "rounded-xl border p-4 text-center shadow-sm",
                  ticket.status === 'win' ? "bg-emerald-50/80 border-emerald-500/20" :
                  ticket.status === 'loss' ? "bg-rose-50/80 border-rose-500/20" :
                  "bg-amber-50/80 border-amber-500/20"
                )}>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
                    Aktuálny stav
                  </p>
                  <p className={cn(
                    "text-xl font-black uppercase tracking-wider",
                    ticket.status === 'win' ? "text-emerald-600" :
                    ticket.status === 'loss' ? "text-rose-600" :
                    "text-amber-600"
                  )}>
                    {getStatusLabel(ticket.status)}
                  </p>
                </div>
              </div>

              {ticket.status === 'win' && (
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500 p-4 shadow-lg shadow-emerald-500/20">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                    Čistý zisk
                  </p>
                  <p className="text-2xl font-black text-white">
                    +{(ticket.payout - ticket.stake).toFixed(0)} Kč
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
