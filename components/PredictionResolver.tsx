'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyError, notifySuccess } from '@/lib/notifications'
import { PredictionRow } from './PredictionRow'
import { CheckCheck } from 'lucide-react'
import type { Prediction, User, Sport, League, Ticket } from '@/lib/types'

interface PredictionResolverProps {
  initialPredictions: (Prediction & { user?: User; sport?: Sport; league?: League })[]
  ticket: Ticket
}

export function PredictionResolver({ initialPredictions, ticket }: PredictionResolverProps) {
  const router = useRouter()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isProcessingAll, setIsProcessingAll] = useState(false)
  const [predictions, setPredictions] = useState(initialPredictions)

  useEffect(() => {
    setPredictions(initialPredictions)
  }, [initialPredictions])

  const updateTicketPredictions = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/tickets/${ticket.id}/predictions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      let message = 'Aktualizácia tipu zlyhala'
      try {
        const body = (await response.json()) as { error?: string }
        if (body.error) message = body.error
      } catch {
        // Keep generic message.
      }
      throw new Error(message)
    }
  }

  const handleUpdateStatus = async (predictionId: string, result: 'OK' | 'NOK') => {
    setUpdatingId(predictionId)
    const prevPredictions = predictions
    const optimisticPredictions = predictions.map((p) =>
      p.id === predictionId ? { ...p, result } : p
    )
    setPredictions(optimisticPredictions)

    try {
      await updateTicketPredictions({ predictionId, result })

      const allResolved = optimisticPredictions.every((p) => p.result !== 'Pending')
      const allOK = optimisticPredictions.every((p) => p.result === 'OK')

      const updatedPrediction = optimisticPredictions.find((p) => p.id === predictionId)
      const userName = updatedPrediction?.user?.name || 'Tipér'
      const sportName = updatedPrediction?.sport?.name || 'Neznámy šport'
      const leagueName = updatedPrediction?.league?.name || 'Neznáma liga'
      const oddsValue = Number(updatedPrediction?.odds || 0)
      const ticketStateLabel = allResolved ? (allOK ? 'výherný tiket' : 'prehratý tiket') : 'tiket čaká na ďalšie tipy'

      router.refresh()
      notifySuccess(
        'Tip bol vyhodnotený',
        `${userName} • ${sportName}/${leagueName} • kurz ${oddsValue.toFixed(2)} • ${result} • ${ticketStateLabel}`,
        `/tickets/${ticket.id}`,
      )
    } catch (error) {
      console.error('Chyba pri aktualizácii statusu:', error)
      setPredictions(prevPredictions)
      notifyError('Chyba pri aktualizácii tipu')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleMarkAllOK = async () => {
    if (!confirm('Naozaj chcete označiť všetky tipy na tomto tikete ako OK?')) return
    
    setIsProcessingAll(true)
    const prevPredictions = predictions
    setPredictions((prev) => prev.map((p) => ({ ...p, result: 'OK' })))
    try {
      await updateTicketPredictions({ action: 'markAllOK' })

      router.refresh()
      notifySuccess('Tiket označený ako výherný', ticket.description || 'Všetko OK', `/tickets/${ticket.id}`)
    } catch (error) {
      console.error('Chyba pri hromadnom vyhodnotení:', error)
      setPredictions(prevPredictions)
      notifyError('Chyba pri hromadnom vyhodnotení')
    } finally {
      setIsProcessingAll(false)
    }
  }

  const handleUpdateOdds = async (predictionId: string, newOdds: number) => {
    setUpdatingId(predictionId)
    const prevPredictions = predictions
    setPredictions((prev) =>
      prev.map((p) => (p.id === predictionId ? { ...p, odds: newOdds } : p))
    )
    try {
      await updateTicketPredictions({
        action: 'updateOdds',
        predictionId,
        odds: newOdds,
      })

      router.refresh()
      notifySuccess('Kurz bol upravený')
    } catch (error) {
      console.error('Chyba pri aktualizácii kurzu:', error)
      setPredictions(prevPredictions)
      notifyError('Chyba pri aktualizácii kurzu')
    } finally {
      setUpdatingId(null)
    }
  }

  const hasPending = predictions.some(p => p.result === 'Pending')

  return (
    <div className="space-y-4">
      {hasPending && ticket.status === 'pending' && (
        <button
          onClick={handleMarkAllOK}
          disabled={isProcessingAll}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <CheckCheck className="h-4 w-4" />
          {isProcessingAll ? 'Spracovávam...' : 'Všetko OK (Výhra)'}
        </button>
      )}

      <div className="space-y-3">
        {predictions.map((pred) => (
          <PredictionRow 
            key={pred.id} 
            prediction={pred} 
            onUpdateStatus={(result) => handleUpdateStatus(pred.id, result)}
            onUpdateOdds={(newOdds) => handleUpdateOdds(pred.id, newOdds)}
            isUpdating={updatingId === pred.id}
          />
        ))}
      </div>
    </div>
  )
}
