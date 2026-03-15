import { createClient } from '@/lib/supabase/server'
import { FinanceClient } from './client'

type NormalizedFinanceType = 'deposit' | 'withdrawal' | 'bet' | 'win' | 'other'

function normalizeFinanceType(type: string): NormalizedFinanceType {
  const value = String(type || '').trim().toLowerCase()

  if (['deposit', 'vklad', 'topup', 'top-up', 'refill', 'bankroll refill'].includes(value)) {
    return 'deposit'
  }
  if (['withdraw', 'withdrawal', 'výber', 'vyber', 'cashout', 'cash out'].includes(value)) {
    return 'withdrawal'
  }
  if (['bet', 'stake', 'stávka', 'stavka', 'loss'].includes(value)) {
    return 'bet'
  }
  if (['payout', 'win', 'settlement', 'výhra', 'vyhra'].includes(value)) {
    return 'win'
  }
  return 'other'
}

function normalizedImpact(type: string, amount: number) {
  const normalizedType = normalizeFinanceType(type)
  if (normalizedType === 'deposit' || normalizedType === 'win') return Math.abs(amount)
  if (normalizedType === 'withdrawal' || normalizedType === 'bet') return -Math.abs(amount)
  return amount
}

async function getFinanceData() {
  const supabase = await createClient()

  const [{ data: transactions }] = await Promise.all([
    supabase
      .from('finance_transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(0, 9999),
  ])

  const safeTransactions = transactions || []

  const normalizedTransactions = safeTransactions.map((t) => ({
    ...t,
    amount: normalizedImpact(t.type, Number(t.amount || 0)),
  }))

  return {
    transactions: normalizedTransactions,
  }
}

export default async function FinancePage() {
  const { transactions } = await getFinanceData()

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-3xl font-black text-black tracking-tight">Financie</h1>
        <p className="mt-1 text-slate-600 font-medium">
          Prehľad pohybov na účte
        </p>
      </div>

      <FinanceClient transactions={transactions} />
    </div>
  )
}
