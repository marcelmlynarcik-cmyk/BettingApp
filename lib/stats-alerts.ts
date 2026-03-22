'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { notifySuccess, triggerPushNotification } from '@/lib/notifications'

type TicketSnapshot = {
  id: string
  status: 'win' | 'loss' | 'pending'
  date: string
  stake: number
  payout: number
  created_at: string
}

type CashflowSnapshot = {
  amount: number
}

type PredictionSnapshot = {
  id: string
  user_id: string
  result: 'OK' | 'NOK' | 'Pending'
  odds: number | string | null
  created_at: string
  user?: { name?: string | null } | null
}

type StatsAlertState = {
  athBankroll: number | null
  cooldowns: Record<string, string>
  lastStreakKey?: string
  lastHitRateMilestone?: number
  lastWeeklyReportKey?: string
  milestoneTracker?: {
    teamTickets: number
    teamProfit: number
    teamTurnover: number
    userOkTips: Record<string, number>
    userHitRate: Record<string, number>
    userWonOdds: Record<string, number>
  }
}

const STORAGE_KEY = 'bettracker.stats-alerts.v1'
const ALERT_COOLDOWN_HOURS = 24
const DRAWDOWN_ALERT_PCT = 10
const STREAK_ALERT_MIN = 3
const HIT_RATE_MILESTONE_STEP = 500
const PERSONAL_OK_TIPS_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const PERSONAL_HIT_RATE_MILESTONES = [55, 60, 65, 70]
const PERSONAL_HIT_RATE_MIN_SAMPLE = 40
const TEAM_TICKET_MILESTONES = [25, 50, 100, 200, 300, 500, 750, 1000]
const TEAM_PROFIT_MILESTONES = [10000, 25000, 50000, 100000]
const MILESTONE_ALERT_BUDGET = 4

function defaultMilestoneTracker() {
  return {
    teamTickets: 0,
    teamProfit: 0,
    teamTurnover: 0,
    userOkTips: {} as Record<string, number>,
    userHitRate: {} as Record<string, number>,
    userWonOdds: {} as Record<string, number>,
  }
}

function nowIso() {
  return new Date().toISOString()
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function readState(): StatsAlertState {
  if (typeof window === 'undefined') {
    return { athBankroll: null, cooldowns: {} }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { athBankroll: null, cooldowns: {} }
    const parsed = JSON.parse(raw) as StatsAlertState
    return {
      athBankroll: parsed.athBankroll ?? null,
      cooldowns: parsed.cooldowns || {},
      lastStreakKey: parsed.lastStreakKey,
      lastHitRateMilestone: parsed.lastHitRateMilestone,
      lastWeeklyReportKey: parsed.lastWeeklyReportKey,
      milestoneTracker: {
        ...defaultMilestoneTracker(),
        ...(parsed.milestoneTracker || {}),
        userOkTips: parsed.milestoneTracker?.userOkTips || {},
        userHitRate: parsed.milestoneTracker?.userHitRate || {},
        userWonOdds: parsed.milestoneTracker?.userWonOdds || {},
      },
    }
  } catch {
    return { athBankroll: null, cooldowns: {} }
  }
}

function writeState(state: StatsAlertState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function toAmount(value: number) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(0)} Kč`
}

function toPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function canFireCooldown(state: StatsAlertState, key: string, hours = ALERT_COOLDOWN_HOURS) {
  const last = state.cooldowns[key]
  if (!last) return true
  const diff = Date.now() - new Date(last).getTime()
  return diff >= hours * 60 * 60 * 1000
}

function setCooldown(state: StatsAlertState, key: string) {
  state.cooldowns[key] = nowIso()
}

async function fireAlert(
  state: StatsAlertState,
  key: string,
  title: string,
  body: string,
  url: string,
  cooldownHours = ALERT_COOLDOWN_HOURS,
) {
  if (!canFireCooldown(state, key, cooldownHours)) return false

  notifySuccess(title, body, url)
  await triggerPushNotification({
    title,
    body,
    url,
    tag: `stats-${key}`,
  })
  setCooldown(state, key)
  return true
}

function getIsoWeekKey(input = new Date()) {
  const date = new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getHighestFixedMilestone(current: number, milestones: number[]) {
  return [...milestones].reverse().find((milestone) => current >= milestone) || 0
}

function roundToStep(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function getNextWonOddsMilestoneFrom(lastMilestone: number | null) {
  if (lastMilestone === null) return 2
  if (lastMilestone < 2) return roundToStep(lastMilestone + 0.05)
  if (lastMilestone < 3) return roundToStep(lastMilestone + 0.1)
  if (lastMilestone < 5) return roundToStep(lastMilestone + 0.15)
  return roundToStep(lastMilestone + 0.25)
}

function getHighestWonOddsMilestone(current: number) {
  if (current <= 0) return 0

  let achieved = 0
  let next = getNextWonOddsMilestoneFrom(null)
  let guard = 0
  while (next <= current && guard < 1000) {
    achieved = next
    next = getNextWonOddsMilestoneFrom(next)
    guard += 1
  }

  return achieved
}

function getPreviousTeamTurnoverMilestone(current: number) {
  if (current < 5000) return 0
  if (current <= 50000) return Math.floor(current / 5000) * 5000
  if (current <= 200000) return 50000 + Math.floor((current - 50000) / 10000) * 10000
  return 200000 + Math.floor((current - 200000) / 25000) * 25000
}

export async function evaluateAndTriggerStatsAlerts(
  supabase: SupabaseClient,
  contextUrl = '/statistics',
) {
  try {
    const [{ data: ticketsData }, { data: cashflowData }, { data: predictionsData }] = await Promise.all([
      supabase.from('tickets').select('id, status, date, stake, payout, created_at').order('created_at', { ascending: true }),
      supabase.from('finance_transactions').select('amount').in('type', ['deposit', 'withdraw']),
      supabase
        .from('predictions')
        .select('id, user_id, result, odds, created_at, user:users(name)')
        .in('result', ['OK', 'NOK'])
        .order('created_at', { ascending: false }),
    ])

    const tickets = ((ticketsData || []) as TicketSnapshot[]).map((ticket) => ({
      ...ticket,
      stake: Number(ticket.stake || 0),
      payout: Number(ticket.payout || 0),
    }))
    const cashflow = ((cashflowData || []) as CashflowSnapshot[]).map((row) => Number(row.amount || 0))
    const predictions = (predictionsData || []) as PredictionSnapshot[]

    const resolvedTickets = tickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
    const totalStake = resolvedTickets.reduce((sum, ticket) => sum + ticket.stake, 0)
    const totalPayout = resolvedTickets.reduce((sum, ticket) => sum + ticket.payout, 0)
    const totalCashflow = cashflow.reduce((sum, amount) => sum + amount, 0)
    const bankroll = totalPayout + totalCashflow - totalStake
    const teamProfit = resolvedTickets.reduce((sum, ticket) => sum + (ticket.payout - ticket.stake), 0)
    const teamTurnover = tickets.reduce((sum, ticket) => sum + Math.max(0, Number(ticket.stake || 0)), 0)

    const state = readState()
    if (!state.milestoneTracker) state.milestoneTracker = defaultMilestoneTracker()
    if (state.athBankroll === null) {
      state.athBankroll = bankroll
      writeState(state)
      return
    }

    let alertsSent = 0
    const wins = resolvedTickets.filter((ticket) => ticket.status === 'win').length
    const losses = resolvedTickets.length - wins
    const hitRate = resolvedTickets.length > 0 ? (wins / resolvedTickets.length) * 100 : 0
    let milestoneAlertsSent = 0

    const fireMilestoneAlert = async (key: string, title: string, body: string, url = '/ranking') => {
      if (milestoneAlertsSent >= MILESTONE_ALERT_BUDGET) return false
      const fired = await fireAlert(state, key, title, body, url, 1)
      if (fired) {
        alertsSent += 1
        milestoneAlertsSent += 1
      }
      return fired
    }

    if (bankroll > state.athBankroll + 1) {
      const delta = bankroll - state.athBankroll
      const fired = await fireAlert(
        state,
        'ath-bankroll',
        'Nové maximum bankrollu',
        `Bankroll: ${bankroll.toFixed(0)} Kč (${toAmount(delta)} oproti predošlému maximu)`,
        '/statistics',
        6,
      )
      if (fired) alertsSent += 1
      state.athBankroll = bankroll
    }

    if (state.athBankroll > 0) {
      const drawdownPct = ((state.athBankroll - bankroll) / state.athBankroll) * 100
      if (drawdownPct >= DRAWDOWN_ALERT_PCT) {
        const fired = await fireAlert(
          state,
          'drawdown',
          'Pozor na drawdown',
          `Bankroll je ${toPercent(drawdownPct)} pod maximom (${bankroll.toFixed(0)} Kč)`,
          '/statistics',
        )
        if (fired) alertsSent += 1
      }
    }

    if (resolvedTickets.length > 0) {
      const sortedResolved = [...resolvedTickets].sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
      const last = sortedResolved[sortedResolved.length - 1]
      let streakLen = 0
      for (let i = sortedResolved.length - 1; i >= 0; i -= 1) {
        if (sortedResolved[i].status !== last.status) break
        streakLen += 1
      }

      if (streakLen >= STREAK_ALERT_MIN) {
        const streakKey = `${last.status}-${streakLen}-${last.id}`
        if (state.lastStreakKey !== streakKey) {
          const title = last.status === 'win' ? 'Séria výhier' : 'Séria prehier'
          const body = `${streakLen} ${last.status === 'win' ? 'výherné' : 'prehrané'} tikety po sebe`
          const fired = await fireAlert(state, 'streak', title, body, '/tickets', 12)
          if (fired) alertsSent += 1
          state.lastStreakKey = streakKey
        }
      }
    }

    const currentMilestone = Math.floor(resolvedTickets.length / HIT_RATE_MILESTONE_STEP)
    if (currentMilestone >= 1 && currentMilestone > (state.lastHitRateMilestone || 0)) {
      const milestoneCount = currentMilestone * HIT_RATE_MILESTONE_STEP
      const fired = await fireAlert(
        state,
        'hit-rate-milestone',
        'Míľnik vyhodnotených tiketov',
        `${milestoneCount} uzavretých tiketov • hit rate ${toPercent(hitRate)}`,
        '/statistics',
        6,
      )
      if (fired) alertsSent += 1
      state.lastHitRateMilestone = currentMilestone
    }

    const tracker = state.milestoneTracker
    const teamTicketsMilestone = getHighestFixedMilestone(tickets.length, TEAM_TICKET_MILESTONES)
    if (teamTicketsMilestone > tracker.teamTickets) {
      const fired = await fireMilestoneAlert(
        `milestone-team-tickets-${teamTicketsMilestone}`,
        'Tímový milestone',
        `Dosiahnutých ${teamTicketsMilestone} spoločných tiketov`,
      )
      if (fired) tracker.teamTickets = teamTicketsMilestone
    }

    const teamProfitMilestone = getHighestFixedMilestone(Math.max(0, teamProfit), TEAM_PROFIT_MILESTONES)
    if (teamProfitMilestone > tracker.teamProfit) {
      const fired = await fireMilestoneAlert(
        `milestone-team-profit-${teamProfitMilestone}`,
        'Tímový milestone',
        `Tímový profit dosiahol +${teamProfitMilestone.toFixed(0)} Kč`,
      )
      if (fired) tracker.teamProfit = teamProfitMilestone
    }

    const teamTurnoverMilestone = getPreviousTeamTurnoverMilestone(teamTurnover)
    if (teamTurnoverMilestone > tracker.teamTurnover) {
      const fired = await fireMilestoneAlert(
        `milestone-team-turnover-${teamTurnoverMilestone}`,
        'Tímový milestone',
        `Prestávkované peniaze tímu: ${teamTurnoverMilestone.toFixed(0)} Kč`,
      )
      if (fired) tracker.teamTurnover = teamTurnoverMilestone
    }

    if (predictions.length > 0) {
      const byUser = new Map<string, PredictionSnapshot[]>()
      const personalByUser = new Map<string, { resolved: number; ok: number; bestWonOdds: number; name: string }>()
      for (const prediction of predictions) {
        if (!byUser.has(prediction.user_id)) byUser.set(prediction.user_id, [])
        byUser.get(prediction.user_id)!.push(prediction)

        const current = personalByUser.get(prediction.user_id) || {
          resolved: 0,
          ok: 0,
          bestWonOdds: 0,
          name: prediction.user?.name || 'Tipér',
        }
        current.resolved += 1
        if (prediction.result === 'OK') {
          current.ok += 1
          const predictionOdds = Number(prediction.odds || 0)
          if (Number.isFinite(predictionOdds) && predictionOdds > current.bestWonOdds) {
            current.bestWonOdds = predictionOdds
          }
        }
        if (prediction.user?.name) current.name = prediction.user.name
        personalByUser.set(prediction.user_id, current)
      }

      for (const [userId, userPredictions] of byUser) {
        const latestTen = userPredictions.slice(0, 10)
        if (latestTen.length < 10) continue

        const okCount = latestTen.filter((prediction) => prediction.result === 'OK').length
        const userRate = (okCount / latestTen.length) * 100
        const userName = latestTen[0].user?.name || 'Tipér'
        const newestPredictionId = latestTen[0].id

        if (userRate >= 80) {
          const key = `tipper-hot-${userId}-${newestPredictionId}`
          const fired = await fireAlert(
            state,
            key,
            'Tipér vo forme',
            `${userName}: ${okCount}/10 úspešných tipov`,
            '/ranking',
            24,
          )
          if (fired) alertsSent += 1
        } else if (userRate <= 20) {
          const key = `tipper-cold-${userId}-${newestPredictionId}`
          const fired = await fireAlert(
            state,
            key,
            'Tipér mimo formy',
            `${userName}: len ${okCount}/10 úspešných tipov`,
            '/ranking',
            24,
          )
          if (fired) alertsSent += 1
        }
      }

      for (const [userId, personal] of personalByUser) {
        if (milestoneAlertsSent >= MILESTONE_ALERT_BUDGET) break

        const userName = personal.name || 'Tipér'
        const okMilestone = getHighestFixedMilestone(personal.ok, PERSONAL_OK_TIPS_MILESTONES)
        const previousOkMilestone = tracker.userOkTips[userId] || 0
        if (okMilestone > previousOkMilestone) {
          const fired = await fireMilestoneAlert(
            `milestone-user-ok-${userId}-${okMilestone}`,
            'Osobný milestone',
            `${userName} dosiahol ${okMilestone} OK tipov`,
          )
          if (fired) tracker.userOkTips[userId] = okMilestone
        }

        if (milestoneAlertsSent >= MILESTONE_ALERT_BUDGET) break

        if (personal.resolved >= PERSONAL_HIT_RATE_MIN_SAMPLE) {
          const userHitRate = (personal.ok / Math.max(1, personal.resolved)) * 100
          const hitRateMilestone = getHighestFixedMilestone(userHitRate, PERSONAL_HIT_RATE_MILESTONES)
          const previousHitRateMilestone = tracker.userHitRate[userId] || 0
          if (hitRateMilestone > previousHitRateMilestone) {
            const fired = await fireMilestoneAlert(
              `milestone-user-hitrate-${userId}-${hitRateMilestone}`,
              'Osobný milestone',
              `${userName} dosiahol hit rate ${hitRateMilestone.toFixed(0)}%`,
            )
            if (fired) tracker.userHitRate[userId] = hitRateMilestone
          }
        }

        if (milestoneAlertsSent >= MILESTONE_ALERT_BUDGET) break

        const wonOddsMilestone = getHighestWonOddsMilestone(personal.bestWonOdds)
        const previousWonOddsMilestone = tracker.userWonOdds[userId] || 0
        if (wonOddsMilestone > previousWonOddsMilestone) {
          const fired = await fireMilestoneAlert(
            `milestone-user-wonodds-${userId}-${wonOddsMilestone.toFixed(2)}`,
            'Osobný milestone',
            `${userName} trafil kurz ${wonOddsMilestone.toFixed(2)}`,
          )
          if (fired) tracker.userWonOdds[userId] = wonOddsMilestone
        }
      }
    }

    const weekKey = getIsoWeekKey()
    if (state.lastWeeklyReportKey !== weekKey) {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const fromKey = localDateKey(weekAgo)
      const weeklyResolved = resolvedTickets.filter((ticket) => ticket.date >= fromKey)
      const weeklyProfit = weeklyResolved.reduce((sum, ticket) => sum + (ticket.payout - ticket.stake), 0)
      const weeklyStake = weeklyResolved.reduce((sum, ticket) => sum + ticket.stake, 0)
      const weeklyYield = weeklyStake > 0 ? (weeklyProfit / weeklyStake) * 100 : 0

      if (weeklyResolved.length > 0) {
        const fired = await fireAlert(
          state,
          `weekly-report-${weekKey}`,
          'Týždenný report',
          `${weeklyResolved.length} uzavretých tiketov • zisk ${toAmount(weeklyProfit)} • yield ${toPercent(weeklyYield)}`,
          contextUrl,
          6,
        )
        if (fired) alertsSent += 1
      }
      state.lastWeeklyReportKey = weekKey
    }

    // Safety cap to reduce notification bursts when many rules trigger at once.
    if (alertsSent > 3) {
      setCooldown(state, 'drawdown')
      setCooldown(state, 'streak')
    }

    writeState(state)
  } catch (error) {
    console.error('Stats alerts evaluation failed:', error)
  }
}
