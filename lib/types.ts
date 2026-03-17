export interface User {
  id: string
  name: string
  created_at: string
}

export interface Sport {
  id: string
  name: string
  created_at: string
}

export interface League {
  id: string
  sport_id: string
  name: string
  created_at: string
  sport?: Sport
}

export interface Ticket {
  id: string
  date: string
  stake: number
  combined_odds: number | null
  payout: number
  possible_win: number | null
  ticket_url: string | null
  status: 'win' | 'loss' | 'pending'
  description: string | null
  created_at: string
  estimated_win_probability?: number | null
  predictions?: Prediction[]
}

export interface Prediction {
  id: string
  ticket_id: string
  user_id: string
  odds: number
  result: 'OK' | 'NOK' | 'Pending'
  sport_id: string | null
  league_id: string | null
  tip_date: string | null
  profit: number
  created_at: string
  estimated_win_probability?: number | null
  probability_sample_size?: number | null
  probability_source?: string | null
  user?: User
  sport?: Sport
  league?: League
}

export interface FinanceTransaction {
  id: string
  type: 'deposit' | 'withdraw' | 'bet' | 'payout'
  ticket_id: string | null
  amount: number
  date: string
  description: string | null
  created_at: string
}

export interface UserStats {
  user_id: string
  user_name: string
  total_predictions: number
  wins: number
  losses: number
  pending: number
  win_rate: number
  total_profit: number
}

export interface OverviewStats {
  total_tickets: number
  total_stake: number
  total_payout: number
  total_profit: number
  win_rate: number
  pending_tickets: number
  winning_tickets: number
  losing_tickets: number
}
