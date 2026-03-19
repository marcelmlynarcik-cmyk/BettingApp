'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User, Sport, League } from '@/lib/types'
import { notifyError, notifySuccess } from '@/lib/notifications'
import {
  buildProbabilityIndex,
  estimatePredictionProbability,
  estimateTicketProbability,
  type ClosedPredictionRecord,
  type TicketPredictionLike,
} from '@/lib/ticket-probability'
import { X } from 'lucide-react'

interface AddTicketFormProps {
  users: User[]
  sports: Sport[]
  leagues: League[]
  onClose: () => void
}

interface PredictionInput {
  id: string
  user_id: string
  odds: string
  sport_id: string
  league_id: string
}

interface NormalizedPrediction {
  user_id: string
  odds: number
  sport_id: string
  league_id: string
}

interface PlannedTicket {
  rank: number
  predictions: NormalizedPrediction[]
  combinedOdds: number
  probability: number | null
}

function toPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function createRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random()}`
}

function fallbackProbabilityFromOdds(odds: number) {
  const implied = 1 / Math.max(odds, 1.01)
  return Math.max(0.02, Math.min(0.98, implied))
}

function calculateCombinedOdds(predictions: NormalizedPrediction[]) {
  if (predictions.length === 0) return 0
  return predictions.reduce((acc, prediction) => acc * prediction.odds, 1)
}

function buildPlannedTickets(
  predictions: NormalizedPrediction[],
  ticketCount: number,
  statsMap: Map<string, { wins: number; total: number }>,
): PlannedTicket[] {
  if (ticketCount < 1 || predictions.length === 0) return []

  const scoredPredictions = predictions
    .map((prediction) => {
      const estimate = estimatePredictionProbability(prediction, statsMap)
      const probability = estimate?.probability ?? fallbackProbabilityFromOdds(prediction.odds)
      return { ...prediction, probability }
    })
    .sort((a, b) => b.probability - a.probability)

  const chunked = Array.from({ length: ticketCount }, () => [] as typeof scoredPredictions)
  for (let index = 0; index < scoredPredictions.length; index += 1) {
    const bucketIndex = index < ticketCount ? index : (index - ticketCount) % ticketCount
    chunked[bucketIndex].push(scoredPredictions[index])
  }
  const nonEmptyChunks = chunked.filter((chunk) => chunk.length > 0)

  return nonEmptyChunks
    .map((chunk) => {
      const ticketPredictions: TicketPredictionLike[] = chunk.map((prediction) => ({
        user_id: prediction.user_id,
        sport_id: prediction.sport_id,
        league_id: prediction.league_id,
        odds: prediction.odds,
        result: 'Pending',
      }))

      const estimatedProbability =
        estimateTicketProbability(ticketPredictions, statsMap) ??
        chunk.reduce((acc, prediction) => acc * prediction.probability, 1)

      return {
        rank: 0,
        predictions: chunk.map((prediction) => ({
          user_id: prediction.user_id,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          odds: prediction.odds,
        })),
        combinedOdds: calculateCombinedOdds(
          chunk.map((prediction) => ({
            user_id: prediction.user_id,
            sport_id: prediction.sport_id,
            league_id: prediction.league_id,
            odds: prediction.odds,
          })),
        ),
        probability: estimatedProbability,
      }
    })
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
    .map((ticket, index) => ({ ...ticket, rank: index + 1 }))
}

export function AddTicketForm({ users, sports, leagues, onClose }: AddTicketFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stake, setStake] = useState('')
  const [description, setDescription] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [ticketCount, setTicketCount] = useState('2')
  const [historicalPredictions, setHistoricalPredictions] = useState<ClosedPredictionRecord[]>([])
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [predictions, setPredictions] = useState<PredictionInput[]>(
    users.length > 0
      ? users.map((user) => ({
          id: createRowId(),
          user_id: user.id,
          odds: '',
          sport_id: '',
          league_id: '',
        }))
      : [
          {
            id: createRowId(),
            user_id: '',
            odds: '',
            sport_id: '',
            league_id: '',
          },
        ],
  )

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' })),
    [users],
  )

  const userMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) map.set(user.id, user.name)
    return map
  }, [users])

  const sortedSports = useMemo(
    () => [...sports].sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' })),
    [sports],
  )

  const parsedTicketCount = useMemo(() => {
    const parsed = Number.parseInt(ticketCount, 10)
    if (!Number.isFinite(parsed) || parsed < 2) return 2
    return Math.min(parsed, 20)
  }, [ticketCount])

  const normalizedPredictions = useMemo(
    () =>
      predictions
        .map((prediction) => ({
          user_id: prediction.user_id,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          odds: Number.parseFloat(prediction.odds),
        }))
        .filter(
          (prediction): prediction is NormalizedPrediction =>
            Boolean(prediction.user_id) &&
            Boolean(prediction.sport_id) &&
            Boolean(prediction.league_id) &&
            Number.isFinite(prediction.odds) &&
            prediction.odds > 0,
        ),
    [predictions],
  )

  const updatePrediction = (index: number, field: keyof PredictionInput, value: string) => {
    setPredictions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addPredictionRow = () => {
    setPredictions((prev) => [
      ...prev,
      {
        id: createRowId(),
        user_id: sortedUsers[0]?.id || '',
        odds: '',
        sport_id: '',
        league_id: '',
      },
    ])
  }

  const removePredictionRow = (id: string) => {
    setPredictions((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((prediction) => prediction.id !== id)
    })
  }

  useEffect(() => {
    let isActive = true

    const loadHistoricalPredictions = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('predictions')
        .select('user_id, sport_id, league_id, odds, result')
        .in('result', ['OK', 'NOK'])

      if (!isActive) return

      if (error) {
        console.error('Error fetching historical predictions:', error)
        setStatsLoaded(true)
        return
      }

      const safeRows = (data || [])
        .map((row) => ({
          user_id: String(row.user_id || ''),
          sport_id: row.sport_id ? String(row.sport_id) : null,
          league_id: row.league_id ? String(row.league_id) : null,
          odds: Number(row.odds || 0),
          result: row.result as 'OK' | 'NOK',
        }))
        .filter((row) => row.user_id && row.odds > 0)

      setHistoricalPredictions(safeRows)
      setStatsLoaded(true)
    }

    loadHistoricalPredictions()
    return () => {
      isActive = false
    }
  }, [])

  const getLeaguesForSport = (sportId: string) => {
    return leagues
      .filter((league) => league.sport_id === sportId)
      .sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' }))
  }

  const statsMap = useMemo(() => buildProbabilityIndex(historicalPredictions), [historicalPredictions])

  const predictionEstimates = useMemo(
    () =>
      predictions.map((prediction) =>
        estimatePredictionProbability(
          {
            user_id: prediction.user_id,
            sport_id: prediction.sport_id || null,
            league_id: prediction.league_id || null,
            odds: Number.parseFloat(prediction.odds),
          },
          statsMap,
        ),
      ),
    [predictions, statsMap],
  )

  const singleTicketProbability = useMemo(() => {
    if (normalizedPredictions.length === 0) return null

    const ticketPredictions: TicketPredictionLike[] = normalizedPredictions.map((prediction) => ({
      ...prediction,
      result: 'Pending',
    }))

    return estimateTicketProbability(ticketPredictions, statsMap)
  }, [normalizedPredictions, statsMap])

  const plannedTickets = useMemo(
    () => buildPlannedTickets(normalizedPredictions, parsedTicketCount, statsMap),
    [normalizedPredictions, parsedTicketCount, statsMap],
  )

  const canGenerateExactTicketCount = plannedTickets.length === parsedTicketCount

  const createOneTicket = async (
    supabase: ReturnType<typeof createClient>,
    ticketPredictions: NormalizedPrediction[],
    ticketStake: number,
    customDescription: string | null,
    url: string | null,
  ) => {
    const combinedOdds = calculateCombinedOdds(ticketPredictions)
    const possibleWin = ticketStake * combinedOdds

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        date,
        stake: ticketStake,
        combined_odds: combinedOdds,
        possible_win: possibleWin,
        ticket_url: url,
        description: customDescription,
        status: 'pending',
      })
      .select()
      .single()

    if (ticketError || !ticket) {
      console.error('Error creating ticket:', ticketError)
      return { ok: false as const, ticketId: null }
    }

    const predictionsToInsert = ticketPredictions.map((prediction) => ({
      ticket_id: ticket.id,
      user_id: prediction.user_id,
      odds: prediction.odds,
      sport_id: prediction.sport_id,
      league_id: prediction.league_id,
      tip_date: date,
      result: 'Pending',
    }))

    const { error: predictionsError } = await supabase.from('predictions').insert(predictionsToInsert)

    if (predictionsError) {
      console.error('Error creating predictions:', predictionsError)
      return { ok: false as const, ticketId: ticket.id }
    }

    const ticketTag = `[ticket:${ticket.id}]`
    const { error: transactionError } = await supabase.from('finance_transactions').insert({
      type: 'bet',
      ticket_id: ticket.id,
      amount: -ticketStake,
      date,
      description: `Stávka na tiket: ${customDescription || 'Nový tiket'} ${ticketTag}`,
    })

    if (transactionError) {
      console.error('Error creating finance transaction:', transactionError)
      return { ok: true as const, ticketId: ticket.id, financeWarning: true as const }
    }

    return { ok: true as const, ticketId: ticket.id, financeWarning: false as const }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const stakeNum = Number.parseFloat(stake)
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      notifyError('Zadaj platný vklad')
      return
    }

    if (normalizedPredictions.length === 0) {
      notifyError('Vyplň aspoň jeden platný zápas (tipér, kurz, šport, liga)')
      return
    }

    if (mode === 'multi') {
      if (normalizedPredictions.length < parsedTicketCount) {
        notifyError(`Na ${parsedTicketCount} tiketov potrebuješ aspoň ${parsedTicketCount} zápasov`)
        return
      }

      if (!canGenerateExactTicketCount) {
        notifyError('Nepodarilo sa pripraviť všetky tikety, skús upraviť počet tiketov')
        return
      }
    }

    setIsSubmitting(true)

    const supabase = createClient()

    if (mode === 'single') {
      const ticketDescription = description.trim() ? description.trim() : null
      const ticketUrlValue = ticketUrl.trim() ? ticketUrl.trim() : null

      const result = await createOneTicket(
        supabase,
        normalizedPredictions,
        stakeNum,
        ticketDescription,
        ticketUrlValue,
      )

      if (!result.ok) {
        notifyError('Tiket sa nepodarilo vytvoriť')
        setIsSubmitting(false)
        return
      }

      if (result.financeWarning) {
        notifyError('Tiket vytvorený, ale bez finančného záznamu')
      } else {
        notifySuccess('Tiket bol vytvorený', description || 'Nový tiket')
      }

      setIsSubmitting(false)
      router.refresh()
      onClose()
      return
    }

    let successCount = 0
    let financeWarningCount = 0

    for (let index = 0; index < plannedTickets.length; index += 1) {
      const plannedTicket = plannedTickets[index]
      const indexLabel = `${index + 1}/${plannedTickets.length}`
      const autoDescription = description.trim()
        ? `${description.trim()} #${index + 1}`
        : `Auto tiket ${indexLabel}`

      const result = await createOneTicket(
        supabase,
        plannedTicket.predictions,
        stakeNum,
        autoDescription,
        null,
      )

      if (result.ok) {
        successCount += 1
        if (result.financeWarning) financeWarningCount += 1
      }
    }

    setIsSubmitting(false)

    if (successCount === 0) {
      notifyError('Nepodarilo sa vytvoriť žiadny tiket')
      return
    }

    if (financeWarningCount > 0) {
      notifyError(`Vytvorených ${successCount} tiketov, ale ${financeWarningCount} bez finančného záznamu`)
    } else {
      notifySuccess('Tikety boli vytvorené', `${successCount} z ${plannedTickets.length}`)
    }

    router.refresh()
    onClose()
  }

  const singleCombinedOdds = calculateCombinedOdds(normalizedPredictions)
  const singlePossibleWin = Number.parseFloat(stake) * singleCombinedOdds

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center">
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-2xl md:rounded-xl md:p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-black md:text-xl uppercase tracking-tight">Pridať nový tiket</h2>
            <p className="text-sm text-muted-foreground font-medium">
              Manuálne alebo automaticky vygenerované poradie tiketov
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-all ${
              mode === 'single'
                ? 'border border-emerald-300 bg-emerald-500/10 text-emerald-800'
                : 'border border-border bg-secondary/40 text-muted-foreground'
            }`}
          >
            1 tiket
          </button>
          <button
            type="button"
            onClick={() => setMode('multi')}
            className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-all ${
              mode === 'multi'
                ? 'border border-emerald-300 bg-emerald-500/10 text-emerald-800'
                : 'border border-border bg-secondary/40 text-muted-foreground'
            }`}
          >
            Viac tiketov
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-black">
          <div className={`grid gap-3 ${mode === 'multi' ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
                Vklad na tiket (Kč)
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
            {mode === 'multi' && (
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Počet tiketov
                </label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  step={1}
                  value={ticketCount}
                  onChange={(e) => setTicketCount(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">
              Popis (voliteľné)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={mode === 'single' ? 'napr. Víkendové zápasy' : 'napr. Sobota balík'}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          {mode === 'single' && (
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
          )}

          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                Zápasy do balíka
              </label>
              <button
                type="button"
                onClick={addPredictionRow}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black"
              >
                + Pridať zápas
              </button>
            </div>

            <div className="space-y-3">
              {predictions.map((prediction, index) => {
                const estimate = predictionEstimates[index]
                const userName = userMap.get(prediction.user_id)

                return (
                  <div
                    key={prediction.id}
                    className="rounded-xl border border-border bg-secondary/30 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Zápas #{index + 1}
                        {userName ? <span className="text-black"> • {userName}</span> : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePredictionRow(prediction.id)}
                        disabled={predictions.length <= 1}
                        className="text-[10px] font-black uppercase tracking-wider text-rose-700 disabled:opacity-30"
                      >
                        Odstrániť
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                          Tipér
                        </label>
                        <select
                          value={prediction.user_id}
                          onChange={(e) => updatePrediction(index, 'user_id', e.target.value)}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        >
                          <option value="">Vybrať</option>
                          {sortedUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                          Kurz
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={prediction.odds}
                          onChange={(e) => updatePrediction(index, 'odds', e.target.value)}
                          placeholder="1.80"
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                          Šport
                        </label>
                        <select
                          value={prediction.sport_id}
                          onChange={(e) => {
                            updatePrediction(index, 'sport_id', e.target.value)
                            updatePrediction(index, 'league_id', '')
                          }}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        >
                          <option value="">Vybrať</option>
                          {sortedSports.map((sport) => (
                            <option key={sport.id} value={sport.id}>
                              {sport.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                          Liga
                        </label>
                        <select
                          value={prediction.league_id}
                          onChange={(e) => updatePrediction(index, 'league_id', e.target.value)}
                          disabled={!prediction.sport_id}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-50"
                        >
                          <option value="">Vybrať</option>
                          {getLeaguesForSport(prediction.sport_id).map((league) => (
                            <option key={league.id} value={league.id}>
                              {league.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      {!statsLoaded ? (
                        <p className="text-[11px] font-semibold text-emerald-800/80">Načítavam tipérske štatistiky...</p>
                      ) : estimate ? (
                        <>
                          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-800">
                            Šanca úspechu tipu: {toPercent(estimate.probability)}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-emerald-900/80">
                            Model: {estimate.sourceLabel} • vzorka {estimate.sampleSize}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] font-semibold text-emerald-800/80">
                          Vyplň tipéra, kurz, šport a ligu pre odhad šance.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="sticky bottom-0 -mx-4 border-t border-border bg-card px-4 pt-4 md:relative md:mx-0 md:border-0 md:px-0 md:pt-0">
            {mode === 'single' ? (
              <div className="rounded-xl bg-black p-4 shadow-xl">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>Celkový kurz</span>
                  <span className="text-white">{singleCombinedOdds.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Možná výhra</span>
                  <span className="max-w-[62%] break-all text-right text-lg font-black leading-tight text-emerald-500 md:text-xl">
                    {Number.isFinite(singlePossibleWin)
                      ? `${Math.floor(singlePossibleWin).toLocaleString()} Kč`
                      : '0 Kč'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Šanca tiketu</span>
                  <span className="max-w-[62%] break-all text-right text-sm font-black leading-tight text-cyan-300 md:text-base">
                    {!statsLoaded
                      ? 'Načítavam...'
                      : singleTicketProbability === null
                        ? 'Nedostatok dát'
                        : toPercent(singleTicketProbability)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-black p-4 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>Pripravené tikety</span>
                  <span className="text-white">{plannedTickets.length}/{parsedTicketCount}</span>
                </div>
                <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
                  {plannedTickets.slice(0, 4).map((ticket) => (
                    <div key={ticket.rank} className="flex items-center justify-between gap-2 text-[11px] font-bold">
                      <span className="uppercase tracking-wide text-slate-400">#{ticket.rank}</span>
                      <span className="text-slate-300">{ticket.predictions.length} záp.</span>
                      <span className="text-emerald-400">Kurz {ticket.combinedOdds.toFixed(2)}</span>
                      <span className="text-cyan-300">
                        {ticket.probability === null ? 'N/A' : toPercent(ticket.probability)}
                      </span>
                    </div>
                  ))}
                  {plannedTickets.length === 0 && (
                    <p className="text-[11px] font-semibold text-slate-400">
                      Vyplň zápasy a appka ich zoradí od najpravdepodobnejšieho tiketu po najmenej pravdepodobný.
                    </p>
                  )}
                </div>
                {!canGenerateExactTicketCount && normalizedPredictions.length > 0 && (
                  <p className="mt-3 text-[11px] font-semibold text-amber-300">
                    Aktuálne sa nedá zostaviť presne {parsedTicketCount} tiketov. Pridaj zápasy alebo zníž počet tiketov.
                  </p>
                )}
              </div>
            )}

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
                disabled={isSubmitting || (mode === 'multi' && !canGenerateExactTicketCount)}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Vytváram...'
                  : mode === 'single'
                    ? 'Vytvoriť tiket'
                    : `Vytvoriť ${parsedTicketCount} tiketov`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
