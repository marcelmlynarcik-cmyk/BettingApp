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
  currentBankroll: number
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

interface GeneratedTicket {
  rank: number
  predictions: NormalizedPrediction[]
  combinedOdds: number
  probability: number
}

type StatsMap = Map<string, { wins: number; total: number }>

function toPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function createRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random()}`
}

function makePrediction(userId: string) {
  return {
    id: createRowId(),
    user_id: userId,
    odds: '',
    sport_id: '',
    league_id: '',
  }
}

function fallbackProbabilityFromOdds(odds: number) {
  const implied = 1 / Math.max(odds, 1.01)
  return Math.max(0.02, Math.min(0.98, implied))
}

function calculateCombinedOdds(predictions: NormalizedPrediction[]) {
  if (predictions.length === 0) return 0
  return predictions.reduce((acc, prediction) => acc * prediction.odds, 1)
}

function normalizePrediction(input: PredictionInput): NormalizedPrediction | null {
  const odds = Number.parseFloat(input.odds)
  if (!input.user_id || !input.sport_id || !input.league_id) return null
  if (!Number.isFinite(odds) || odds <= 0) return null

  return {
    user_id: input.user_id,
    sport_id: input.sport_id,
    league_id: input.league_id,
    odds,
  }
}

function getEstimateProbability(prediction: NormalizedPrediction, statsMap: StatsMap) {
  const estimate = estimatePredictionProbability(prediction, statsMap)
  return estimate?.probability ?? fallbackProbabilityFromOdds(prediction.odds)
}

function buildTicketsFromUserRows(
  users: User[],
  rowsByUser: Record<string, PredictionInput[]>,
  ticketCount: number,
  statsMap: StatsMap,
): GeneratedTicket[] {
  if (ticketCount < 1 || users.length === 0) return []

  const perUserSorted = users.map((user) => {
    const rows = rowsByUser[user.id] || []
    const normalized = rows.map(normalizePrediction).filter((row): row is NormalizedPrediction => Boolean(row))

    if (normalized.length < ticketCount) return null

    return normalized
      .map((prediction) => ({
        prediction,
        probability: getEstimateProbability(prediction, statsMap),
      }))
      .sort((a, b) => b.probability - a.probability)
  })

  if (perUserSorted.some((group) => group === null)) return []

  const generated = Array.from({ length: ticketCount }, (_, index) => {
    const picks = perUserSorted.map((group) => group![index])

    const ticketPredictions: TicketPredictionLike[] = picks.map((pick) => ({
      ...pick.prediction,
      result: 'Pending',
    }))

    const estimatedProbability =
      estimateTicketProbability(ticketPredictions, statsMap) ?? picks.reduce((acc, pick) => acc * pick.probability, 1)

    const predictions = picks.map((pick) => pick.prediction)

    return {
      rank: 0,
      predictions,
      combinedOdds: calculateCombinedOdds(predictions),
      probability: estimatedProbability,
    }
  })

  return generated
    .sort((a, b) => b.probability - a.probability)
    .map((ticket, index) => ({ ...ticket, rank: index + 1 }))
}

export function AddTicketForm({ users, sports, leagues, currentBankroll, onClose }: AddTicketFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [stake, setStake] = useState('')
  const [description, setDescription] = useState('')
  const [ticketUrl, setTicketUrl] = useState('')
  const [ticketCount, setTicketCount] = useState('3')
  const [historicalPredictions, setHistoricalPredictions] = useState<ClosedPredictionRecord[]>([])
  const [statsLoaded, setStatsLoaded] = useState(false)

  const defaultSingleRows = useMemo(
    () =>
      Array.from({ length: 3 }, (_, index) => {
        const userId = users[index % Math.max(users.length, 1)]?.id || ''
        return makePrediction(userId)
      }),
    [users],
  )

  const [singlePredictions, setSinglePredictions] = useState<PredictionInput[]>(defaultSingleRows)

  useEffect(() => {
    setSinglePredictions(defaultSingleRows)
  }, [defaultSingleRows])

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' })),
    [users],
  )

  const sortedSports = useMemo(
    () => [...sports].sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' })),
    [sports],
  )

  const userMap = useMemo(() => {
    const map = new Map<string, User>()
    for (const user of users) map.set(user.id, user)
    return map
  }, [users])

  const parsedTicketCount = useMemo(() => {
    const parsed = Number.parseInt(ticketCount, 10)
    if (!Number.isFinite(parsed) || parsed < 2) return 2
    return Math.min(parsed, 20)
  }, [ticketCount])

  const [multiRowsByUser, setMultiRowsByUser] = useState<Record<string, PredictionInput[]>>({})

  useEffect(() => {
    setMultiRowsByUser((previous) => {
      const next: Record<string, PredictionInput[]> = {}

      for (const user of sortedUsers) {
        const currentRows = previous[user.id] || []
        const filled = Array.from({ length: parsedTicketCount }, (_, index) => {
          if (currentRows[index]) {
            return {
              ...currentRows[index],
              user_id: user.id,
            }
          }
          return makePrediction(user.id)
        })
        next[user.id] = filled
      }

      return next
    })
  }, [parsedTicketCount, sortedUsers])

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

  const updateSinglePrediction = (index: number, field: keyof PredictionInput, value: string) => {
    setSinglePredictions((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const updateMultiPrediction = (userId: string, rowIndex: number, field: keyof PredictionInput, value: string) => {
    setMultiRowsByUser((prev) => {
      const rows = [...(prev[userId] || [])]
      if (!rows[rowIndex]) rows[rowIndex] = makePrediction(userId)
      rows[rowIndex] = { ...rows[rowIndex], [field]: value }
      return {
        ...prev,
        [userId]: rows,
      }
    })
  }

  const singleEstimates = useMemo(
    () =>
      singlePredictions.map((prediction) =>
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
    [singlePredictions, statsMap],
  )

  const singleNormalized = useMemo(
    () => singlePredictions.map(normalizePrediction).filter((p): p is NormalizedPrediction => Boolean(p)),
    [singlePredictions],
  )

  const singleIsComplete = singleNormalized.length === 3

  const singleCombinedOdds = useMemo(() => calculateCombinedOdds(singleNormalized), [singleNormalized])

  const singleTicketProbability = useMemo(() => {
    if (!singleIsComplete) return null
    const ticketPredictions: TicketPredictionLike[] = singleNormalized.map((prediction) => ({
      ...prediction,
      result: 'Pending',
    }))
    return estimateTicketProbability(ticketPredictions, statsMap)
  }, [singleIsComplete, singleNormalized, statsMap])

  const multiTickets = useMemo(
    () => buildTicketsFromUserRows(sortedUsers, multiRowsByUser, parsedTicketCount, statsMap),
    [sortedUsers, multiRowsByUser, parsedTicketCount, statsMap],
  )

  const canGenerateAllMultiTickets = multiTickets.length === parsedTicketCount

  const stakePerGeneratedTicket = useMemo(() => {
    if (currentBankroll < 200) return 50
    return Number((currentBankroll * 0.1).toFixed(2))
  }, [currentBankroll])

  const multiTotalStake = stakePerGeneratedTicket * parsedTicketCount

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
      return { ok: false as const, financeWarning: false as const }
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
      return { ok: false as const, financeWarning: false as const }
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
      return { ok: true as const, financeWarning: true as const }
    }

    return { ok: true as const, financeWarning: false as const }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsSubmitting(true)
    const supabase = createClient()

    if (mode === 'single') {
      const stakeNum = Number.parseFloat(stake)

      if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
        notifyError('Zadaj platný vklad')
        setIsSubmitting(false)
        return
      }

      if (!singleIsComplete) {
        notifyError('Pri jednom tikete musia byť vyplnené presne 3 zápasy')
        setIsSubmitting(false)
        return
      }

      const ticketDescription = description.trim() ? description.trim() : null
      const ticketUrlValue = ticketUrl.trim() ? ticketUrl.trim() : null
      const result = await createOneTicket(supabase, singleNormalized, stakeNum, ticketDescription, ticketUrlValue)

      if (!result.ok) {
        notifyError('Tiket sa nepodarilo vytvoriť')
      } else if (result.financeWarning) {
        notifyError('Tiket vytvorený, ale bez finančného záznamu')
      } else {
        notifySuccess('Tiket bol vytvorený', ticketDescription || 'Nový tiket')
      }

      setIsSubmitting(false)
      router.refresh()
      onClose()
      return
    }

    if (!canGenerateAllMultiTickets) {
      notifyError('Vyplň pre každého tipéra všetky riadky (šport, liga, kurz), aby sa dali vytvoriť tikety')
      setIsSubmitting(false)
      return
    }

    let successCount = 0
    let financeWarningCount = 0

    for (let index = 0; index < multiTickets.length; index += 1) {
      const ticket = multiTickets[index]
      const autoDescription = description.trim()
        ? `${description.trim()} #${index + 1}`
        : `Auto tiket #${index + 1}`

      const result = await createOneTicket(
        supabase,
        ticket.predictions,
        stakePerGeneratedTicket,
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
      notifyError('Nepodarilo sa podať žiadny tiket')
      return
    }

    if (financeWarningCount > 0) {
      notifyError(`Podaných ${successCount} tiketov, ale ${financeWarningCount} bez finančného záznamu`)
    } else {
      notifySuccess('Tikety podané', `${successCount} z ${multiTickets.length}`)
    }

    router.refresh()
    onClose()
  }

  const singlePossibleWin = Number.parseFloat(stake) * singleCombinedOdds

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm md:items-center">
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 md:max-w-3xl md:rounded-xl md:p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-black md:text-xl uppercase tracking-tight">Pridať nový tiket</h2>
            <p className="text-sm text-muted-foreground font-medium">1 tiket fixne 3 zápasy alebo automatické podanie viacerých tiketov</p>
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
            1 tiket (3 zápasy)
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
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Dátum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            {mode === 'single' ? (
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Vklad (Kč)</label>
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
            ) : (
              <>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Počet tiketov</label>
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
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Vklad na tiket (auto)</label>
                  <div className="mt-1 rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-black">
                    {stakePerGeneratedTicket.toFixed(2)} Kč
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Popis (voliteľné)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={mode === 'single' ? 'napr. Víkendový tiket' : 'napr. Sobota balík'}
              className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          {mode === 'single' && (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">URL tiketu (voliteľné)</label>
              <input
                type="url"
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
          )}

          {mode === 'single' ? (
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">3 zápasy (fixné)</p>
              {singlePredictions.map((prediction, index) => {
                const estimate = singleEstimates[index]
                const userName = userMap.get(prediction.user_id)?.name

                return (
                  <div key={prediction.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      Zápas #{index + 1}{userName ? <span className="text-black"> • {userName}</span> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Tipér</label>
                        <select
                          value={prediction.user_id}
                          onChange={(e) => updateSinglePrediction(index, 'user_id', e.target.value)}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        >
                          <option value="">Vybrať</option>
                          {sortedUsers.map((user) => (
                            <option key={user.id} value={user.id}>{user.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Kurz</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={prediction.odds}
                          onChange={(e) => updateSinglePrediction(index, 'odds', e.target.value)}
                          placeholder="1.80"
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Šport</label>
                        <select
                          value={prediction.sport_id}
                          onChange={(e) => {
                            updateSinglePrediction(index, 'sport_id', e.target.value)
                            updateSinglePrediction(index, 'league_id', '')
                          }}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        >
                          <option value="">Vybrať</option>
                          {sortedSports.map((sport) => (
                            <option key={sport.id} value={sport.id}>{sport.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Liga</label>
                        <select
                          value={prediction.league_id}
                          onChange={(e) => updateSinglePrediction(index, 'league_id', e.target.value)}
                          disabled={!prediction.sport_id}
                          className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-50"
                        >
                          <option value="">Vybrať</option>
                          {getLeaguesForSport(prediction.sport_id).map((league) => (
                            <option key={league.id} value={league.id}>{league.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                      {!statsLoaded ? (
                        <p className="text-[11px] font-semibold text-emerald-800/80">Načítavam tipérske štatistiky...</p>
                      ) : estimate ? (
                        <>
                          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-800">Šanca úspechu tipu: {toPercent(estimate.probability)}</p>
                          <p className="mt-0.5 text-[11px] font-medium text-emerald-900/80">Model: {estimate.sourceLabel} • vzorka {estimate.sampleSize}</p>
                        </>
                      ) : (
                        <p className="text-[11px] font-semibold text-emerald-800/80">Vyplň tipéra, kurz, šport a ligu.</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Bank: {currentBankroll.toFixed(2)} Kč • Pravidlo vkladu: {currentBankroll < 200 ? '50 Kč na tiket (bank pod 200 Kč)' : '10% banku na tiket'}
              </div>

              {sortedUsers.map((user) => {
                const rows = multiRowsByUser[user.id] || []
                return (
                  <div key={user.id} className="rounded-xl border border-border bg-secondary/20 p-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                      {user.name}: {parsedTicketCount} riadkov
                    </p>

                    <div className="space-y-2">
                      {rows.map((row, rowIndex) => (
                        <div key={row.id} className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-white p-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Kurz #{rowIndex + 1}</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={row.odds}
                              onChange={(e) => updateMultiPrediction(user.id, rowIndex, 'odds', e.target.value)}
                              placeholder="1.80"
                              className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Šport</label>
                            <select
                              value={row.sport_id}
                              onChange={(e) => {
                                updateMultiPrediction(user.id, rowIndex, 'sport_id', e.target.value)
                                updateMultiPrediction(user.id, rowIndex, 'league_id', '')
                              }}
                              className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                            >
                              <option value="">Vybrať</option>
                              {sortedSports.map((sport) => (
                                <option key={sport.id} value={sport.id}>{sport.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">Liga</label>
                            <select
                              value={row.league_id}
                              onChange={(e) => updateMultiPrediction(user.id, rowIndex, 'league_id', e.target.value)}
                              disabled={!row.sport_id}
                              className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-50"
                            >
                              <option value="">Vybrať</option>
                              {getLeaguesForSport(row.sport_id).map((league) => (
                                <option key={league.id} value={league.id}>{league.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              <div className="rounded-xl bg-black p-4 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                  <span>Vygenerované tikety</span>
                  <span className="text-white">{multiTickets.length}/{parsedTicketCount}</span>
                </div>

                <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
                  {multiTickets.map((ticket) => (
                    <div key={ticket.rank} className="rounded-lg border border-slate-800 px-2 py-2">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="uppercase tracking-wide text-slate-400">#{ticket.rank}</span>
                        <span className="text-emerald-400">Kurz {ticket.combinedOdds.toFixed(2)}</span>
                        <span className="text-cyan-300">{toPercent(ticket.probability)}</span>
                        <span className="text-amber-300">Vklad {stakePerGeneratedTicket.toFixed(2)} Kč</span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {ticket.predictions.map((prediction) => userMap.get(prediction.user_id)?.name || 'Tipér').join(' • ')}
                      </p>
                    </div>
                  ))}

                  {multiTickets.length === 0 && (
                    <p className="text-[11px] font-semibold text-slate-400">
                      Vyplň pre každého tipéra všetky riadky, potom sa zobrazia tikety zoradené od najpravdepodobnejšieho.
                    </p>
                  )}
                </div>

                <div className="mt-3 border-t border-slate-800 pt-2 text-[11px] font-bold text-slate-300">
                  Celkový vklad: {multiTotalStake.toFixed(2)} Kč
                </div>
              </div>
            </div>
          )}

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
                    {Number.isFinite(singlePossibleWin) ? `${Math.floor(singlePossibleWin).toLocaleString()} Kč` : '0 Kč'}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Šanca tiketu</span>
                  <span className="max-w-[62%] break-all text-right text-sm font-black leading-tight text-cyan-300 md:text-base">
                    {!statsLoaded ? 'Načítavam...' : singleTicketProbability === null ? 'Nedostatok dát' : toPercent(singleTicketProbability)}
                  </span>
                </div>
              </div>
            ) : null}

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
                disabled={isSubmitting || (mode === 'multi' && !canGenerateAllMultiTickets) || (mode === 'single' && !singleIsComplete)}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? 'Podávam...' : mode === 'single' ? 'Podať tiket' : 'Podať tikety'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
