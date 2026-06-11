import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data: predictions, error } = await supabase
      .from('predictions')
      .select('user_id, sport_id, league_id, odds, result')
      .in('result', ['OK', 'NOK'])

    if (error) throw error

    return NextResponse.json({ predictions: predictions || [] })
  } catch (error) {
    console.error('Prediction history load failed:', error)
    const message = error instanceof Error ? error.message : 'Prediction history load failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
