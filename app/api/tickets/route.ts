import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToAllUsersSafe } from '@/lib/push-notifications'

type TicketPredictionInput = {
  user_id: unknown
  odds: unknown
  sport_id: unknown
  league_id: unknown
}

function toPositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  let ticketId: string | null = null

  try {
    const body = await request.json()
    const date = toRequiredString(body.date)
    const stake = toPositiveNumber(body.stake)
    const description = toOptionalString(body.description)
    const ticketUrl = toOptionalString(body.ticket_url)
    const predictions = Array.isArray(body.predictions) ? (body.predictions as TicketPredictionInput[]) : []

    if (!date || stake === null || predictions.length === 0) {
      return NextResponse.json({ error: 'Invalid ticket' }, { status: 400 })
    }

    const normalizedPredictions = predictions.map((prediction: TicketPredictionInput) => ({
      user_id: toRequiredString(prediction.user_id),
      odds: toPositiveNumber(prediction.odds),
      sport_id: toRequiredString(prediction.sport_id),
      league_id: toRequiredString(prediction.league_id),
    }))

    if (
      normalizedPredictions.some(
        (prediction) =>
          !prediction.user_id ||
          prediction.odds === null ||
          !prediction.sport_id ||
          !prediction.league_id,
      )
    ) {
      return NextResponse.json({ error: 'Invalid predictions' }, { status: 400 })
    }

    const combinedOdds = normalizedPredictions.reduce(
      (acc, prediction) => acc * (prediction.odds || 0),
      1,
    )
    const possibleWin = stake * combinedOdds
    const supabase = createAdminClient()

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        date,
        stake,
        combined_odds: combinedOdds,
        possible_win: possibleWin,
        ticket_url: ticketUrl,
        description,
        status: 'pending',
      })
      .select()
      .single()

    if (ticketError || !ticket) {
      throw ticketError || new Error('Ticket was not created')
    }

    ticketId = ticket.id

    const { error: predictionsError } = await supabase.from('predictions').insert(
      normalizedPredictions.map((prediction) => ({
        ticket_id: ticket.id,
        user_id: prediction.user_id,
        odds: prediction.odds,
        sport_id: prediction.sport_id,
        league_id: prediction.league_id,
        tip_date: date,
        result: 'Pending',
      })),
    )

    if (predictionsError) {
      await supabase.from('tickets').delete().eq('id', ticket.id)
      throw predictionsError
    }

    const ticketTag = `[ticket:${ticket.id}]`
    const { error: transactionError } = await supabase.from('finance_transactions').insert({
      type: 'bet',
      ticket_id: ticket.id,
      amount: -stake,
      date,
      description: `Stávka na tiket: ${description || 'Nový tiket'} ${ticketTag}`,
    })

    await sendPushToAllUsersSafe({
      type: 'ticket_created',
      dedupeKey: ticket.id,
      payload: {
        title: 'Nový tiket',
        body: `${description || 'Bol pridaný nový tiket'} | vklad ${stake.toFixed(2)} EUR`,
        url: `/tickets/${ticket.id}`,
        tag: `ticket-created:${ticket.id}`,
      },
    })

    return NextResponse.json({
      ok: true,
      financeWarning: Boolean(transactionError),
      ticket,
    })
  } catch (error) {
    console.error('Ticket create failed:', error)
    const message = error instanceof Error ? error.message : 'Ticket create failed'
    return NextResponse.json({ error: message, ticketId }, { status: 500 })
  }
}
