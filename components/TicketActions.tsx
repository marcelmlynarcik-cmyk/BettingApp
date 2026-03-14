'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { notifyError, notifySuccess } from '@/lib/notifications'
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

      // 1. Zmažeme tiket (cascade zmaže predictions aj finance_transactions cez ticket_id)
      const { error: deleteTicketError } = await supabase.from('tickets').delete().eq('id', ticketId)
      if (deleteTicketError) throw deleteTicketError

      // 2. Legacy fallback pre staršie (netagované) finance záznamy
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

      router.push('/tickets')
      router.refresh()
      notifySuccess('Tiket bol zmazaný', description || 'Bez popisu')
    } catch (error) {
      console.error('Chyba pri mazaní tiketu:', error)
      notifyError('Tiket sa nepodarilo zmazať')
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
