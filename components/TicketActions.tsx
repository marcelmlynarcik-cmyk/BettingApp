'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { notifyError, notifySuccess, triggerPushNotification } from '@/lib/notifications'
import { Edit2, Loader2, Trash2, X } from 'lucide-react'
import type { League, Prediction, Sport, Ticket, User } from '@/lib/types'

interface TicketActionsProps {
  ticketId: string
  description?: string
}

type EditablePrediction = Pick<
  Prediction,
  'id' | 'user_id' | 'odds' | 'result' | 'sport_id' | 'league_id' | 'tip_date'
>

type EditableTicket = Pick<Ticket, 'date' | 'stake' | 'description' | 'ticket_url'>

export function TicketActions({ ticketId, description }: TicketActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isLoadingEditData, setIsLoadingEditData] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [sports, setSports] = useState<Sport[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [ticketForm, setTicketForm] = useState<EditableTicket>({
    date: '',
    stake: 0,
    description: '',
    ticket_url: '',
  })
  const [predictionForms, setPredictionForms] = useState<EditablePrediction[]>([])
  const [originalTicketStatus, setOriginalTicketStatus] = useState<Ticket['status'] | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const getLeaguesForSport = (sportId: string | null) => {
    if (!sportId) return []
    return leagues.filter((league) => league.sport_id === sportId)
  }

  const updatePrediction = (
    index: number,
    field: keyof EditablePrediction,
    value: string | number | null
  ) => {
    setPredictionForms((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const computeSettlement = (predictions: EditablePrediction[], stake: number, combinedOdds: number) => {
    const allResolved = predictions.every((p) => p.result !== 'Pending')
    const allOK = predictions.every((p) => p.result === 'OK')

    const status: Ticket['status'] = allResolved ? (allOK ? 'win' : 'loss') : 'pending'
    const payout = status === 'win' ? stake * combinedOdds : 0
    const totalProfit = payout - stake

    const profitsByPredictionId: Record<string, number> = {}
    if (status === 'win' && predictions.length > 0) {
      const profitPerPrediction = totalProfit / predictions.length
      predictions.forEach((p) => {
        profitsByPredictionId[p.id] = profitPerPrediction
      })
    } else if (status === 'loss') {
      const nokPredictions = predictions.filter((p) => p.result === 'NOK')
      const lossPerNok = nokPredictions.length > 0 ? -stake / nokPredictions.length : 0
      predictions.forEach((p) => {
        profitsByPredictionId[p.id] = p.result === 'NOK' ? lossPerNok : 0
      })
    } else {
      predictions.forEach((p) => {
        profitsByPredictionId[p.id] = 0
      })
    }

    return { status, payout, profitsByPredictionId }
  }

  const handleOpenEdit = async () => {
    setIsEditOpen(true)
    setIsLoadingEditData(true)

    try {
      const [
        { data: ticket, error: ticketError },
        { data: predictions, error: predictionsError },
        { data: usersData, error: usersError },
        { data: sportsData, error: sportsError },
        { data: leaguesData, error: leaguesError },
      ] = await Promise.all([
        supabase
          .from('tickets')
          .select('date, stake, description, ticket_url, status')
          .eq('id', ticketId)
          .single(),
        supabase
          .from('predictions')
          .select('id, user_id, odds, result, sport_id, league_id, tip_date')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true }),
        supabase.from('users').select('*').order('name', { ascending: true }),
        supabase.from('sports').select('*').order('name', { ascending: true }),
        supabase.from('leagues').select('*').order('name', { ascending: true }),
      ])

      if (ticketError) throw ticketError
      if (predictionsError) throw predictionsError
      if (usersError) throw usersError
      if (sportsError) throw sportsError
      if (leaguesError) throw leaguesError

      if (!ticket) throw new Error('Ticket not found')

      setTicketForm({
        date: ticket.date,
        stake: Number(ticket.stake || 0),
        description: ticket.description || '',
        ticket_url: ticket.ticket_url || '',
      })
      setOriginalTicketStatus(ticket.status as Ticket['status'])
      setPredictionForms(
        (predictions || []).map((prediction) => ({
          id: prediction.id,
          user_id: prediction.user_id,
          odds: Number(prediction.odds || 0),
          result: prediction.result,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          tip_date: prediction.tip_date,
        }))
      )
      setUsers((usersData || []) as User[])
      setSports((sportsData || []) as Sport[])
      setLeagues((leaguesData || []) as League[])
    } catch (error) {
      console.error('Chyba pri načítaní edit dát:', error)
      notifyError('Nepodarilo sa načítať dáta tiketu')
      setIsEditOpen(false)
    } finally {
      setIsLoadingEditData(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!ticketForm.date) {
      notifyError('Dátum tiketu je povinný')
      return
    }

    const stake = Number(ticketForm.stake || 0)
    if (!Number.isFinite(stake) || stake <= 0) {
      notifyError('Vklad musí byť väčší ako 0')
      return
    }

    if (predictionForms.length === 0) {
      notifyError('Tiket musí obsahovať aspoň jeden tip')
      return
    }

    const invalidOdds = predictionForms.some((prediction) => !Number.isFinite(Number(prediction.odds)) || Number(prediction.odds) <= 1)
    if (invalidOdds) {
      notifyError('Každý kurz musí byť väčší ako 1')
      return
    }

    setIsSaving(true)

    try {
      const combinedOdds = predictionForms.reduce((acc, prediction) => acc * Number(prediction.odds), 1)
      const possibleWin = stake * combinedOdds
      const { status, payout, profitsByPredictionId } = computeSettlement(predictionForms, stake, combinedOdds)

      const { error: updateTicketError } = await supabase
        .from('tickets')
        .update({
          date: ticketForm.date,
          stake,
          combined_odds: combinedOdds,
          possible_win: possibleWin,
          payout,
          status,
          description: ticketForm.description || null,
          ticket_url: ticketForm.ticket_url || null,
        })
        .eq('id', ticketId)

      if (updateTicketError) throw updateTicketError

      for (const prediction of predictionForms) {
        const { error: updatePredictionError } = await supabase
          .from('predictions')
          .update({
            user_id: prediction.user_id,
            odds: Number(prediction.odds),
            result: prediction.result,
            sport_id: prediction.sport_id || null,
            league_id: prediction.league_id || null,
            tip_date: prediction.tip_date || null,
            profit: profitsByPredictionId[prediction.id] ?? 0,
          })
          .eq('id', prediction.id)

        if (updatePredictionError) throw updatePredictionError
      }

      const ticketTag = `[ticket:${ticketId}]`
      const ticketDescription = ticketForm.description || 'Nový tiket'
      const payoutDescription = ticketForm.description || 'Tiket'

      const { data: betTransactions, error: betTransactionsError } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('ticket_id', ticketId)
        .eq('type', 'bet')

      if (betTransactionsError) throw betTransactionsError

      if ((betTransactions || []).length > 0) {
        const { error: updateBetError } = await supabase
          .from('finance_transactions')
          .update({
            amount: -Math.abs(stake),
            date: ticketForm.date,
            description: `Stávka na tiket: ${ticketDescription} ${ticketTag}`,
          })
          .eq('ticket_id', ticketId)
          .eq('type', 'bet')

        if (updateBetError) throw updateBetError
      } else {
        const { error: insertBetError } = await supabase
          .from('finance_transactions')
          .insert({
            type: 'bet',
            ticket_id: ticketId,
            amount: -Math.abs(stake),
            date: ticketForm.date,
            description: `Stávka na tiket: ${ticketDescription} ${ticketTag}`,
          })

        if (insertBetError) throw insertBetError
      }

      const { error: deletePayoutsError } = await supabase
        .from('finance_transactions')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('type', 'payout')

      if (deletePayoutsError) throw deletePayoutsError

      if (status === 'win' && payout > 0) {
        const { error: insertPayoutError } = await supabase
          .from('finance_transactions')
          .insert({
            type: 'payout',
            ticket_id: ticketId,
            amount: payout,
            date: ticketForm.date,
            description: `Výplata za tiket: ${payoutDescription} ${ticketTag}`,
          })

        if (insertPayoutError) throw insertPayoutError
      }

      notifySuccess('Tiket bol upravený', ticketForm.description || 'Bez popisu')

      if (originalTicketStatus !== 'win' && status === 'win') {
        await triggerPushNotification({
          title: 'Výherný tiket',
          body: `${ticketForm.description || 'Tiket'} je vyhodnotený ako výherný`,
          url: `/tickets/${ticketId}`,
          tag: `ticket-win-${ticketId}`,
        })
      }

      setIsEditOpen(false)
      router.refresh()
    } catch (error) {
      console.error('Chyba pri editácii tiketu:', error)
      notifyError('Tiket sa nepodarilo upraviť')
    } finally {
      setIsSaving(false)
    }
  }

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
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenEdit}
          disabled={isLoadingEditData}
          className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-sky-700 transition-all hover:bg-sky-100 active:scale-95 disabled:opacity-50"
        >
          {isLoadingEditData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
          Upraviť tiket
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-rose-600 transition-all hover:bg-rose-100 active:scale-95 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {isDeleting ? 'Mažem...' : 'Zmazať tiket'}
        </button>
      </div>

      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center">
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-4xl md:rounded-xl md:p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-black md:text-xl uppercase tracking-tight">Upraviť tiket</h2>
                <p className="text-sm text-muted-foreground font-medium">
                  Kompletná editácia tiketu a tipov
                </p>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="rounded-full p-2 text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoadingEditData ? (
              <div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Načítavam dáta tiketu...
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Dátum
                    </label>
                    <input
                      type="date"
                      value={ticketForm.date}
                      onChange={(e) => setTicketForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Vklad (Kč)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={ticketForm.stake}
                      onChange={(e) => setTicketForm((prev) => ({ ...prev, stake: Number(e.target.value || 0) }))}
                      className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Popis
                    </label>
                    <input
                      type="text"
                      value={ticketForm.description || ''}
                      onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                      URL tiketu
                    </label>
                    <input
                      type="url"
                      value={ticketForm.ticket_url || ''}
                      onChange={(e) => setTicketForm((prev) => ({ ...prev, ticket_url: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tipy</h3>
                  {predictionForms.map((prediction, index) => (
                    <div
                      key={prediction.id}
                      className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Tipér
                          </label>
                          <select
                            value={prediction.user_id}
                            onChange={(e) => updatePrediction(index, 'user_id', e.target.value)}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          >
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Kurz
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={prediction.odds}
                            onChange={(e) => updatePrediction(index, 'odds', Number(e.target.value || 0))}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Výsledok
                          </label>
                          <select
                            value={prediction.result}
                            onChange={(e) => updatePrediction(index, 'result', e.target.value as Prediction['result'])}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          >
                            <option value="Pending">Pending</option>
                            <option value="OK">OK</option>
                            <option value="NOK">NOK</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Šport
                          </label>
                          <select
                            value={prediction.sport_id || ''}
                            onChange={(e) => {
                              updatePrediction(index, 'sport_id', e.target.value || null)
                              updatePrediction(index, 'league_id', '')
                            }}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          >
                            <option value="">Vybrať</option>
                            {sports.map((sport) => (
                              <option key={sport.id} value={sport.id}>
                                {sport.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Liga
                          </label>
                          <select
                            value={prediction.league_id || ''}
                            onChange={(e) => updatePrediction(index, 'league_id', e.target.value || null)}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          >
                            <option value="">Vybrať</option>
                            {getLeaguesForSport(prediction.sport_id).map((league) => (
                              <option key={league.id} value={league.id}>
                                {league.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                            Dátum tipu
                          </label>
                          <input
                            type="date"
                            value={prediction.tip_date || ''}
                            onChange={(e) => updatePrediction(index, 'tip_date', e.target.value)}
                            className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="flex-1 rounded-lg border border-border bg-secondary px-4 py-3 font-medium text-secondary-foreground active:bg-secondary/80"
                  >
                    Zrušiť
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground active:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Ukladám...' : 'Uložiť zmeny'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
