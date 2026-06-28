import { sendPushToAllUsersSafe } from '@/lib/push-notifications'

type FinanceNotificationInput = {
  id: string
  type: 'deposit' | 'withdraw' | 'bet' | 'payout'
  amount: number
  date?: string | null
  description?: string | null
  ticketId?: string | null
}

function money(value: number) {
  return `${Math.abs(value).toFixed(2)} Kč`
}

function titleForType(type: FinanceNotificationInput['type']) {
  switch (type) {
    case 'deposit':
      return 'Nový vklad'
    case 'withdraw':
      return 'Nový výber'
    case 'bet':
      return 'Nová stávka'
    case 'payout':
      return 'Nová výplata'
  }
}

function cleanDescription(value: string | null | undefined) {
  return value?.replace(/\s*\[ticket:[0-9a-fA-F-]{36}\]\s*/g, '').trim() || null
}

function bodyForTransaction(input: FinanceNotificationInput) {
  const parts = [money(input.amount)]
  const description = cleanDescription(input.description)

  if (input.date) parts.push(input.date)
  if (description) parts.push(description)

  return parts.join(' | ')
}

export async function sendFinanceUpdatePush(input: FinanceNotificationInput) {
  if (input.type === 'bet') return

  await sendPushToAllUsersSafe({
    type: 'finance_updates',
    dedupeKey: input.id,
    payload: {
      title: titleForType(input.type),
      body: bodyForTransaction(input),
      url: input.ticketId ? `/tickets/${input.ticketId}` : '/finance',
      tag: `finance:${input.id}`,
    },
  })
}
