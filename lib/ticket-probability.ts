export interface ClosedPredictionRecord {
  user_id: string
  sport_id: string | null
  league_id: string | null
  odds: number
  result: 'OK' | 'NOK'
}

export interface PredictionLike {
  user_id: string
  sport_id: string | null
  league_id: string | null
  odds: number
}

export interface TicketPredictionLike extends PredictionLike {
  result?: 'OK' | 'NOK' | 'Pending' | string | null
}

export interface WinRateEstimate {
  probability: number
  sampleSize: number
  sourceLabel: string
}

type StatsBucket = {
  wins: number
  total: number
}

const PRIOR_WEIGHT = 12

export function getOddsBucket(odds: number) {
  if (odds <= 1.5) return '1.01-1.50'
  if (odds <= 1.8) return '1.51-1.80'
  if (odds <= 2.2) return '1.81-2.20'
  if (odds <= 3.0) return '2.21-3.00'
  return '3.01+'
}

export function buildProbabilityIndex(rows: ClosedPredictionRecord[]) {
  const map = new Map<string, StatsBucket>()

  const add = (key: string, isWin: boolean) => {
    const current = map.get(key) || { wins: 0, total: 0 }
    current.total += 1
    if (isWin) current.wins += 1
    map.set(key, current)
  }

  for (const row of rows) {
    if (!row.user_id || !Number.isFinite(row.odds) || row.odds <= 0) continue

    const isWin = row.result === 'OK'
    const bucket = getOddsBucket(row.odds)
    const user = row.user_id
    const sport = row.sport_id || 'none'
    const league = row.league_id || 'none'

    add(`u:${user}|s:${sport}|l:${league}|b:${bucket}`, isWin)
    add(`u:${user}|s:${sport}|l:${league}|b:any`, isWin)
    add(`u:${user}|s:${sport}|b:${bucket}`, isWin)
    add(`u:${user}|s:${sport}|b:any`, isWin)
    add(`u:${user}|b:${bucket}`, isWin)
    add(`u:${user}|b:any`, isWin)
    add(`global|b:${bucket}`, isWin)
    add('global|b:any', isWin)
  }

  return map
}

export function estimatePredictionProbability(
  prediction: PredictionLike,
  statsMap: Map<string, StatsBucket>,
): WinRateEstimate | null {
  const odds = Number(prediction.odds)
  if (
    !prediction.user_id ||
    !prediction.sport_id ||
    !prediction.league_id ||
    !Number.isFinite(odds) ||
    odds <= 0
  ) {
    return null
  }

  const bucket = getOddsBucket(odds)
  const global = statsMap.get('global|b:any')
  if (!global || global.total === 0) return null
  const globalRate = global.wins / global.total

  const candidateKeys = [
    { key: `u:${prediction.user_id}|s:${prediction.sport_id}|l:${prediction.league_id}|b:${bucket}`, label: 'tipér + šport + liga + kurz', minSample: 8 },
    { key: `u:${prediction.user_id}|s:${prediction.sport_id}|l:${prediction.league_id}|b:any`, label: 'tipér + šport + liga', minSample: 10 },
    { key: `u:${prediction.user_id}|s:${prediction.sport_id}|b:${bucket}`, label: 'tipér + šport + kurz', minSample: 12 },
    { key: `u:${prediction.user_id}|s:${prediction.sport_id}|b:any`, label: 'tipér + šport', minSample: 14 },
    { key: `u:${prediction.user_id}|b:${bucket}`, label: 'tipér + kurz', minSample: 16 },
    { key: `u:${prediction.user_id}|b:any`, label: 'tipér celkovo', minSample: 18 },
    { key: `global|b:${bucket}`, label: 'globálne podľa kurzu', minSample: 20 },
    { key: 'global|b:any', label: 'globálne celkovo', minSample: 1 },
  ] as const

  for (const candidate of candidateKeys) {
    const bucketStat = statsMap.get(candidate.key)
    if (!bucketStat || bucketStat.total < candidate.minSample) continue

    const smoothed = (bucketStat.wins + globalRate * PRIOR_WEIGHT) / (bucketStat.total + PRIOR_WEIGHT)
    return {
      probability: smoothed,
      sampleSize: bucketStat.total,
      sourceLabel: candidate.label,
    }
  }

  return {
    probability: globalRate,
    sampleSize: global.total,
    sourceLabel: 'globálne celkovo',
  }
}

export function estimateTicketProbability(
  predictions: TicketPredictionLike[],
  statsMap: Map<string, StatsBucket>,
) {
  const estimates = predictions
    .map((prediction) => estimatePredictionProbability(prediction, statsMap))
    .filter((estimate): estimate is WinRateEstimate => Boolean(estimate))

  if (estimates.length === 0 || estimates.length !== predictions.length) return null

  const baseProbability = estimates.reduce((acc, estimate) => acc * estimate.probability, 1)
  const allResolved = predictions.every((prediction) => prediction.result === 'OK' || prediction.result === 'NOK')

  // Keep original pre-match probability when the whole ticket is already resolved.
  if (allResolved) return baseProbability

  return predictions.reduce((acc, prediction, index) => {
    if (prediction.result === 'OK') return acc
    if (prediction.result === 'NOK') return 0
    return acc * estimates[index].probability
  }, 1)
}
