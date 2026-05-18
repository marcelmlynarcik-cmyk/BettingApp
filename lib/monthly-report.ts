import { createAdminClient } from '@/lib/supabase/admin'
import { sendSmtpMail } from '@/lib/smtp-mailer'

type TicketRecord = {
  id: string
  date: string
  stake: number | string | null
  combined_odds: number | string | null
  payout: number | string | null
  possible_win: number | string | null
  status: 'win' | 'loss' | 'pending'
  description: string | null
  created_at?: string | null
}

type PredictionRecord = {
  id: string
  ticket_id: string | null
  user_id: string
  odds: number | string | null
  result: string | null
  profit: number | string | null
  tip_date: string | null
  created_at?: string | null
  user?: { name?: string | null } | { name?: string | null }[] | null
  sport?: { name?: string | null } | { name?: string | null }[] | null
  league?: { name?: string | null } | { name?: string | null }[] | null
}

type BasicStats = {
  tickets: number
  wins: number
  losses: number
  pending: number
  stake: number
  payout: number
  profit: number
  roi: number
  hitRate: number
  avgStake: number
  avgOdds: number
  pendingPotential: number
}

type TipStats = {
  tips: number
  ok: number
  nok: number
  pending: number
  profit: number
  stakeProxy: number
  roi: number
  hitRate: number
  avgOdds: number
}

type NamedTipStats = TipStats & { name: string }

type MonthlyReportData = {
  monthKey: string
  monthLabel: string
  start: string
  end: string
  previousMonthLabel: string
  generatedAt: string
  current: BasicStats
  previous: BasicStats
  delta: {
    profit: number
    roi: number
    tickets: number
    stake: number
  }
  allTime: BasicStats
  tippers: NamedTipStats[]
  breakfastLoser: NamedTipStats | null
  sports: NamedTipStats[]
  leagues: NamedTipStats[]
  worstLeagues: NamedTipStats[]
  combos: NamedTipStats[]
  weekdays: Array<BasicStats & { name: string }>
  oddsRanges: NamedTipStats[]
  bestWins: Array<TicketRecord & { profit: number }>
  missedPotentials: TicketRecord[]
  pendingTickets: TicketRecord[]
  bestMonth: BasicStats & { monthKey: string }
  worstMonth: BasicStats & { monthKey: string }
  bestTicket: (TicketRecord & { profit: number }) | null
  highestOddsWin: TicketRecord | null
  longestLossStreak: { count: number; start: string | null; end: string | null }
}

type AiReportCopy = {
  headline: string
  intro: string
  mainStory: string
  mostInteresting: string
  breakfast: string
  profitSources: string
  riskNotes: string
  verdict: string
}

const REPORT_RECIPIENTS = [
  'marcel.mlynarcik@gmail.com',
  'peto1610@gmail.com',
  'm.repka@seznam.cz',
]

function toNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} Kč`
}

function plainMoney(value: number) {
  return `${value.toFixed(2)} Kč`
}

function percent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`
}

function unsignedPercent(value: number) {
  return `${value.toFixed(1)} %`
}

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function normalizeResult(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function relationName(value: PredictionRecord['user'] | PredictionRecord['sport'] | PredictionRecord['league']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name || null
  return value.name || null
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getPreviousMonthWindow(now = new Date()) {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 1, 1)
  const end = new Date(currentMonthStart)
  end.setDate(0)

  return {
    start: toDateKey(start),
    end: toDateKey(end),
    monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
  }
}

function getWindowForMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)
  return {
    start: toDateKey(startDate),
    end: toDateKey(endDate),
    monthKey,
  }
}

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('sk-SK', {
    month: 'long',
    year: 'numeric',
  })
}

function inRange(dateValue: string | null | undefined, start: string, end: string) {
  return Boolean(dateValue && dateValue >= start && dateValue <= end)
}

function ticketProfit(ticket: TicketRecord) {
  return toNumber(ticket.payout) - toNumber(ticket.stake)
}

function getTicketOdds(ticket: TicketRecord) {
  const direct = toNumber(ticket.combined_odds)
  if (direct >= 1) return direct

  const stake = toNumber(ticket.stake)
  const possibleWin = toNumber(ticket.possible_win)
  if (stake > 0 && possibleWin > 0) return possibleWin / stake
  return 0
}

function ticketStats(tickets: TicketRecord[]): BasicStats {
  const resolved = tickets.filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
  const wins = tickets.filter((ticket) => ticket.status === 'win').length
  const stake = tickets.reduce((sum, ticket) => sum + toNumber(ticket.stake), 0)
  const payout = tickets.reduce((sum, ticket) => sum + toNumber(ticket.payout), 0)
  const profit = payout - stake

  return {
    tickets: tickets.length,
    wins,
    losses: tickets.filter((ticket) => ticket.status === 'loss').length,
    pending: tickets.filter((ticket) => ticket.status === 'pending').length,
    stake,
    payout,
    profit,
    roi: stake > 0 ? (profit / stake) * 100 : 0,
    hitRate: resolved.length > 0 ? (wins / resolved.length) * 100 : 0,
    avgStake: tickets.length > 0 ? stake / tickets.length : 0,
    avgOdds: tickets.length > 0 ? tickets.reduce((sum, ticket) => sum + getTicketOdds(ticket), 0) / tickets.length : 0,
    pendingPotential: tickets
      .filter((ticket) => ticket.status === 'pending')
      .reduce((sum, ticket) => sum + toNumber(ticket.possible_win), 0),
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | null | undefined) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item) || 'Nezaradené'
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()].map(([name, groupedItems]) => ({ name, items: groupedItems }))
}

function tipStats(predictions: PredictionRecord[], stakeShareByPredictionId: Map<string, number>): TipStats {
  const resolved = predictions.filter((prediction) => ['OK', 'NOK'].includes(normalizeResult(prediction.result)))
  const ok = resolved.filter((prediction) => normalizeResult(prediction.result) === 'OK').length
  const stakeProxy = predictions.reduce((sum, prediction) => sum + (stakeShareByPredictionId.get(prediction.id) || 0), 0)
  const profit = predictions.reduce((sum, prediction) => sum + toNumber(prediction.profit), 0)

  return {
    tips: predictions.length,
    ok,
    nok: resolved.length - ok,
    pending: predictions.length - resolved.length,
    profit,
    stakeProxy,
    roi: stakeProxy > 0 ? (profit / stakeProxy) * 100 : 0,
    hitRate: resolved.length > 0 ? (ok / resolved.length) * 100 : 0,
    avgOdds: predictions.length > 0 ? predictions.reduce((sum, prediction) => sum + toNumber(prediction.odds), 0) / predictions.length : 0,
  }
}

function namedTipStats(
  predictions: PredictionRecord[],
  stakeShareByPredictionId: Map<string, number>,
  keyFn: (prediction: PredictionRecord) => string | null | undefined,
  minTips = 1,
) {
  return groupBy(predictions, keyFn)
    .map(({ name, items }) => ({ name, ...tipStats(items, stakeShareByPredictionId) }))
    .filter((item) => item.tips >= minTips)
    .sort((a, b) => b.profit - a.profit)
}

function breakfastSort(a: NamedTipStats, b: NamedTipStats) {
  if (a.ok !== b.ok) return a.ok - b.ok
  return a.roi - b.roi
}

function weekdayName(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString('sk-SK', { weekday: 'long' })
}

function buildStakeShares(tickets: TicketRecord[], predictions: PredictionRecord[]) {
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]))
  const legCountByTicket = new Map<string, number>()
  for (const prediction of predictions) {
    if (!prediction.ticket_id) continue
    legCountByTicket.set(prediction.ticket_id, (legCountByTicket.get(prediction.ticket_id) || 0) + 1)
  }

  const stakeShareByPredictionId = new Map<string, number>()
  for (const prediction of predictions) {
    if (!prediction.ticket_id) {
      stakeShareByPredictionId.set(prediction.id, 0)
      continue
    }

    const ticket = ticketById.get(prediction.ticket_id)
    const legCount = legCountByTicket.get(prediction.ticket_id) || 0
    stakeShareByPredictionId.set(prediction.id, ticket && legCount > 0 ? toNumber(ticket.stake) / legCount : 0)
  }

  return stakeShareByPredictionId
}

async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
) {
  const pageSize = 1000
  let from = 0
  const all: T[] = []

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message || 'Nepodarilo sa načítať dáta')
    all.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return all
}

function longestLossStreak(tickets: TicketRecord[]) {
  const resolved = [...tickets]
    .filter((ticket) => ticket.status === 'win' || ticket.status === 'loss')
    .sort((a, b) => a.date.localeCompare(b.date))

  let current = 0
  let currentStart: string | null = null
  let best = { count: 0, start: null as string | null, end: null as string | null }

  for (const ticket of resolved) {
    if (ticket.status === 'loss') {
      if (current === 0) currentStart = ticket.date
      current += 1
      if (current > best.count) best = { count: current, start: currentStart, end: ticket.date }
    } else {
      current = 0
      currentStart = null
    }
  }

  return best
}

export async function buildMonthlyReportData(monthKey?: string): Promise<MonthlyReportData> {
  const supabase = createAdminClient()
  const window = monthKey ? getWindowForMonth(monthKey) : getPreviousMonthWindow()
  const previousKey = previousMonthKey(window.monthKey)
  const previousWindow = getWindowForMonth(previousKey)

  const [tickets, predictions] = await Promise.all([
    fetchAll<TicketRecord>((from, to) =>
      supabase
        .from('tickets')
        .select('id, date, stake, combined_odds, payout, possible_win, status, description, created_at')
        .range(from, to),
    ),
    fetchAll<PredictionRecord>((from, to) =>
      supabase
        .from('predictions')
        .select('id, ticket_id, user_id, odds, result, profit, tip_date, created_at, user:users(name), sport:sports(name), league:leagues(name)')
        .range(from, to),
    ),
  ])

  const stakeShareByPredictionId = buildStakeShares(tickets, predictions)
  const currentTickets = tickets.filter((ticket) => inRange(ticket.date, window.start, window.end))
  const previousTickets = tickets.filter((ticket) => inRange(ticket.date, previousWindow.start, previousWindow.end))
  const currentPredictions = predictions.filter((prediction) => inRange(prediction.tip_date || prediction.created_at, window.start, window.end))

  const current = ticketStats(currentTickets)
  const previous = ticketStats(previousTickets)
  const tippers = namedTipStats(currentPredictions, stakeShareByPredictionId, (prediction) => relationName(prediction.user))
  const months = groupBy(tickets, (ticket) => ticket.date.slice(0, 7))
    .map(({ name, items }) => ({ monthKey: name, ...ticketStats(items) }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  const bestMonth = [...months].sort((a, b) => b.profit - a.profit)[0] || { monthKey: window.monthKey, ...current }
  const worstMonth = [...months].sort((a, b) => a.profit - b.profit)[0] || { monthKey: window.monthKey, ...current }
  const winningTickets = [...tickets].filter((ticket) => ticket.status === 'win').map((ticket) => ({ ...ticket, profit: ticketProfit(ticket) }))

  return {
    monthKey: window.monthKey,
    monthLabel: monthLabel(window.monthKey),
    start: window.start,
    end: window.end,
    previousMonthLabel: monthLabel(previousKey),
    generatedAt: new Date().toISOString(),
    current,
    previous,
    delta: {
      profit: current.profit - previous.profit,
      roi: current.roi - previous.roi,
      tickets: current.tickets - previous.tickets,
      stake: current.stake - previous.stake,
    },
    allTime: ticketStats(tickets),
    tippers,
    breakfastLoser: [...tippers].sort(breakfastSort)[0] || null,
    sports: namedTipStats(currentPredictions, stakeShareByPredictionId, (prediction) => relationName(prediction.sport)),
    leagues: namedTipStats(currentPredictions, stakeShareByPredictionId, (prediction) => relationName(prediction.league)),
    worstLeagues: namedTipStats(currentPredictions, stakeShareByPredictionId, (prediction) => relationName(prediction.league))
      .sort((a, b) => a.profit - b.profit),
    combos: namedTipStats(
      currentPredictions,
      stakeShareByPredictionId,
      (prediction) => `${relationName(prediction.user) || 'Neznámy'} / ${relationName(prediction.league) || 'Bez ligy'}`,
      2,
    ),
    weekdays: groupBy(currentTickets, (ticket) => weekdayName(ticket.date))
      .map(({ name, items }) => ({ name, ...ticketStats(items) }))
      .sort((a, b) => b.profit - a.profit),
    oddsRanges: buildOddsRanges(currentPredictions, stakeShareByPredictionId),
    bestWins: currentTickets
      .filter((ticket) => ticket.status === 'win')
      .map((ticket) => ({ ...ticket, profit: ticketProfit(ticket) }))
      .sort((a, b) => b.profit - a.profit),
    missedPotentials: currentTickets
      .filter((ticket) => ticket.status === 'loss')
      .sort((a, b) => toNumber(b.possible_win) - toNumber(a.possible_win)),
    pendingTickets: currentTickets
      .filter((ticket) => ticket.status === 'pending')
      .sort((a, b) => toNumber(b.possible_win) - toNumber(a.possible_win)),
    bestMonth,
    worstMonth,
    bestTicket: winningTickets.sort((a, b) => b.profit - a.profit)[0] || null,
    highestOddsWin: [...tickets]
      .filter((ticket) => ticket.status === 'win')
      .sort((a, b) => getTicketOdds(b) - getTicketOdds(a))[0] || null,
    longestLossStreak: longestLossStreak(tickets),
  }
}

function buildOddsRanges(predictions: PredictionRecord[], stakeShareByPredictionId: Map<string, number>) {
  const ranges = [
    { name: '1.00-1.49', min: 1, max: 1.49 },
    { name: '1.50-1.99', min: 1.5, max: 1.99 },
    { name: '2.00-2.99', min: 2, max: 2.99 },
    { name: '3.00-4.99', min: 3, max: 4.99 },
    { name: '5.00+', min: 5, max: Number.POSITIVE_INFINITY },
  ]

  return ranges
    .map((range) => ({
      name: range.name,
      ...tipStats(
        predictions.filter((prediction) => {
          const odds = toNumber(prediction.odds)
          return odds >= range.min && odds <= range.max
        }),
        stakeShareByPredictionId,
      ),
    }))
    .sort((a, b) => b.profit - a.profit)
}

function fallbackCopy(data: MonthlyReportData): AiReportCopy {
  const bestSport = data.sports[0]
  const bestLeague = data.leagues[0]
  const worstDay = [...data.weekdays].sort((a, b) => a.profit - b.profit)[0]
  const topTipper = data.tippers[0]
  const loser = data.breakfastLoser

  return {
    headline:
      data.current.profit >= 0
        ? `${capitalize(data.monthLabel)}: mesiac, ktorý vrátil kontrolu`
        : `${capitalize(data.monthLabel)}: mesiac, kde treba znížiť škody`,
    intro: `${capitalize(data.monthLabel)} končí na ${money(data.current.profit)} pri ROI ${percent(data.current.roi)}. Oproti mesiacu ${data.previousMonthLabel} je to zmena o ${money(data.delta.profit)}, pričom objem tiketov sa zmenil o ${data.delta.tickets}.`,
    mainStory: `Hlavný príbeh nie je iba výsledok, ale profil hrania. Vklad bol ${plainMoney(data.current.stake)} oproti ${plainMoney(data.previous.stake)} pred mesiacom a priemerný kurz tiketu je ${data.current.avgOdds.toFixed(2)}. To ukazuje, či mesiac ťahá disciplína, objem alebo jeden veľký zásah.`,
    mostInteresting: bestLeague
      ? `Najsilnejší signál prišiel z kategórie ${bestLeague.name}: ${bestLeague.ok} OK, ${bestLeague.nok} NOK a profit ${money(bestLeague.profit)}. Toto je segment, ktorý si zaslúži pozornosť aj budúci mesiac.`
      : 'Vzorka za mesiac je nízka, preto treba viac pozerať na kvalitu tiketov než na samotné poradie.',
    breakfast: loser
      ? `Raňajkový účet zatiaľ drží ${loser.name}: má ${loser.ok} OK tipov a ROI ${percent(loser.roi)}. Pravidlo je najmenej OK tipov, pri remíze rozhoduje ROI.`
      : 'Raňajkový účet sa nedá určiť, lebo v mesiaci nie sú tipérske dáta.',
    profitSources: `Zisk najviac ťahali ${bestSport?.name || 'najsilnejšie segmenty'} a ${bestLeague?.name || 'najlepšie ligy'}. Top tipér je ${topTipper?.name || 'bez dát'} s profitom ${money(topTipper?.profit || 0)}.`,
    riskNotes: worstDay
      ? `Najväčšie riziko je ${worstDay.name}: ${worstDay.tickets} tiketov a výsledok ${money(worstDay.profit)}. Ak sa má report zlepšovať, takéto dni treba držať pod kontrolou.`
      : 'Rizikový vzorec sa nedá určiť, lebo v mesiaci nie je dostatok tiketov.',
    verdict: `Verdikt: ${data.current.profit >= 0 ? 'mesiac je pozitívny, ale treba držať disciplínu' : 'mesiac potrebuje tvrdší výber a menší objem'}. Najbližší míľnik je dostať sa nad historicky najlepší mesiac ${monthLabel(data.bestMonth.monthKey)} s výsledkom ${money(data.bestMonth.profit)}.`,
  }
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

async function generateAiCopy(data: MonthlyReportData): Promise<AiReportCopy> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fallbackCopy(data)

  const compactFacts = {
    month: data.monthLabel,
    period: `${data.start} - ${data.end}`,
    current: data.current,
    previousMonth: data.previousMonthLabel,
    previous: data.previous,
    delta: data.delta,
    tippers: data.tippers,
    breakfastRule: 'Raňajky chystá tipér s najmenším počtom OK tipov. Pri remíze rozhoduje horšie ROI.',
    breakfastLoser: data.breakfastLoser,
    topSports: data.sports.slice(0, 4),
    topLeagues: data.leagues.slice(0, 5),
    worstLeagues: data.worstLeagues.slice(0, 4),
    topCombos: data.combos.slice(0, 5),
    weekdays: data.weekdays,
    oddsRanges: data.oddsRanges,
    bestWins: data.bestWins.slice(0, 3),
    missedPotentials: data.missedPotentials.slice(0, 3),
    pendingTickets: data.pendingTickets,
    allTime: {
      stats: data.allTime,
      bestMonth: data.bestMonth,
      worstMonth: data.worstMonth,
      bestTicket: data.bestTicket,
      highestOddsWin: data.highestOddsWin,
      longestLossStreak: data.longestLossStreak,
    },
  }

  try {
    const model = process.env.GEMINI_MONTHLY_REPORT_MODEL || 'gemini-2.5-flash'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'Si editor mesačného betting reportu v slovenčine.',
                    'Píš pútavo, analyticky a vecne.',
                    'Nemeň čísla ani mená.',
                    'Nepoužívaj markdown.',
                    'Vráť iba validný JSON s kľúčmi: headline, intro, mainStory, mostInteresting, breakfast, profitSources, riskNotes, verdict.',
                    'Každá hodnota nech je 1-3 vety.',
                    `Fakty: ${JSON.stringify(compactFacts)}`,
                  ].join('\n'),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1400,
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`)
    const payload = await response.json()
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')

    if (!outputText) throw new Error('Gemini response did not contain text')
    const parsed = JSON.parse(outputText) as Partial<AiReportCopy>
    return { ...fallbackCopy(data), ...parsed }
  } catch (error) {
    console.error('Monthly report Gemini copy failed:', error)
    return fallbackCopy(data)
  }
}

function statCard(label: string, value: string, note: string, color = '#111827') {
  return `
    <td width="25%" style="padding:6px;">
      <div style="border:1px solid #dbe4ee; border-radius:12px; padding:16px; background:#f8fafc;">
        <p style="margin:0 0 7px; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase;">${htmlEscape(label)}</p>
        <p style="margin:0; color:${color}; font-size:24px; font-weight:900;">${htmlEscape(value)}</p>
        <p style="margin:6px 0 0; color:#64748b; font-size:12px;">${htmlEscape(note)}</p>
      </div>
    </td>`
}

function tipperRows(tippers: NamedTipStats[]) {
  return tippers
    .map(
      (tipper, index) => `
        <tr>
          <td style="padding:13px 12px; border-top:1px solid #e5e7eb; font-weight:900;">${index + 1}.</td>
          <td style="padding:13px 12px; border-top:1px solid #e5e7eb; font-weight:900;">${htmlEscape(tipper.name)}</td>
          <td align="right" style="padding:13px 12px; border-top:1px solid #e5e7eb;">${tipper.ok} OK / ${tipper.nok} NOK${tipper.pending ? ` / ${tipper.pending} P` : ''}</td>
          <td align="right" style="padding:13px 12px; border-top:1px solid #e5e7eb;">${unsignedPercent(tipper.hitRate)}</td>
          <td align="right" style="padding:13px 12px; border-top:1px solid #e5e7eb;">${percent(tipper.roi)}</td>
          <td align="right" style="padding:13px 12px; border-top:1px solid #e5e7eb; color:${tipper.profit >= 0 ? '#059669' : '#dc2626'}; font-weight:900;">${money(tipper.profit)}</td>
        </tr>`,
    )
    .join('')
}

function tableRows(items: NamedTipStats[], limit = 4) {
  return items
    .slice(0, limit)
    .map(
      (item) => `
        <tr>
          <td style="padding:12px; border-top:1px solid #e5e7eb;">${htmlEscape(item.name)}</td>
          <td align="right" style="padding:12px; border-top:1px solid #e5e7eb;">${item.ok} OK / ${item.nok} NOK${item.pending ? ` / ${item.pending} P` : ''}</td>
          <td align="right" style="padding:12px; border-top:1px solid #e5e7eb;">${unsignedPercent(item.hitRate)}</td>
          <td align="right" style="padding:12px; border-top:1px solid #e5e7eb; color:${item.profit >= 0 ? '#059669' : '#dc2626'}; font-weight:900;">${money(item.profit)}</td>
        </tr>`,
    )
    .join('')
}

function formatTicket(ticket: TicketRecord & { profit?: number }) {
  return `${ticket.date}, ${ticket.description || 'Tiket'}, vklad ${plainMoney(toNumber(ticket.stake))}, kurz ${getTicketOdds(ticket).toFixed(2)}, ${ticket.status === 'win' ? `výplata ${plainMoney(toNumber(ticket.payout))}, profit ${money(ticket.profit || ticketProfit(ticket))}` : `potenciál ${plainMoney(toNumber(ticket.possible_win))}`}`
}

export async function renderMonthlyReportHtml(data: MonthlyReportData) {
  const copy = await generateAiCopy(data)
  const bestSport = data.sports[0]
  const bestLeague = data.leagues[0]
  const worstDay = [...data.weekdays].sort((a, b) => a.profit - b.profit)[0]
  const worstLeague = data.worstLeagues[0]
  const bestWin = data.bestWins[0]
  const missed = data.missedPotentials[0]
  const pending = data.pendingTickets[0]
  const breakfastLoser = data.breakfastLoser

  return `<!doctype html>
<html lang="sk">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>BettingApp report - ${htmlEscape(capitalize(data.monthLabel))}</title>
  </head>
  <body style="margin:0; padding:0; background:#e7ecf2; color:#111827; font-family:Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${htmlEscape(copy.intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#e7ecf2;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:800px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 24px 72px rgba(15,23,42,0.17);">
            <tr>
              <td style="padding:34px; background:#0b1220;">
                <p style="margin:0 0 10px; color:#38bdf8; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:1.8px;">BettingApp mesačný report</p>
                <h1 style="margin:0; color:#ffffff; font-size:35px; line-height:1.12; font-weight:900;">${htmlEscape(copy.headline)}</h1>
                <p style="margin:16px 0 0; color:#cbd5e1; font-size:16px; line-height:1.65;">${htmlEscape(copy.intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 6px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${statCard('Profit', money(data.current.profit), `predtým ${money(data.previous.profit)}`, data.current.profit >= 0 ? '#059669' : '#dc2626')}
                    ${statCard('ROI', percent(data.current.roi), `${percent(data.delta.roi)} vs pred mesiacom`, data.current.roi >= 0 ? '#059669' : '#dc2626')}
                    ${statCard('Tikety', String(data.current.tickets), `${data.current.wins} W / ${data.current.losses} L / ${data.current.pending} P`)}
                    ${statCard('Tipéri OK', `${data.tippers.reduce((sum, tipper) => sum + tipper.ok, 0)}`, `raňajky: ${breakfastLoser?.name || 'bez dát'}`, '#2563eb')}
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td style="padding:18px 34px 0;"><h2 style="margin:0 0 12px; color:#111827; font-size:22px;">Hlavný príbeh</h2><p style="margin:0; color:#374151; font-size:15px; line-height:1.75;">${htmlEscape(copy.mainStory)}</p></td></tr>
            <tr><td style="padding:22px 34px 0;"><div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:14px; padding:18px 20px;"><p style="margin:0 0 6px; color:#047857; font-size:12px; font-weight:900; text-transform:uppercase;">Najzaujímavejší signál</p><p style="margin:0; color:#064e3b; font-size:16px; line-height:1.65; font-weight:700;">${htmlEscape(copy.mostInteresting)}</p></div></td></tr>
            <tr>
              <td style="padding:28px 34px 0;">
                <h2 style="margin:0 0 14px; color:#111827; font-size:22px;">Tipérska liga a raňajky</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                  <tr>
                    <th align="left" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">#</th>
                    <th align="left" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Tipér</th>
                    <th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Bilancia</th>
                    <th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Hit rate</th>
                    <th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">ROI</th>
                    <th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Profit</th>
                  </tr>
                  ${tipperRows(data.tippers)}
                </table>
                <div style="margin-top:16px; background:#fff7ed; border:1px solid #fed7aa; border-radius:14px; padding:18px 20px;">
                  <p style="margin:0 0 7px; color:#9a3412; font-size:12px; font-weight:900; text-transform:uppercase;">Raňajkový účet</p>
                  <p style="margin:0; color:#7c2d12; font-size:15px; line-height:1.7;">${htmlEscape(copy.breakfast)}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 34px 0;">
                <h2 style="margin:0 0 14px; color:#111827; font-size:22px;">Zdroje zisku</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="50%" style="padding:0 8px 12px 0; vertical-align:top;"><div style="border:1px solid #dbe4ee; border-radius:14px; padding:18px; background:#f8fafc;"><p style="margin:0 0 7px; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase;">Najlepší šport</p><p style="margin:0; color:#111827; font-size:24px; font-weight:900;">${htmlEscape(bestSport?.name || 'Bez dát')}</p><p style="margin:8px 0 0; color:#374151; font-size:14px; line-height:1.6;">${bestSport ? `${bestSport.ok} OK / ${bestSport.nok} NOK, profit ${money(bestSport.profit)}.` : 'Nedostatok dát.'}</p></div></td>
                    <td width="50%" style="padding:0 0 12px 8px; vertical-align:top;"><div style="border:1px solid #dbe4ee; border-radius:14px; padding:18px; background:#f8fafc;"><p style="margin:0 0 7px; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase;">Najlepšia liga</p><p style="margin:0; color:#111827; font-size:24px; font-weight:900;">${htmlEscape(bestLeague?.name || 'Bez dát')}</p><p style="margin:8px 0 0; color:#374151; font-size:14px; line-height:1.6;">${bestLeague ? `${bestLeague.ok} OK / ${bestLeague.nok} NOK, profit ${money(bestLeague.profit)}.` : 'Nedostatok dát.'}</p></div></td>
                  </tr>
                </table>
                <p style="margin:4px 0 0; color:#4b5563; font-size:14px; line-height:1.65;">${htmlEscape(copy.profitSources)}</p>
              </td>
            </tr>
            <tr><td style="padding:18px 34px 0;"><h2 style="margin:0 0 14px; color:#111827; font-size:22px;">Najsilnejšie kombinácie</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;"><tr><th align="left" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Kombinácia</th><th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Bilancia</th><th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Hit rate</th><th align="right" style="padding:12px; background:#f1f5f9; color:#475569; font-size:11px; text-transform:uppercase;">Profit</th></tr>${tableRows(data.combos, 5)}</table></td></tr>
            <tr>
              <td style="padding:28px 34px 0;">
                <h2 style="margin:0 0 14px; color:#111827; font-size:22px;">Brzdy a riziká</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="50%" style="padding:0 8px 12px 0; vertical-align:top;"><div style="border:1px solid #fecaca; border-radius:14px; padding:18px; background:#fef2f2;"><p style="margin:0 0 7px; color:#991b1b; font-size:11px; font-weight:900; text-transform:uppercase;">Najhorší deň</p><p style="margin:0; color:#7f1d1d; font-size:24px; font-weight:900;">${htmlEscape(worstDay?.name || 'Bez dát')}</p><p style="margin:8px 0 0; color:#7f1d1d; font-size:14px; line-height:1.6;">${worstDay ? `${worstDay.tickets} tiketov, výsledok ${money(worstDay.profit)}.` : 'Nedostatok dát.'}</p></div></td>
                    <td width="50%" style="padding:0 0 12px 8px; vertical-align:top;"><div style="border:1px solid #fecaca; border-radius:14px; padding:18px; background:#fef2f2;"><p style="margin:0 0 7px; color:#991b1b; font-size:11px; font-weight:900; text-transform:uppercase;">Najslabšia liga</p><p style="margin:0; color:#7f1d1d; font-size:24px; font-weight:900;">${htmlEscape(worstLeague?.name || 'Bez dát')}</p><p style="margin:8px 0 0; color:#7f1d1d; font-size:14px; line-height:1.6;">${worstLeague ? `${worstLeague.ok} OK / ${worstLeague.nok} NOK, profit ${money(worstLeague.profit)}.` : 'Nedostatok dát.'}</p></div></td>
                  </tr>
                </table>
                <p style="margin:4px 0 0; color:#4b5563; font-size:14px; line-height:1.65;">${htmlEscape(copy.riskNotes)}</p>
              </td>
            </tr>
            <tr><td style="padding:24px 34px 0;"><h2 style="margin:0 0 12px; color:#111827; font-size:22px;">Kurzové pásma</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${data.oddsRanges.slice(0, 3).map((range) => `<td width="33.33%" style="padding:6px;"><div style="background:${range.profit >= 0 ? '#ecfdf5' : '#fff7ed'}; border:1px solid ${range.profit >= 0 ? '#a7f3d0' : '#fed7aa'}; border-radius:12px; padding:15px;"><p style="margin:0; color:${range.profit >= 0 ? '#065f46' : '#9a3412'}; font-size:15px; font-weight:900;">${htmlEscape(range.name)}</p><p style="margin:7px 0 0; color:${range.profit >= 0 ? '#047857' : '#9a3412'}; font-size:13px;">${range.ok} OK / ${range.nok} NOK, ${money(range.profit)}</p></div></td>`).join('')}</tr></table></td></tr>
            <tr><td style="padding:28px 34px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#111827; border-radius:16px; overflow:hidden;"><tr><td style="padding:22px;"><h2 style="margin:0 0 14px; color:#ffffff; font-size:22px;">Hall of Fame a Pain of the Month</h2><p style="margin:0 0 10px; color:#d1d5db; font-size:14px; line-height:1.65;"><strong style="color:#93c5fd;">Tiket mesiaca:</strong> ${htmlEscape(bestWin ? formatTicket(bestWin) : 'bez výherného tiketu')}.</p><p style="margin:0 0 10px; color:#fca5a5; font-size:14px; line-height:1.65;"><strong style="color:#fca5a5;">Najväčší uletený potenciál:</strong> ${htmlEscape(missed ? formatTicket(missed) : 'bez stratového tiketu')}.</p><p style="margin:0; color:#fde68a; font-size:14px; line-height:1.65;"><strong style="color:#fde68a;">Otvorený tiket:</strong> ${htmlEscape(pending ? formatTicket(pending) : 'žiadny pending tiket')}.</p></td></tr></table></td></tr>
            <tr><td style="padding:28px 34px 0;"><h2 style="margin:0 0 14px; color:#111827; font-size:22px;">Rekordy a míľniky</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="50%" style="padding:0 8px 12px 0; vertical-align:top;"><div style="border:1px solid #dbe4ee; border-radius:14px; padding:18px; background:#f8fafc;"><p style="margin:0 0 8px; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase;">Najlepší mesiac histórie</p><p style="margin:0; color:#111827; font-size:22px; font-weight:900;">${htmlEscape(monthLabel(data.bestMonth.monthKey))}</p><p style="margin:8px 0 0; color:#374151; font-size:14px; line-height:1.6;">${money(data.bestMonth.profit)}, ROI ${percent(data.bestMonth.roi)}.</p></div></td><td width="50%" style="padding:0 0 12px 8px; vertical-align:top;"><div style="border:1px solid #dbe4ee; border-radius:14px; padding:18px; background:#f8fafc;"><p style="margin:0 0 8px; color:#64748b; font-size:11px; font-weight:900; text-transform:uppercase;">Najdlhšia séria prehier</p><p style="margin:0; color:#111827; font-size:22px; font-weight:900;">${data.longestLossStreak.count} tiketov</p><p style="margin:8px 0 0; color:#374151; font-size:14px; line-height:1.6;">${data.longestLossStreak.start || '-'} až ${data.longestLossStreak.end || '-'}.</p></div></td></tr></table></td></tr>
            <tr><td style="padding:24px 34px 34px;"><div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:14px; padding:18px 20px;"><p style="margin:0 0 7px; color:#1d4ed8; font-size:12px; font-weight:900; text-transform:uppercase;">Verdikt</p><p style="margin:0; color:#1e3a8a; font-size:15px; line-height:1.7;">${htmlEscape(copy.verdict)}</p></div></td></tr>
            <tr><td style="padding:18px 34px; background:#f8fafc; border-top:1px solid #e5e7eb;"><p style="margin:0; color:#64748b; font-size:12px; line-height:1.55;">Report vygenerovaný z BettingApp dát za obdobie ${data.start} - ${data.end}, porovnanie s mesiacom ${htmlEscape(data.previousMonthLabel)}. Report posielaný na ${REPORT_RECIPIENTS.map(htmlEscape).join(', ')}. Raňajkové pravidlo: najmenej OK tipov, pri remíze horšie ROI.</p></td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function sendMonthlyReport(monthKey?: string) {
  const data = await buildMonthlyReportData(monthKey)
  const html = await renderMonthlyReportHtml(data)
  const subject = `BettingApp report - ${capitalize(data.monthLabel)}`
  const text = [
    subject,
    '',
    `Profit: ${money(data.current.profit)}`,
    `ROI: ${percent(data.current.roi)}`,
    `Raňajky: ${data.breakfastLoser?.name || 'bez dát'}`,
    '',
    'HTML verzia reportu je v tele emailu.',
  ].join('\n')

  await sendSmtpMail({
    to: REPORT_RECIPIENTS,
    subject,
    html,
    text,
  })

  return { data, html, recipients: REPORT_RECIPIENTS }
}

export function monthlyReportRecipients() {
  return REPORT_RECIPIENTS
}
