'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'

interface TicketActionsProps {
  ticketId: string
  description?: string
}

export function TicketActions({ ticketId, description }: TicketActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleDelete = async () => {
    if (!confirm(`Naozaj chcete zmazať tento tiket (${description || 'bez popisu'})?`)) {
      return
    }

    setIsDeleting(true)
    try {
      const { data: ticket, error: ticketFetchError } = await supabase
        .from('tickets')
        .select('id, date, stake, payout, description')
        .eq('id', ticketId)
        .single()

      if (ticketFetchError) throw ticketFetchError

      const ticketTag = `[ticket:${ticketId}]`

      // 1. Zmažeme nové (tagované) finančné záznamy naviazané na tiket
      const { error: deleteTaggedFinanceError } = await supabase
        .from('finance_transactions')
        .delete()
        .ilike('description', `%${ticketTag}%`)

      if (deleteTaggedFinanceError) throw deleteTaggedFinanceError

      // 2. Fallback pre staršie (netagované) záznamy
      const ticketDescription = ticket.description || 'Nový tiket'
      const payoutDescriptionBase = ticket.description || 'Tiket'
      const stakeValue = Number(ticket.stake || 0)
      const payoutValue = Number(ticket.payout || 0)

      const { error: deleteOldBetError } = await supabase
        .from('finance_transactions')
        .delete()
        .eq('type', 'bet')
        .eq('date', ticket.date)
        .eq('amount', -Math.abs(stakeValue))
        .eq('description', `Stávka na tiket: ${ticketDescription}`)

      if (deleteOldBetError) throw deleteOldBetError

      if (payoutValue > 0) {
        const { error: deleteOldPayoutErrorA } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('type', 'payout')
          .eq('amount', payoutValue)
          .eq('description', `Výplata za tiket: ${payoutDescriptionBase}`)

        if (deleteOldPayoutErrorA) throw deleteOldPayoutErrorA

        const { error: deleteOldPayoutErrorB } = await supabase
          .from('finance_transactions')
          .delete()
          .eq('type', 'payout')
          .eq('amount', payoutValue)
          .eq('description', `Výplata (Všetko OK): ${payoutDescriptionBase}`)

        if (deleteOldPayoutErrorB) throw deleteOldPayoutErrorB
      }

      // 3. Zmažeme predikcie (ak nie je nastavené cascade delete v DB)
      const { error: deletePredictionsError } = await supabase.from('predictions').delete().eq('ticket_id', ticketId)
      if (deletePredictionsError) throw deletePredictionsError

      // 4. Zmažeme samotný tiket
      const { error } = await supabase.from('tickets').delete().eq('id', ticketId)

      if (error) throw error

      router.push('/tickets')
      router.refresh()
    } catch (error) {
      console.error('Chyba pri mazaní tiketu:', error)
      alert('Tiket sa nepodarilo zmazať.')
      setIsDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-rose-600 transition-all hover:bg-rose-100 active:scale-95 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      {isDeleting ? 'Mažem...' : 'Zmazať tiket'}
    </button>
  )
}
