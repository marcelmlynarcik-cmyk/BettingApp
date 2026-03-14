'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User, Sport, League } from '@/lib/types'
import { Plus, Trash2, X } from 'lucide-react'

interface AddTicketFormProps {
  users: User[]
  sports: Sport[]
  leagues: League[]
  onClose: () => void
}

interface PredictionInput {
  user_id: string
  odds: string
  sport_id: string
  league_id: string
}

export function AddTicketForm({ users, sports, leagues, onClose }: AddTicketFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stake, setStake] = useState('')
  const [description, setDescription] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [predictions, setPredictions] = useState<PredictionInput[]>(
    users.map((user) => ({
      user_id: user.id,
      odds: '',
      sport_id: '',
      league_id: '',
    }))
  )

  const updatePrediction = (
    index: number,
    field: keyof PredictionInput,
    value: string
  ) => {
    setPredictions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const getLeaguesForSport = (sportId: string) => {
    return leagues.filter((l) => l.sport_id === sportId)
  }

  const calculateCombinedOdds = () => {
    const validOdds = predictions
      .map((p) => parseFloat(p.odds))
      .filter((o) => !isNaN(o) && o > 0)
    if (validOdds.length < 3) return 0
    return validOdds.reduce((acc, odd) => acc * odd, 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()
    const combinedOdds = calculateCombinedOdds()
    const stakeNum = parseFloat(stake)
    const possibleWin = stakeNum * combinedOdds

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        date,
        stake: stakeNum,
        combined_odds: combinedOdds,
        possible_win: possibleWin,
        ticket_url: ticketUrl || null,
        description: description || null,
        status: 'pending',
      })
      .select()
      .single()

    if (ticketError || !ticket) {
      console.error('Error creating ticket:', ticketError)
      setIsSubmitting(false)
      return
    }

    const predictionsToInsert = predictions
      .filter((p) => p.user_id && p.odds)
      .map((p) => ({
        ticket_id: ticket.id,
        user_id: p.user_id,
        odds: parseFloat(p.odds),
        sport_id: p.sport_id || null,
        league_id: p.league_id || null,
        tip_date: date,
        result: 'Pending',
      }))

    if (predictionsToInsert.length > 0) {
      const { error: predError } = await supabase
        .from('predictions')
        .insert(predictionsToInsert)

      if (predError) {
        console.error('Error creating predictions:', predError)
      }
    }

    // Create a finance transaction for the bet
    const ticketTag = `[ticket:${ticket.id}]`
    const { error: transError } = await supabase
      .from('finance_transactions')
      .insert({
        type: 'bet',
        amount: -stakeNum,
        date,
        description: `Stávka na tiket: ${description || 'Nový tiket'} ${ticketTag}`,
      })

    if (transError) {
      console.error('Error creating finance transaction:', transError)
    }

    setIsSubmitting(false)
    router.refresh()
    onClose()
  }

  const combinedOdds = calculateCombinedOdds()
  const possibleWin = parseFloat(stake) * combinedOdds

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center">
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-2xl md:rounded-xl md:p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-black md:text-xl uppercase tracking-tight">Pridať nový tiket</h2>
            <p className="text-sm text-muted-foreground font-medium">
              Vytvor nový stávkový tiket
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-black">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                Dátum
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
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
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                required
                placeholder="200"
                className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
              Popis (voliteľné)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="napr. Víkendové zápasy"
              className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
              URL tiketu (voliteľné)
            </label>
            <input
              type="url"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Tipy tipérov
              </label>
            </div>

            <div className="space-y-3">
              {predictions.map((pred, index) => {
                const user = users.find((u) => u.id === pred.user_id)
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-border bg-secondary/30 p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Tipuje: <span className="text-black">{user?.name}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                          Kurz
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={pred.odds}
                          onChange={(e) =>
                            updatePrediction(index, 'odds', e.target.value)
                          }
                          required
                          placeholder="1.80"
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                          Šport
                        </label>
                        <select
                          value={pred.sport_id}
                          onChange={(e) => {
                            updatePrediction(index, 'sport_id', e.target.value)
                            updatePrediction(index, 'league_id', '')
                          }}
                          required
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
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">
                          Liga
                        </label>
                        <select
                          value={pred.league_id}
                          onChange={(e) =>
                            updatePrediction(index, 'league_id', e.target.value)
                          }
                          disabled={!pred.sport_id}
                          required
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-50"
                        >
                          <option value="">Vybrať</option>
                          {getLeaguesForSport(pred.sport_id).map((league) => (
                            <option key={league.id} value={league.id}>
                              {league.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-border bg-card px-4 pt-4 md:relative md:mx-0 md:border-0 md:px-0 md:pt-0">
            <div className="rounded-xl bg-black p-4 shadow-xl">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                <span>Celkový kurz</span>
                <span className="text-white">
                  {combinedOdds.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Možná výhra</span>
                <span className="text-xl font-black text-emerald-500">
                  {isNaN(possibleWin) ? '0' : Math.floor(possibleWin).toLocaleString()} Kč
                </span>
              </div>
            </div>

            <div className="mt-4 flex gap-3 pb-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-border bg-secondary px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hover:bg-slate-200 transition-all active:scale-95"
              >
                Zrušiť
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? 'Vytváram...' : 'Vytvoriť tiket'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
