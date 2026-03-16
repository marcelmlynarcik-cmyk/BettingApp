'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { FinanceTransaction } from '@/lib/types'
import { Plus, ArrowUpCircle, ArrowDownCircle, X } from 'lucide-react'

interface FinanceClientProps {
  transactions: FinanceTransaction[]
}

function formatSignedCurrency(value: number) {
  const abs = Math.abs(value)
  if (value > 0) return `+${abs.toFixed(0)} Kč`
  if (value < 0) return `-${abs.toFixed(0)} Kč`
  return `0 Kč`
}

export function FinanceClient({ transactions }: FinanceClientProps) {
  const router = useRouter()
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()

    const finalAmount = type === 'withdraw' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount))

    const { error } = await supabase.from('finance_transactions').insert({
      type,
      amount: finalAmount,
      date,
      description: description || null,
    })

    if (error) {
      console.error('Error creating transaction:', error)
    }

    setIsSubmitting(false)
    setShowAddForm(false)
    setAmount('')
    setDescription('')
    router.refresh()
  }

  const getTypeIcon = (t: FinanceTransaction['type']) => {
    switch (t) {
      case 'deposit':
        return <ArrowUpCircle className="h-5 w-5 text-blue-600" />
      case 'withdraw':
        return <ArrowDownCircle className="h-5 w-5 text-accent" />
      case 'bet':
        return <ArrowDownCircle className="h-5 w-5 text-red-500" />
      case 'payout':
        return <ArrowUpCircle className="h-5 w-5 text-green-500" />
    }
  }

  const getTypeAmountColor = (t: FinanceTransaction['type']) => {
    switch (t) {
      case 'deposit':
        return 'text-blue-600'
      case 'payout':
        return 'text-green-500'
      case 'bet':
        return 'text-red-500'
      case 'withdraw':
        return 'text-accent'
      default:
        return 'text-card-foreground'
    }
  }

  const getTypeLabel = (t: FinanceTransaction['type']) => {
    switch (t) {
      case 'deposit':
        return 'Vklad'
      case 'withdraw':
        return 'Výber'
      case 'bet':
        return 'Stávka'
      case 'payout':
        return 'Výplata'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Transakcie</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground active:scale-95 md:px-4"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Pridať</span>
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="divide-y divide-border">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Zatiaľ žiadne transakcie. Pridaj vklad a začni stávkovať!
            </div>
          ) : (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-3 md:p-4"
              >
                <div className="flex items-center gap-3 md:gap-4">
                  {getTypeIcon(transaction.type)}
                  <div>
                    <p className="font-medium text-card-foreground">
                      {getTypeLabel(transaction.type)}
                    </p>
                    <p className="text-xs text-muted-foreground md:text-sm">
                      {format(new Date(transaction.date), 'd. MMMM yyyy')}
                      {transaction.description && (
                        <span className="hidden md:inline"> - {transaction.description}</span>
                      )}
                    </p>
                  </div>
                </div>
                <p
                  className={cn(
                    'font-semibold',
                    getTypeAmountColor(transaction.type)
                  )}
                >
                  {formatSignedCurrency(Number(transaction.amount || 0))}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center">
          <div className="relative w-full max-w-md rounded-t-2xl border border-border bg-card p-4 md:rounded-xl md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-card-foreground md:text-xl">
                  Pridať transakciu
                </h2>
                <p className="text-sm text-muted-foreground">
                  Zaznamenaj vklad alebo výber
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-full p-2 text-muted-foreground active:bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-card-foreground">
                  Typ
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('deposit')}
                    className={cn(
                      'flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      type === 'deposit'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground active:bg-secondary/80'
                    )}
                  >
                    Vklad
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('withdraw')}
                    className={cn(
                      'flex-1 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                      type === 'withdraw'
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-secondary text-secondary-foreground active:bg-secondary/80'
                    )}
                  >
                    Výber
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground">
                  Suma (Kč)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="2000"
                  className="mt-1 w-full rounded-lg border border-input bg-input px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground">
                  Dátum
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-input bg-input px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground">
                  Popis (voliteľné)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="napr. Vklad na účet"
                  className="mt-1 w-full rounded-lg border border-input bg-input px-3 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 rounded-lg border border-border bg-secondary px-4 py-3 font-medium text-secondary-foreground active:bg-secondary/80"
                >
                  Zrušiť
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground active:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Pridávam...' : 'Pridať'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
