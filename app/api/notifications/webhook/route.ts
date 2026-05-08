import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAll, type ServerPushPayload } from '@/lib/server-push'

type SupabaseWebhookPayload = {
  type?: 'INSERT' | 'UPDATE' | 'DELETE'
  table?: string
  record?: Record<string, unknown>
  old_record?: Record<string, unknown>
}

function authorize(request: Request) {
  const secret = process.env.NOTIFICATION_SYNC_SECRET || process.env.CRON_SECRET
  if (!secret) return true

  const auth = request.headers.get('authorization')
  const headerSecret = request.headers.get('x-notification-sync-secret')
  const webhookSecret = request.headers.get('x-webhook-secret')
  const urlSecret = new URL(request.url).searchParams.get('secret')

  return auth === `Bearer ${secret}` || headerSecret === secret || webhookSecret === secret || urlSecret === secret
}

function isRelevantWebhook(payload: SupabaseWebhookPayload) {
  if (payload.table === 'tickets') {
    if (payload.type === 'INSERT') return true

    if (payload.type === 'UPDATE') {
      const previousStatus = String(payload.old_record?.status || '')
      const nextStatus = String(payload.record?.status || '')
      return previousStatus !== nextStatus && nextStatus !== 'pending'
    }
  }

  if (payload.table === 'predictions' && payload.type === 'UPDATE') {
    const previousResult = String(payload.old_record?.result || '')
    const nextResult = String(payload.record?.result || '')
    return previousResult !== nextResult && nextResult !== 'Pending'
  }

  return false
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
  return `${value.toFixed(0)} Kč`
}

function buildTicketEvent(payload: SupabaseWebhookPayload) {
  if (payload.table !== 'tickets' || !payload.record) return null

  const id = String(payload.record.id || '')
  if (!id) return null

  const description = String(payload.record.description || 'Nový tiket')
  const stake = toNumber(payload.record.stake)
  const combinedOdds = toNumber(payload.record.combined_odds)
  const possibleWin = toNumber(payload.record.possible_win)
  const payout = toNumber(payload.record.payout)
  const status = String(payload.record.status || 'pending')
  const url = `/tickets/${id}`

  if (payload.type === 'INSERT') {
    return {
      key: `ticket-submitted:${id}`,
      payload: {
        title: 'Podaný nový tiket',
        body: `${description} • vklad ${formatMoney(stake)} • kurz ${combinedOdds.toFixed(2)} • možná výhra ${formatMoney(possibleWin)}`,
        url,
        tag: `ticket-submitted-${id}`,
      },
    }
  }

  if (payload.type === 'UPDATE' && status !== 'pending') {
    const isWin = status === 'win'
    const profit = payout - stake
    return {
      key: `ticket-settled:${id}`,
      payload: {
        title: isWin ? 'Vyhodnotený tiket: výhra' : 'Vyhodnotený tiket: prehra',
        body: isWin
          ? `${description} • výhra ${formatMoney(payout)} • čistý zisk ${formatMoney(profit)}`
          : `${description} • strata ${formatMoney(stake)}`,
        url,
        tag: `ticket-settled-${id}`,
      },
    }
  }

  return null
}

async function recordAndSendEvent(key: string, payload: ServerPushPayload) {
  const supabase = createAdminClient()
  const { error } = await supabase.from('push_notification_events').insert({
    key,
    type: key.split(':')[0],
    payload,
    sent_at: new Date().toISOString(),
  })

  if (error?.code === '23505') {
    return { sent: false, duplicate: true }
  }

  if (error) {
    throw new Error(`Failed to record notification event: ${error.message}`)
  }

  const result = await sendPushToAll(payload)
  return { sent: true, duplicate: false, deliveredTargets: result.sent }
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: SupabaseWebhookPayload
  try {
    payload = (await request.json()) as SupabaseWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  if (!isRelevantWebhook(payload)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  let ticketEventResult: Awaited<ReturnType<typeof recordAndSendEvent>> | null = null
  const ticketEvent = buildTicketEvent(payload)
  if (ticketEvent) {
    ticketEventResult = await recordAndSendEvent(ticketEvent.key, ticketEvent.payload)
  }

  const syncUrl = new URL('/api/notifications/sync', request.url)
  const secret = process.env.NOTIFICATION_SYNC_SECRET || process.env.CRON_SECRET
  if (secret) syncUrl.searchParams.set('secret', secret)

  const response = await fetch(syncUrl, { method: 'POST' })
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('Notification webhook sync failed:', result)
    return NextResponse.json(
      { error: 'Notification sync failed', details: result },
      { status: response.status },
    )
  }

  return NextResponse.json({ ok: true, realtime: true, ticketEvent: ticketEventResult, sync: result })
}
