import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteContext = {
  params: Promise<{ id: string }>
}

type PredictionRow = {
  id: string
  ticket_id: string
  result: 'OK' | 'NOK' | 'Pending'
  odds: number | string
}

type TicketRow = {
  id: string
  stake: number | string
  combined_odds: number | string | null
  description: string | null
  date: string
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isResolved(result: string | null) {
  return result === 'OK' || result === 'NOK'
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

  const { error } = await supabase.from('finance_transactions').insert({
    type: 'payout',
    ticket_id: ticket.id,
    amount,
    date: new Date().toISOString().split('T')[0],
    description,
  })

  if (error) throw error
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
  if (!allResolved) return

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
    return
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
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: ticketId } = await context.params
    const body = await request.json()
    const supabase = createAdminClient()

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, stake, combined_odds, description, date')
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
        .select('id, ticket_id, result, odds')
        .eq('ticket_id', ticketId)

      if (readError) throw readError

      const predictions = ((predictionsBefore || []) as PredictionRow[]).map((prediction) => ({
        ...prediction,
        result: 'OK' as const,
      }))

      const { error: updateError } = await supabase
        .from('predictions')
        .update({ result: 'OK' })
        .eq('ticket_id', ticketId)

      if (updateError) throw updateError

      await finalizeTicketIfResolved(supabase, ticket as TicketRow, predictions)
      return NextResponse.json({ ok: true })
    }

    const predictionId = String(body.predictionId || '')
    const result = body.result === 'OK' || body.result === 'NOK' ? body.result : null

    if (!predictionId || !result) {
      return NextResponse.json({ error: 'Invalid prediction result update' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('predictions')
      .update({ result })
      .eq('id', predictionId)
      .eq('ticket_id', ticketId)

    if (updateError) throw updateError

    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('id, ticket_id, result, odds')
      .eq('ticket_id', ticketId)

    if (predictionsError) throw predictionsError

    await finalizeTicketIfResolved(supabase, ticket as TicketRow, (predictions || []) as PredictionRow[])

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Prediction update failed:', error)
    const message = error instanceof Error ? error.message : 'Prediction update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
