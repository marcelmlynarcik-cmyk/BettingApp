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
      // 1. Zmažeme predikcie (ak nie je nastavené cascade delete v DB)
      await supabase.from('predictions').delete().eq('ticket_id', ticketId)
      
      // 2. Zmažeme samotný tiket
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
