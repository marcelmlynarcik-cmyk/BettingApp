import { createClient } from '@/lib/supabase/server'
import { TicketsPageClient } from './client'

async function getTickets() {
  const supabase = await createClient()
  
  const { data: tickets } = await supabase
    .from('tickets')
    .select(`
      *,
      predictions (
        *,
        user:users (*)
      )
    `)
    .order('date', { ascending: false })
  
  return tickets || []
}

async function getUsers() {
  const supabase = await createClient()
  const { data: users } = await supabase.from('users').select('*')
  return users || []
}

async function getSports() {
  const supabase = await createClient()
  const { data: sports } = await supabase.from('sports').select('*')
  return sports || []
}

async function getLeagues() {
  const supabase = await createClient()
  const { data: leagues } = await supabase.from('leagues').select('*')
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
