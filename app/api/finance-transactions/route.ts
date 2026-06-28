import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFinanceUpdatePush } from '@/lib/finance-notifications'

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const type = body.type === 'deposit' || body.type === 'withdraw' ? body.type : null
    const amount = toNumber(body.amount)
    const date = typeof body.date === 'string' ? body.date : ''
    const description = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null

    if (!type || amount === null || amount <= 0 || !date) {
      return NextResponse.json({ error: 'Invalid finance transaction' }, { status: 400 })
    }

    const finalAmount = type === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
    const supabase = createAdminClient()
    const { data: transaction, error } = await supabase
      .from('finance_transactions')
      .insert({
      type,
      amount: finalAmount,
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

    return NextResponse.json({ ok: true, amount: finalAmount })
  } catch (error) {
    console.error('Finance transaction create failed:', error)
    const message = error instanceof Error ? error.message : 'Finance transaction create failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
