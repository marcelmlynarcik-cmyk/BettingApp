import { createClient } from '@/lib/supabase/server'
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
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'
import { PredictionResolver } from '@/components/PredictionResolver'
import { PredictionRow } from '@/components/PredictionRow'
import { TicketActions } from '@/components/TicketActions'
import type { Ticket, Prediction, User, Sport, League } from '@/lib/types'

type UrlPreview = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  domain: string
}

function extractMeta(html: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regexes = [
    new RegExp(`<meta[^>]+property=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedProperty}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escapedProperty}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedProperty}["'][^>]*>`, 'i'),
  ]

  for (const regex of regexes) {
    const match = html.match(regex)
    if (match?.[1]) return match[1].trim()
  }

  return null
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() || null
}

async function getTicketUrlPreview(url: string): Promise<UrlPreview | null> {
  try {
    const parsedUrl = new URL(url)
    const domain = parsedUrl.hostname.replace(/^www\./, '')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; BettingApp/1.0; +https://example.com/bot-preview)',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return {
        title: null,
        description: null,
        image: null,
        siteName: null,
        domain,
      }
    }

    const html = (await response.text()).slice(0, 150000)

    const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTitle(html)
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description')
    const siteName = extractMeta(html, 'og:site_name')
    const imageRaw = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image')
    const image = imageRaw ? new URL(imageRaw, url).toString() : null

    return {
      title,
      description,
      image,
      siteName,
      domain,
    }
  } catch {
    return null
  }
}

async function getTicketData(id: string) {
  const supabase = await createClient()

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
  const { data: users } = await supabase.from('users').select('*')
  const { data: sports } = await supabase.from('sports').select('*')
  const { data: leagues } = await supabase.from('leagues').select('*')

  const enrichedPredictions = predictions?.map(p => ({
    ...p,
    user: users?.find(u => u.id === p.user_id),
    sport: sports?.find(s => s.id === p.sport_id),
    league: leagues?.find(l => l.id === p.league_id)
  })) || []

  return {
    ticket: ticket as Ticket,
    predictions: enrichedPredictions
  }
}

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTicketData(id)

  if (!data) {
    notFound()
  }

  const { ticket, predictions } = data
  const ticketUrlPreview = ticket.ticket_url ? await getTicketUrlPreview(ticket.ticket_url) : null

  const getStatusLabel = (status: Ticket['status']) => {
    switch (status) {
      case 'win': return 'Výhra'
      case 'loss': return 'Prehra'
      default: return 'Čaká sa'
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link 
          href="/tickets" 
          className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 transition-colors font-bold text-sm uppercase tracking-wider"
        >
          <ArrowLeft className="h-4 w-4" />
          Späť na tikety
        </Link>
        <TicketActions ticketId={ticket.id} description={ticket.description || undefined} />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-black tracking-tight">
          {ticket.description || 'Detail tiketu'}
        </h1>
        <p className="text-slate-600 font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {format(new Date(ticket.date), 'd. MMMM yyyy')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-md overflow-hidden">
            <div className="border-b border-border bg-secondary/50 p-4">
              <h3 className="font-bold text-card-foreground uppercase tracking-wider text-xs">Tipy na tikete</h3>
            </div>
            <div className="p-4">
              <PredictionResolver initialPredictions={predictions} ticket={ticket} />
              {predictions.length === 0 && (
                <p className="text-center py-8 text-slate-500">Žiadne tipy pre tento tiket.</p>
              )}
            </div>
          </div>

          {ticket.ticket_url && (
            <div className="rounded-xl border border-border bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-500/10 p-2">
                    <ExternalLink className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-card-foreground">Externý odkaz</p>
                    <p className="text-xs text-muted-foreground">Náhľad originálneho tiketu u stávkovej kancelárie</p>
                  </div>
                </div>
                <a 
                  href={ticket.ticket_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  Otvoriť
                </a>
              </div>

              <div className="mt-3 rounded-lg border border-border/70 bg-card p-3">
                {ticketUrlPreview?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ticketUrlPreview.image}
                    alt="Náhľad tiketu"
                    className="mb-3 h-40 w-full rounded-md border border-border/60 object-cover"
                    loading="lazy"
                  />
                )}
                <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                  {ticketUrlPreview?.siteName || ticketUrlPreview?.domain || 'Externá stránka'}
                </p>
                <p className="mt-1 text-sm font-semibold text-card-foreground">
                  {ticketUrlPreview?.title || 'Náhľad nie je dostupný pre túto URL'}
                </p>
                {ticketUrlPreview?.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ticketUrlPreview.description}</p>
                )}
                <p className="mt-2 truncate text-xs text-muted-foreground/80">{ticket.ticket_url}</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-md p-6 sticky top-6">
            <h3 className="font-bold text-card-foreground uppercase tracking-wider text-xs mb-6">Súhrn tiketu</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Vklad
                </span>
                <span className="text-card-foreground font-bold">{ticket.stake.toFixed(0)} Kč</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Kurz
                </span>
                <span className="text-card-foreground font-bold">{ticket.combined_odds?.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" /> Možná výhra
                </span>
                <span className="text-emerald-600 font-black">
                  {ticket.possible_win?.toFixed(0)} Kč
                </span>
              </div>

              <div className="pt-4">
                <div className={cn(
                  "rounded-lg p-4 text-center border",
                  ticket.status === 'win' ? "bg-emerald-500/10 border-emerald-500/20" :
                  ticket.status === 'loss' ? "bg-rose-500/10 border-rose-500/20" :
                  "bg-amber-500/10 border-amber-500/20"
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
                <div className="bg-emerald-500 p-4 rounded-lg shadow-lg shadow-emerald-500/20">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">
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
