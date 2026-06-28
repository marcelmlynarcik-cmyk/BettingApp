import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Ticket } from '@/lib/types'
import { sendFinanceUpdatePush } from '@/lib/finance-notifications'
import { insertPredictionAuditLog } from '@/lib/prediction-audit'
import { sendPushToAllUsersSafe } from '@/lib/push-notifications'

type RouteContext = {
  params: Promise<{ id: string }>
}

type EditablePredictionInput = {
  id: unknown
  user_id: unknown
  odds: unknown
  result: unknown
  sport_id: unknown
  league_id: unknown
  tip_date: unknown
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toResult(value: unknown): 'OK' | 'NOK' | 'Pending' | null {
  return value === 'OK' || value === 'NOK' || value === 'Pending' ? value : null
}

function computeSettlement(
  predictions: Array<{ id: string; result: 'OK' | 'NOK' | 'Pending' }>,
  stake: number,
  combinedOdds: number,
) {
  const allResolved = predictions.every((prediction) => prediction.result !== 'Pending')
  const allOK = predictions.every((prediction) => prediction.result === 'OK')
  const status: Ticket['status'] = allResolved ? (allOK ? 'win' : 'loss') : 'pending'
  const payout = status === 'win' ? stake * combinedOdds : 0
  const totalProfit = payout - stake
  const profitsByPredictionId: Record<string, number> = {}

  if (status === 'win' && predictions.length > 0) {
    const profitPerPrediction = totalProfit / predictions.length
    predictions.forEach((prediction) => {
      profitsByPredictionId[prediction.id] = profitPerPrediction
    })
  } else if (status === 'loss') {
    const nokPredictions = predictions.filter((prediction) => prediction.result === 'NOK')
    const lossPerNok = nokPredictions.length > 0 ? -stake / nokPredictions.length : 0
    predictions.forEach((prediction) => {
      profitsByPredictionId[prediction.id] = prediction.result === 'NOK' ? lossPerNok : 0
    })
  } else {
    predictions.forEach((prediction) => {
      profitsByPredictionId[prediction.id] = 0
    })
  }

  return { status, payout, profitsByPredictionId }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: ticketId } = await context.params
    const supabase = createAdminClient()

    const [
      { data: ticket, error: ticketError },
      { data: predictions, error: predictionsError },
      { data: users, error: usersError },
      { data: sports, error: sportsError },
      { data: leagues, error: leaguesError },
    ] = await Promise.all([
      supabase
        .from('tickets')
        .select('date, stake, description, ticket_url, status')
        .eq('id', ticketId)
        .single(),
      supabase
        .from('predictions')
        .select('id, user_id, odds, result, sport_id, league_id, tip_date')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true }),
      supabase.from('users').select('*').order('name', { ascending: true }),
      supabase.from('sports').select('*').order('name', { ascending: true }),
      supabase.from('leagues').select('*').order('name', { ascending: true }),
    ])

    if (ticketError) throw ticketError
    if (predictionsError) throw predictionsError
    if (usersError) throw usersError
    if (sportsError) throw sportsError
    if (leaguesError) throw leaguesError

    return NextResponse.json({ ticket, predictions: predictions || [], users: users || [], sports: sports || [], leagues: leagues || [] })
  } catch (error) {
    console.error('Ticket edit data load failed:', error)
    const message = error instanceof Error ? error.message : 'Ticket edit data load failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: ticketId } = await context.params
    const body = await request.json()
    const date = toRequiredString(body.date)
    const stake = toNumber(body.stake)
    const description = toOptionalString(body.description)
    const ticketUrl = toOptionalString(body.ticket_url)
    const predictions = Array.isArray(body.predictions) ? (body.predictions as EditablePredictionInput[]) : []
    const user = await getCurrentUser()
    const profile = await ensureProfileForUser(user)
    const actorName = profile?.display_name || user?.email || null
    const actorEmail = profile?.email || user?.email || null

    if (!date || stake === null || stake <= 0 || predictions.length === 0) {
      return NextResponse.json({ error: 'Invalid ticket update' }, { status: 400 })
    }

    const normalizedPredictions = predictions.map((prediction) => ({
      id: toRequiredString(prediction.id),
      user_id: toRequiredString(prediction.user_id),
      odds: toNumber(prediction.odds),
      result: toResult(prediction.result),
      sport_id: toOptionalString(prediction.sport_id),
      league_id: toOptionalString(prediction.league_id),
      tip_date: toOptionalString(prediction.tip_date),
    }))

    if (
      normalizedPredictions.some(
        (prediction) =>
          !prediction.id ||
          !prediction.user_id ||
          prediction.odds === null ||
          prediction.odds < 0 ||
          !prediction.result,
      )
    ) {
      return NextResponse.json({ error: 'Invalid predictions update' }, { status: 400 })
    }

    const combinedOdds = normalizedPredictions.reduce((acc, prediction) => acc * (prediction.odds || 0), 1)
    const possibleWin = stake * combinedOdds
    const { status, payout, profitsByPredictionId } = computeSettlement(
      normalizedPredictions.map((prediction) => ({ id: prediction.id || '', result: prediction.result || 'Pending' })),
      stake,
      combinedOdds,
    )
    const supabase = createAdminClient()

    const [{ data: existingTicket }, { data: existingPredictions }] = await Promise.all([
      supabase.from('tickets').select('status').eq('id', ticketId).maybeSingle(),
      supabase.from('predictions').select('id, result').eq('ticket_id', ticketId),
    ])
    const previousStatus = existingTicket?.status as Ticket['status'] | undefined
    const previousResults = new Map(
      ((existingPredictions || []) as Array<{ id: string; result: string | null }>).map((prediction) => [
        prediction.id,
        prediction.result,
      ]),
    )

    const { error: updateTicketError } = await supabase
      .from('tickets')
      .update({
        date,
        stake,
        combined_odds: combinedOdds,
        possible_win: possibleWin,
        payout,
        status,
        description,
        ticket_url: ticketUrl,
      })
      .eq('id', ticketId)

    if (updateTicketError) throw updateTicketError

    for (const prediction of normalizedPredictions) {
      const { error } = await supabase
        .from('predictions')
        .update({
          user_id: prediction.user_id,
          odds: prediction.odds,
          result: prediction.result,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          tip_date: prediction.tip_date,
          profit: profitsByPredictionId[prediction.id || ''] ?? 0,
        })
        .eq('id', prediction.id)
        .eq('ticket_id', ticketId)

      if (error) throw error
    }

    const ticketTag = `[ticket:${ticketId}]`
    const ticketDescription = description || 'Nový tiket'
    const payoutDescription = description || 'Tiket'

    const { data: betTransactions, error: betTransactionsError } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('ticket_id', ticketId)
      .eq('type', 'bet')

    if (betTransactionsError) throw betTransactionsError

    if ((betTransactions || []).length > 0) {
      const { error } = await supabase
        .from('finance_transactions')
        .update({
          amount: -Math.abs(stake),
          date,
          description: `Stávka na tiket: ${ticketDescription} ${ticketTag}`,
        })
        .eq('ticket_id', ticketId)
        .eq('type', 'bet')

      if (error) throw error
    } else {
      const { data: transaction, error } = await supabase
        .from('finance_transactions')
        .insert({
          type: 'bet',
          ticket_id: ticketId,
          amount: -Math.abs(stake),
          date,
          description: `Stávka na tiket: ${ticketDescription} ${ticketTag}`,
        })
        .select('id, type, amount, date, description, ticket_id')
        .single()

      if (error) throw error

      if (transaction) {
        await sendFinanceUpdatePush({
          id: transaction.id,
          type: transaction.type,
          amount: Number(transaction.amount || 0),
          date: transaction.date,
          description: transaction.description,
          ticketId: transaction.ticket_id,
        })
      }
    }

    const { error: deletePayoutsError } = await supabase
      .from('finance_transactions')
      .delete()
      .eq('ticket_id', ticketId)
      .eq('type', 'payout')

    if (deletePayoutsError) throw deletePayoutsError

    if (status === 'win' && payout > 0) {
      const { data: transaction, error } = await supabase
        .from('finance_transactions')
        .insert({
          type: 'payout',
          ticket_id: ticketId,
          amount: payout,
          date,
          description: `Výplata za tiket: ${payoutDescription} ${ticketTag}`,
        })
        .select('id, type, amount, date, description, ticket_id')
        .single()

      if (error) throw error

      if (transaction) {
        await sendFinanceUpdatePush({
          id: transaction.id,
          type: transaction.type,
          amount: Number(transaction.amount || 0),
          date: transaction.date,
          description: transaction.description,
          ticketId: transaction.ticket_id,
        })
      }
    }

    const changedResolvedPredictions = normalizedPredictions.filter((prediction) => {
      if (!prediction.id || prediction.result === 'Pending') return false
      return previousResults.get(prediction.id) !== prediction.result
    })

    const changedPredictions = normalizedPredictions.filter((prediction) => {
      if (!prediction.id || !prediction.result) return false
      return previousResults.get(prediction.id) !== prediction.result
    })

    for (const prediction of changedPredictions) {
      await insertPredictionAuditLog(supabase, {
        ticketId,
        predictionId: prediction.id || '',
        previousResult: toResult(previousResults.get(prediction.id || '')),
        nextResult: prediction.result,
        authUserId: user?.id || null,
        actorName,
        actorEmail,
        action: 'ticket_edit',
      })
    }

    for (const prediction of changedResolvedPredictions) {
      await sendPushToAllUsersSafe({
        type: 'prediction_result_changed',
        dedupeKey: `${ticketId}:${prediction.id}:${prediction.result}`,
        payload: {
          title: prediction.result === 'OK' ? 'Tip bol úspešný' : 'Tip bol neúspešný',
          body: `${description || 'Tiket'} | kurz ${Number(prediction.odds || 0).toFixed(2)}`,
          url: `/tickets/${ticketId}`,
          tag: `prediction:${prediction.id}:${prediction.result}`,
        },
      })
    }

    if (previousStatus !== status && status !== 'pending') {
      await sendPushToAllUsersSafe({
        type: 'ticket_settled',
        dedupeKey: `${ticketId}:${status}`,
        payload: {
          title: status === 'win' ? 'Tiket je výherný' : 'Tiket je prehratý',
          body: status === 'win'
            ? `${description || 'Tiket'} | výplata ${payout.toFixed(2)} Kč | zisk ${(payout - stake).toFixed(2)} Kč`
            : `${description || 'Tiket'} | vklad ${Math.abs(stake).toFixed(2)} Kč`,
          url: `/tickets/${ticketId}`,
          tag: `ticket-settled:${ticketId}:${status}`,
        },
      })
    }

    return NextResponse.json({ ok: true, status, payout, combinedOdds })
  } catch (error) {
    console.error('Ticket update failed:', error)
    const message = error instanceof Error ? error.message : 'Ticket update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
