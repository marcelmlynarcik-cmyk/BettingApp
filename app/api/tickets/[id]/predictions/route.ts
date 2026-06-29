import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFinanceUpdatePush } from '@/lib/finance-notifications'
import { insertPredictionAuditLog } from '@/lib/prediction-audit'
import { sendPushToAllUsersSafe } from '@/lib/push-notifications'

type RouteContext = {
  params: Promise<{ id: string }>
}

type PredictionRow = {
  id: string
  ticket_id: string
  result: 'OK' | 'NOK' | 'Pending'
  odds: number | string
  user_id?: string
  sport_id?: string | null
  league_id?: string | null
  user?: { name: string | null } | null
  sport?: { name: string | null } | null
  league?: { name: string | null } | null
}

type JoinedPredictionRow = Omit<PredictionRow, 'user' | 'sport' | 'league'> & {
  user?: { name: string | null } | Array<{ name: string | null }> | null
  sport?: { name: string | null } | Array<{ name: string | null }> | null
  league?: { name: string | null } | Array<{ name: string | null }> | null
}

type TicketRow = {
  id: string
  stake: number | string
  combined_odds: number | string | null
  description: string | null
  date: string
  status?: 'win' | 'loss' | 'pending'
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isResolved(result: string | null) {
  return result === 'OK' || result === 'NOK'
}

function toAuditResult(value: unknown) {
  return value === 'OK' || value === 'NOK' || value === 'Pending' ? value : null
}

function normalizeJoinedRecord<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

function normalizePredictionRow(prediction: JoinedPredictionRow): PredictionRow {
  return {
    ...prediction,
    user: normalizeJoinedRecord(prediction.user),
    sport: normalizeJoinedRecord(prediction.sport),
    league: normalizeJoinedRecord(prediction.league),
  }
}

function normalizePredictionRows(predictions: JoinedPredictionRow[] | null | undefined) {
  return (predictions || []).map(normalizePredictionRow)
}

function formatPredictionContext(prediction: Partial<PredictionRow> | null | undefined) {
  const userName = prediction?.user?.name || 'Neznamy tiper'
  const sportName = prediction?.sport?.name || 'Neznamy sport'
  const leagueName = prediction?.league?.name || 'Neznama liga'
  const odds = toNumber(prediction?.odds).toFixed(2)
  return `${userName} | ${sportName} / ${leagueName} | kurz ${odds}`
}

function formatPredictionResults(predictions: PredictionRow[]) {
  if (predictions.length === 0) return 'bez tipov'

  return predictions
    .map((prediction) => {
      const userName = prediction.user?.name || 'Neznámy tipér'
      return `${userName} ${prediction.result}`
    })
    .join(', ')
}

function formatTicketSettlementBody(ticket: TicketRow, settlement: { status: 'win' | 'loss'; payout: number }, predictions: PredictionRow[]) {
  const description = ticket.description || 'Tiket'

  if (settlement.status === 'win') {
    const profit = settlement.payout - toNumber(ticket.stake)
    return `${description} | výhra ${settlement.payout.toFixed(2)} Kč | zisk ${profit.toFixed(2)} Kč`
  }

  return `${description} | vklad ${toNumber(ticket.stake).toFixed(2)} Kč | Tipy: ${formatPredictionResults(predictions)}`
}

async function replacePayoutTransaction(
  supabase: ReturnType<typeof createAdminClient>,
  ticket: TicketRow,
  amount: number,
  description: string,
) {
  await supabase
    .from('finance_transactions')
    .delete()
    .eq('ticket_id', ticket.id)
    .eq('type', 'payout')

  const date = new Date().toISOString().split('T')[0]
  const { data: transaction, error } = await supabase
    .from('finance_transactions')
    .insert({
      type: 'payout',
      ticket_id: ticket.id,
      amount,
      date,
      description,
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

async function clearPayoutTransaction(
  supabase: ReturnType<typeof createAdminClient>,
  ticketId: string,
) {
  const { error } = await supabase
    .from('finance_transactions')
    .delete()
    .eq('ticket_id', ticketId)
    .eq('type', 'payout')

  if (error) throw error
}

async function finalizeTicketIfResolved(
  supabase: ReturnType<typeof createAdminClient>,
  ticket: TicketRow,
  predictions: PredictionRow[],
) {
  const allResolved = predictions.length > 0 && predictions.every((prediction) => isResolved(prediction.result))
  if (!allResolved) return { resolved: false as const }

  const allOK = predictions.every((prediction) => prediction.result === 'OK')
  const stake = toNumber(ticket.stake)
  const combinedOdds = toNumber(ticket.combined_odds)
  const payout = allOK ? stake * combinedOdds : 0
  const totalProfit = payout - stake

  const { error: ticketError } = await supabase
    .from('tickets')
    .update({ status: allOK ? 'win' : 'loss', payout })
    .eq('id', ticket.id)

  if (ticketError) throw ticketError

  if (allOK) {
    const profitPerPrediction = predictions.length > 0 ? totalProfit / predictions.length : 0
    const { error: profitError } = await supabase
      .from('predictions')
      .update({ profit: profitPerPrediction })
      .eq('ticket_id', ticket.id)

    if (profitError) throw profitError

    await replacePayoutTransaction(
      supabase,
      ticket,
      payout,
      `Výplata za tiket: ${ticket.description || 'Tiket'} [ticket:${ticket.id}]`,
    )
    return { resolved: true as const, status: 'win' as const, payout }
  }

  await clearPayoutTransaction(supabase, ticket.id)

  const nokPredictions = predictions.filter((prediction) => prediction.result === 'NOK')
  const lossPerNok = nokPredictions.length > 0 ? -stake / nokPredictions.length : 0

  for (const prediction of predictions) {
    const { error } = await supabase
      .from('predictions')
      .update({ profit: prediction.result === 'NOK' ? lossPerNok : 0 })
      .eq('id', prediction.id)

    if (error) throw error
  }

  return { resolved: true as const, status: 'loss' as const, payout }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: ticketId } = await context.params
    const body = await request.json()
    const supabase = createAdminClient()
    const user = await getCurrentUser()
    const profile = await ensureProfileForUser(user)
    const actorName = profile?.display_name || user?.email || null
    const actorEmail = profile?.email || user?.email || null

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, stake, combined_odds, description, date, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: ticketError?.message || 'Ticket not found' }, { status: 404 })
    }

    if (body.action === 'updateOdds') {
      const predictionId = String(body.predictionId || '')
      const odds = toNumber(body.odds)

      if (!predictionId || odds < 0) {
        return NextResponse.json({ error: 'Invalid odds update' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('predictions')
        .update({ odds })
        .eq('id', predictionId)
        .eq('ticket_id', ticketId)

      if (updateError) throw updateError

      const { data: predictions, error: predictionsError } = await supabase
        .from('predictions')
        .select('odds')
        .eq('ticket_id', ticketId)

      if (predictionsError) throw predictionsError

      if (predictions && predictions.length > 0) {
        const combinedOdds = predictions.reduce((acc, prediction) => acc * toNumber(prediction.odds), 1)
        const { error: ticketUpdateError } = await supabase
          .from('tickets')
          .update({
            combined_odds: combinedOdds,
            possible_win: toNumber(ticket.stake) * combinedOdds,
          })
          .eq('id', ticketId)

        if (ticketUpdateError) throw ticketUpdateError
      }

      return NextResponse.json({ ok: true })
    }

    if (body.action === 'markAllOK') {
      const { data: predictionsBefore, error: readError } = await supabase
        .from('predictions')
        .select(`
          id,
          ticket_id,
          result,
          odds,
          user_id,
          sport_id,
          league_id,
          user:users(name),
          sport:sports(name),
          league:leagues(name)
        `)
        .eq('ticket_id', ticketId)

      if (readError) throw readError

      const previousPredictions = normalizePredictionRows(predictionsBefore as JoinedPredictionRow[] | null)
      const predictions = previousPredictions.map((prediction) => ({
        ...prediction,
        result: 'OK' as const,
      }))

      const { error: updateError } = await supabase
        .from('predictions')
        .update({ result: 'OK' })
        .eq('ticket_id', ticketId)

      if (updateError) throw updateError

      const settlement = await finalizeTicketIfResolved(supabase, ticket as TicketRow, predictions)

      for (const prediction of previousPredictions) {
        if (prediction.result === 'OK') continue
        await insertPredictionAuditLog(supabase, {
          ticketId,
          predictionId: prediction.id,
          previousResult: toAuditResult(prediction.result),
          nextResult: 'OK',
          authUserId: user?.id || null,
          actorName,
          actorEmail,
          action: 'mark_all_ok',
        })

        await sendPushToAllUsersSafe({
          type: 'prediction_result_changed',
          dedupeKey: `${ticketId}:${prediction.id}:OK`,
          payload: {
            title: 'Tip bol úspešný',
            body: `${ticket.description || 'Tiket'} | ${formatPredictionContext(prediction)} | OK`,
            url: `/tickets/${ticketId}`,
            tag: `prediction:${prediction.id}:OK`,
          },
        })
      }

      if (settlement.resolved && ticket.status !== settlement.status) {
        await sendPushToAllUsersSafe({
          type: 'ticket_settled',
          dedupeKey: `${ticketId}:${settlement.status}`,
          payload: {
            title: settlement.status === 'win' ? 'Tiket je výherný' : 'Tiket je prehratý',
            body: formatTicketSettlementBody(ticket as TicketRow, settlement, predictions),
            url: `/tickets/${ticketId}`,
            tag: `ticket-settled:${ticketId}:${settlement.status}`,
          },
        })
      }

      return NextResponse.json({ ok: true })
    }

    const predictionId = String(body.predictionId || '')
    const result = body.result === 'OK' || body.result === 'NOK' ? body.result : null

    if (!predictionId || !result) {
      return NextResponse.json({ error: 'Invalid prediction result update' }, { status: 400 })
    }

    const { data: predictionBefore, error: predictionBeforeError } = await supabase
      .from('predictions')
      .select(`
        id,
        ticket_id,
        result,
        odds,
        user_id,
        sport_id,
        league_id,
        user:users(name),
        sport:sports(name),
        league:leagues(name)
      `)
      .eq('id', predictionId)
      .eq('ticket_id', ticketId)
      .maybeSingle()

    if (predictionBeforeError) throw predictionBeforeError

    const { error: updateError } = await supabase
      .from('predictions')
      .update({ result })
      .eq('id', predictionId)
      .eq('ticket_id', ticketId)

    if (updateError) throw updateError

    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select(`
        id,
        ticket_id,
        result,
        odds,
        user_id,
        sport_id,
        league_id,
        user:users(name),
        sport:sports(name),
        league:leagues(name)
      `)
      .eq('ticket_id', ticketId)

    if (predictionsError) throw predictionsError

    const normalizedPredictions = normalizePredictionRows(predictions as JoinedPredictionRow[] | null)
    const settlement = await finalizeTicketIfResolved(supabase, ticket as TicketRow, normalizedPredictions)

    if (predictionBefore?.result !== result) {
      const normalizedPredictionBefore = predictionBefore
        ? normalizePredictionRow(predictionBefore as JoinedPredictionRow)
        : null
      await insertPredictionAuditLog(supabase, {
        ticketId,
        predictionId,
        previousResult: toAuditResult(normalizedPredictionBefore?.result),
        nextResult: result,
        authUserId: user?.id || null,
        actorName,
        actorEmail,
        action: 'single_result_update',
      })

      await sendPushToAllUsersSafe({
        type: 'prediction_result_changed',
        dedupeKey: `${ticketId}:${predictionId}:${result}`,
        payload: {
          title: result === 'OK' ? 'Tip bol úspešný' : 'Tip bol neúspešný',
          body: `${ticket.description || 'Tiket'} | ${formatPredictionContext(normalizedPredictionBefore)} | ${result}`,
          url: `/tickets/${ticketId}`,
          tag: `prediction:${predictionId}:${result}`,
        },
      })
    }

    if (settlement.resolved && ticket.status !== settlement.status) {
      await sendPushToAllUsersSafe({
        type: 'ticket_settled',
        dedupeKey: `${ticketId}:${settlement.status}`,
        payload: {
          title: settlement.status === 'win' ? 'Tiket je výherný' : 'Tiket je prehratý',
          body: formatTicketSettlementBody(ticket as TicketRow, settlement, normalizedPredictions),
          url: `/tickets/${ticketId}`,
          tag: `ticket-settled:${ticketId}:${settlement.status}`,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Prediction update failed:', error)
    const message = error instanceof Error ? error.message : 'Prediction update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
