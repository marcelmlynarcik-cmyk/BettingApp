import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = toRequiredString(body.name)
    const sportId = toRequiredString(body.sport_id)

    if (!name || !sportId) {
      return NextResponse.json({ error: 'Názov ligy a šport sú povinné' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: league, error } = await supabase
      .from('leagues')
      .insert({ name, sport_id: sportId })
      .select('*')
      .single()

    if (error || !league) {
      throw error || new Error('League was not created')
    }

    return NextResponse.json({ ok: true, league })
  } catch (error) {
    console.error('League create failed:', error)
    const message = error instanceof Error ? error.message : 'League create failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
