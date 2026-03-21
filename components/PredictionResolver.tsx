'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { notifyError, notifySuccess, triggerPushNotification } from '@/lib/notifications'
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
  const supabase = createClient()

  useEffect(() => {
    setPredictions(initialPredictions)
  }, [initialPredictions])

  const handleUpdateStatus = async (predictionId: string, result: 'OK' | 'NOK') => {
    setUpdatingId(predictionId)
    const prevPredictions = predictions
    const optimisticPredictions = predictions.map((p) =>
      p.id === predictionId ? { ...p, result } : p
    )
    setPredictions(optimisticPredictions)

    try {
      const { error: updateError } = await supabase
        .from('predictions')
        .update({ result })
        .eq('id', predictionId)

      if (updateError) throw updateError

      const allResolved = optimisticPredictions.every((p) => p.result !== 'Pending')
      const allOK = optimisticPredictions.every((p) => p.result === 'OK')
      const resolvedPredictions = optimisticPredictions as Prediction[]

      if (allResolved) {
        const newStatus = allOK ? 'win' : 'loss'
        const payout = allOK ? Number(ticket.stake) * Number(ticket.combined_odds) : 0
        const totalProfit = payout - Number(ticket.stake)

        await supabase
          .from('tickets')
          .update({ status: newStatus, payout })
          .eq('id', ticket.id)

        if (allOK) {
          const profitPerPred = totalProfit / resolvedPredictions.length
          for (const p of resolvedPredictions) {
            await supabase.from('predictions').update({ profit: profitPerPred }).eq('id', p.id)
          }

          const ticketTag = `[ticket:${ticket.id}]`
          await supabase.from('finance_transactions').insert({
            type: 'payout',
            ticket_id: ticket.id,
            amount: payout,
            date: new Date().toISOString().split('T')[0],
            description: `Výplata za tiket: ${ticket.description || 'Tiket'} ${ticketTag}`,
          })
        } else {
          const nokPredictions = resolvedPredictions.filter((p) => p.result === 'NOK')
          const lossPerNok = -Number(ticket.stake) / nokPredictions.length

          for (const p of resolvedPredictions) {
            const profit = p.result === 'NOK' ? lossPerNok : 0
            await supabase.from('predictions').update({ profit }).eq('id', p.id)
          }
        }

        if (allOK) {
          await triggerPushNotification({
            title: 'Výherný tiket',
            body: `${ticket.description || 'Tiket'} • výhra ${payout.toFixed(0)} Kč • čistý zisk ${totalProfit.toFixed(0)} Kč`,
            url: `/tickets/${ticket.id}`,
            tag: `ticket-win-${ticket.id}`,
          })
        }
      }

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
      // 1. Aktualizujeme všetky predikcie na OK
      await supabase
        .from('predictions')
        .update({ result: 'OK' })
        .eq('ticket_id', ticket.id)

      // 2. Prepočítame výhru
      const payout = Number(ticket.stake) * Number(ticket.combined_odds)
      const totalProfit = payout - Number(ticket.stake)
      const profitPerPred = totalProfit / initialPredictions.length

      // 3. Aktualizujeme tiket na win
      await supabase
        .from('tickets')
        .update({ status: 'win', payout })
        .eq('id', ticket.id)

      // 4. Rozdelíme profit medzi predikcie
      await supabase
        .from('predictions')
        .update({ profit: profitPerPred })
        .eq('ticket_id', ticket.id)

      // 5. Pridáme záznam do financií
      const ticketTag = `[ticket:${ticket.id}]`
      await supabase.from('finance_transactions').insert({
        type: 'payout',
        ticket_id: ticket.id,
        amount: payout,
        date: new Date().toISOString().split('T')[0],
        description: `Výplata (Všetko OK): ${ticket.description || 'Tiket'} ${ticketTag}`,
      })

      await triggerPushNotification({
        title: 'Výherný tiket',
        body: `${ticket.description || 'Tiket'} • výhra ${payout.toFixed(0)} Kč • čistý zisk ${totalProfit.toFixed(0)} Kč`,
        url: `/tickets/${ticket.id}`,
        tag: `ticket-win-${ticket.id}`,
      })

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
      const { error: updateError } = await supabase
        .from('predictions')
        .update({ odds: newOdds })
        .eq('id', predictionId)

      if (updateError) throw updateError

      const { data: allPredictions } = await supabase
        .from('predictions')
        .select('odds')
        .eq('ticket_id', ticket.id)

      if (allPredictions && allPredictions.length === 3) {
        const newCombinedOdds = allPredictions.reduce((acc, p) => acc * Number(p.odds), 1)
        const newPossibleWin = Number(ticket.stake) * newCombinedOdds

        await supabase
          .from('tickets')
          .update({ 
            combined_odds: newCombinedOdds,
            possible_win: newPossibleWin
          })
          .eq('id', ticket.id)
      }

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
