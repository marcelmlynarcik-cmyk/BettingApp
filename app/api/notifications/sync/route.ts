import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAll, type ServerPushPayload } from '@/lib/server-push'

type TicketRow = {
  id: string
  date: string
  stake: number | string | null
  combined_odds: number | string | null
  payout: number | string | null
  possible_win: number | string | null
  status: 'win' | 'loss' | 'pending'
  description: string | null
  created_at: string
}

type PredictionRow = {
  id: string
  user_id: string
  result: 'OK' | 'NOK' | 'Pending'
  odds: number | string | null
  user?: { name?: string | null } | null
}

type MilestoneState = {
  initialized: boolean
  teamTickets: number
  teamProfit: number
  teamTurnover: number
  userOkTips: Record<string, number>
  userHitRate: Record<string, number>
  userWonOdds: Record<string, number>
}

type NotificationEvent = {
  key: string
  payload: ServerPushPayload
}

const TEAM_TICKET_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const TEAM_PROFIT_MILESTONES = [10000, 25000, 50000, 100000]
const PERSONAL_OK_TIPS_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const PERSONAL_HIT_RATE_MILESTONES = [55, 60, 65, 70]
const PERSONAL_HIT_RATE_MIN_SAMPLE = 40
const MILESTONE_STATE_KEY = 'milestones'

function authorize(request: Request) {
  const secret = process.env.NOTIFICATION_SYNC_SECRET || process.env.CRON_SECRET
  if (!secret) return true

  const auth = request.headers.get('authorization')
  const headerSecret = request.headers.get('x-notification-sync-secret')
  const urlSecret = new URL(request.url).searchParams.get('secret')

  return auth === `Bearer ${secret}` || headerSecret === secret || urlSecret === secret
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
  return `${value.toFixed(0)} Kč`
}

function getHighestFixedMilestone(current: number, milestones: number[]) {
  return [...milestones].reverse().find((milestone) => current >= milestone) || 0
}

function roundToStep(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function getNextWonOddsMilestoneFrom(lastMilestone: number | null) {
  if (lastMilestone === null) return 2
  if (lastMilestone < 2) return roundToStep(lastMilestone + 0.05)
  if (lastMilestone < 3) return roundToStep(lastMilestone + 0.1)
  if (lastMilestone < 5) return roundToStep(lastMilestone + 0.15)
  return roundToStep(lastMilestone + 0.25)
}

function getHighestWonOddsMilestone(current: number) {
  if (current <= 0) return 0

  let achieved = 0
  let next = getNextWonOddsMilestoneFrom(null)
  let guard = 0
  while (next <= current && guard < 1000) {
    achieved = next
    next = getNextWonOddsMilestoneFrom(next)
    guard += 1
  }

  return achieved
}

function getPreviousTeamTurnoverMilestone(current: number) {
  if (current < 5000) return 0
  if (current <= 50000) return Math.floor(current / 5000) * 5000
  if (current <= 200000) return 50000 + Math.floor((current - 50000) / 10000) * 10000
  return 200000 + Math.floor((current - 200000) / 25000) * 25000
}

function defaultMilestoneState(): MilestoneState {
  return {
    initialized: false,
    teamTickets: 0,
    teamProfit: 0,
    teamTurnover: 0,
    userOkTips: {},
    userHitRate: {},
    userWonOdds: {},
  }
}

function normalizeMilestoneState(value: unknown): MilestoneState {
  if (!value || typeof value !== 'object') return defaultMilestoneState()
  const parsed = value as Partial<MilestoneState>

  return {
    initialized: Boolean(parsed.initialized),
    teamTickets: Number(parsed.teamTickets || 0),
    teamProfit: Number(parsed.teamProfit || 0),
    teamTurnover: Number(parsed.teamTurnover || 0),
    userOkTips: parsed.userOkTips || {},
    userHitRate: parsed.userHitRate || {},
    userWonOdds: parsed.userWonOdds || {},
  }
}

async function getMilestoneState(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from('notification_state')
    .select('value')
    .eq('key', MILESTONE_STATE_KEY)
    .maybeSingle()

  if (error) throw new Error(`Failed to read notification state: ${error.message}`)
  return normalizeMilestoneState(data?.value)
}

async function saveMilestoneState(supabase: ReturnType<typeof createAdminClient>, state: MilestoneState) {
  const { error } = await supabase.from('notification_state').upsert(
    {
      key: MILESTONE_STATE_KEY,
      value: state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )

  if (error) throw new Error(`Failed to save notification state: ${error.message}`)
}

async function hasEvent(supabase: ReturnType<typeof createAdminClient>, key: string) {
  const { data, error } = await supabase
    .from('push_notification_events')
    .select('key')
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(`Failed to read notification event: ${error.message}`)
  return Boolean(data)
}

async function recordEvent(supabase: ReturnType<typeof createAdminClient>, key: string, payload: ServerPushPayload) {
  const { error } = await supabase.from('push_notification_events').insert({
    key,
    type: key.split(':')[0],
    payload,
    sent_at: new Date().toISOString(),
  })

  if (error && error.code !== '23505') {
    throw new Error(`Failed to record notification event: ${error.message}`)
  }

  return !error
}

function buildTicketEvents(tickets: TicketRow[]): NotificationEvent[] {
  const events: NotificationEvent[] = []

  for (const ticket of tickets) {
    const description = ticket.description || 'Nový tiket'
    const stake = toNumber(ticket.stake)
    const combinedOdds = toNumber(ticket.combined_odds)
    const possibleWin = toNumber(ticket.possible_win)
    const payout = toNumber(ticket.payout)
    const url = `/tickets/${ticket.id}`

    events.push({
      key: `ticket-submitted:${ticket.id}`,
      payload: {
        title: 'Podaný nový tiket',
        body: `${description} • vklad ${formatMoney(stake)} • kurz ${combinedOdds.toFixed(2)} • možná výhra ${formatMoney(possibleWin)}`,
        url,
        tag: `ticket-submitted-${ticket.id}`,
      },
    })

    if (ticket.status !== 'pending') {
      const isWin = ticket.status === 'win'
      const profit = payout - stake
      events.push({
        key: `ticket-settled:${ticket.id}`,
        payload: {
          title: isWin ? 'Vyhodnotený tiket: výhra' : 'Vyhodnotený tiket: prehra',
          body: isWin
            ? `${description} • výhra ${formatMoney(payout)} • čistý zisk ${formatMoney(profit)}`
            : `${description} • strata ${formatMoney(stake)}`,
          url,
          tag: `ticket-settled-${ticket.id}`,
        },
      })
    }
  }

  return events
}

function buildMilestoneEvents(
  state: MilestoneState,
  tickets: TicketRow[],
  predictions: PredictionRow[],
) {
  const events: NotificationEvent[] = []
  const ticketCount = tickets.length
  const teamProfit = tickets.reduce((sum, ticket) => sum + toNumber(ticket.payout) - toNumber(ticket.stake), 0)
  const teamTurnover = tickets.reduce((sum, ticket) => sum + toNumber(ticket.stake), 0)

  const teamTickets = getHighestFixedMilestone(ticketCount, TEAM_TICKET_MILESTONES)
  const teamProfitMilestone = getHighestFixedMilestone(Math.max(0, teamProfit), TEAM_PROFIT_MILESTONES)
  const teamTurnoverMilestone = getPreviousTeamTurnoverMilestone(teamTurnover)

  if (teamTickets > state.teamTickets) {
    events.push({
      key: `milestone:team-tickets:${teamTickets}`,
      payload: {
        title: 'Tímový milestone',
        body: `Dosiahnutých ${teamTickets} spoločných tiketov`,
        url: '/ranking',
        tag: `milestone-team-tickets-${teamTickets}`,
      },
    })
    state.teamTickets = teamTickets
  }

  if (teamProfitMilestone > state.teamProfit) {
    events.push({
      key: `milestone:team-profit:${teamProfitMilestone}`,
      payload: {
        title: 'Tímový milestone',
        body: `Tímový profit dosiahol +${formatMoney(teamProfitMilestone)}`,
        url: '/ranking',
        tag: `milestone-team-profit-${teamProfitMilestone}`,
      },
    })
    state.teamProfit = teamProfitMilestone
  }

  if (teamTurnoverMilestone > state.teamTurnover) {
    events.push({
      key: `milestone:team-turnover:${teamTurnoverMilestone}`,
      payload: {
        title: 'Tímový milestone',
        body: `Prestávkované peniaze tímu: ${formatMoney(teamTurnoverMilestone)}`,
        url: '/ranking',
        tag: `milestone-team-turnover-${teamTurnoverMilestone}`,
      },
    })
    state.teamTurnover = teamTurnoverMilestone
  }

  const personalByUser = new Map<string, { resolved: number; ok: number; bestWonOdds: number; name: string }>()
  for (const prediction of predictions) {
    if (prediction.result !== 'OK' && prediction.result !== 'NOK') continue
    const current = personalByUser.get(prediction.user_id) || {
      resolved: 0,
      ok: 0,
      bestWonOdds: 0,
      name: prediction.user?.name || 'Tipér',
    }

    current.resolved += 1
    if (prediction.result === 'OK') {
      current.ok += 1
      current.bestWonOdds = Math.max(current.bestWonOdds, toNumber(prediction.odds))
    }
    if (prediction.user?.name) current.name = prediction.user.name
    personalByUser.set(prediction.user_id, current)
  }

  for (const [userId, personal] of personalByUser) {
    const okMilestone = getHighestFixedMilestone(personal.ok, PERSONAL_OK_TIPS_MILESTONES)
    if (okMilestone > (state.userOkTips[userId] || 0)) {
      events.push({
        key: `milestone:user-ok:${userId}:${okMilestone}`,
        payload: {
          title: 'Osobný milestone',
          body: `${personal.name} dosiahol ${okMilestone} OK tipov`,
          url: '/ranking',
          tag: `milestone-user-ok-${userId}-${okMilestone}`,
        },
      })
      state.userOkTips[userId] = okMilestone
    }

    if (personal.resolved >= PERSONAL_HIT_RATE_MIN_SAMPLE) {
      const hitRate = (personal.ok / Math.max(1, personal.resolved)) * 100
      const hitRateMilestone = getHighestFixedMilestone(hitRate, PERSONAL_HIT_RATE_MILESTONES)
      if (hitRateMilestone > (state.userHitRate[userId] || 0)) {
        events.push({
          key: `milestone:user-hitrate:${userId}:${hitRateMilestone}`,
          payload: {
            title: 'Osobný milestone',
            body: `${personal.name} dosiahol hit rate ${hitRateMilestone.toFixed(0)}%`,
            url: '/ranking',
            tag: `milestone-user-hitrate-${userId}-${hitRateMilestone}`,
          },
        })
        state.userHitRate[userId] = hitRateMilestone
      }
    }

    const wonOddsMilestone = getHighestWonOddsMilestone(personal.bestWonOdds)
    if (wonOddsMilestone > (state.userWonOdds[userId] || 0)) {
      events.push({
        key: `milestone:user-wonodds:${userId}:${wonOddsMilestone.toFixed(2)}`,
        payload: {
          title: 'Osobný milestone',
          body: `${personal.name} trafil kurz ${wonOddsMilestone.toFixed(2)}`,
          url: '/ranking',
          tag: `milestone-user-wonodds-${userId}-${wonOddsMilestone.toFixed(2)}`,
        },
      })
      state.userWonOdds[userId] = wonOddsMilestone
    }
  }

  return events
}

async function runSync() {
  const supabase = createAdminClient()
  const [{ data: ticketsData, error: ticketsError }, { data: predictionsData, error: predictionsError }] =
    await Promise.all([
      supabase
        .from('tickets')
        .select('id, date, stake, combined_odds, payout, possible_win, status, description, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('predictions')
        .select('id, user_id, result, odds, user:users(name)')
        .in('result', ['OK', 'NOK']),
    ])

  if (ticketsError) throw new Error(`Failed to read tickets: ${ticketsError.message}`)
  if (predictionsError) throw new Error(`Failed to read predictions: ${predictionsError.message}`)

  const tickets = (ticketsData || []) as TicketRow[]
  const predictions = (predictionsData || []) as PredictionRow[]
  const milestoneState = await getMilestoneState(supabase)
  const ticketEvents = buildTicketEvents(tickets)
  const milestoneEvents = buildMilestoneEvents(milestoneState, tickets, predictions)
  const events = milestoneState.initialized ? [...ticketEvents, ...milestoneEvents] : []

  milestoneState.initialized = true

  let sentEvents = 0
  let skippedEvents = 0
  let deliveredTargets = 0

  if (!milestoneState.initialized) {
    for (const event of ticketEvents) {
      await recordEvent(supabase, event.key, event.payload)
    }
  }

  for (const event of events) {
    if (await hasEvent(supabase, event.key)) {
      skippedEvents += 1
      continue
    }

    const inserted = await recordEvent(supabase, event.key, event.payload)
    if (!inserted) {
      skippedEvents += 1
      continue
    }

    const result = await sendPushToAll(event.payload)
    sentEvents += 1
    deliveredTargets += result.sent
  }

  await saveMilestoneState(supabase, milestoneState)

  return {
    ok: true,
    scannedTickets: tickets.length,
    scannedPredictions: predictions.length,
    events: events.length,
    sentEvents,
    skippedEvents,
    deliveredTargets,
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runSync())
  } catch (error) {
    console.error('Notification sync failed:', error)
    const message = error instanceof Error ? error.message : 'Notification sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
