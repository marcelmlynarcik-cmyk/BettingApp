import { createClient } from '@/lib/supabase/server'
import { TicketsPageClient } from './client'
import type { Ticket as TicketType, Prediction, User, Sport, League } from '@/lib/types'
import {
  buildProbabilityIndex,
  estimatePredictionProbability,
  estimateTicketProbability,
  type ClosedPredictionRecord,
} from '@/lib/ticket-probability'

async function getTickets() {
  const supabase = await createClient()
  
  const [{ data: tickets }, { data: closedPredictions }] = await Promise.all([
    supabase
      .from('tickets')
      .select(`
        *,
        predictions (
          *,
          user:users (*),
          sport:sports (*),
          league:leagues (*)
        )
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('predictions')
      .select('user_id, sport_id, league_id, odds, result')
      .in('result', ['OK', 'NOK']),
  ])

  const statsIndex = buildProbabilityIndex((closedPredictions || []) as ClosedPredictionRecord[])

  const typedTickets = ((tickets || []) as (TicketType & {
    predictions: (Prediction & { user?: User; sport?: Sport; league?: League })[]
  })[])

  return typedTickets.map((ticket) => {
    const predictions = (ticket.predictions || []).map((prediction) => {
      const estimate = estimatePredictionProbability(
        {
          user_id: prediction.user_id,
          sport_id: prediction.sport_id,
          league_id: prediction.league_id,
          odds: Number(prediction.odds),
        },
        statsIndex,
      )

      return {
        ...prediction,
        estimated_win_probability: estimate?.probability ?? null,
        probability_sample_size: estimate?.sampleSize ?? null,
        probability_source: estimate?.sourceLabel ?? null,
      }
    })

    const ticketProbability = estimateTicketProbability(
      predictions.map((prediction: Prediction) => ({
        user_id: prediction.user_id,
        sport_id: prediction.sport_id,
        league_id: prediction.league_id,
        odds: Number(prediction.odds),
        result: prediction.result,
      })),
      statsIndex,
    )

    return {
      ...ticket,
      predictions,
      estimated_win_probability: ticketProbability,
    }
  })
}

async function getUsers() {
  const supabase = await createClient()
  const { data: users } = await supabase.from('users').select('*')
  return users || []
}

async function getSports() {
  const supabase = await createClient()
  const { data: sports } = await supabase.from('sports').select('*').order('name', { ascending: true })
  return sports || []
}

async function getLeagues() {
  const supabase = await createClient()
  const { data: leagues } = await supabase.from('leagues').select('*').order('name', { ascending: true })
  return leagues || []
}

export default async function TicketsPage() {
  const [tickets, users, sports, leagues] = await Promise.all([
    getTickets(),
    getUsers(),
    getSports(),
    getLeagues(),
  ])

  return (
    <TicketsPageClient
      tickets={tickets}
      users={users}
      sports={sports}
      leagues={leagues}
    />
  )
}
