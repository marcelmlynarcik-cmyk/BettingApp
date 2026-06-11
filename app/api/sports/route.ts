import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = toRequiredString(body.name)

    if (!name) {
      return NextResponse.json({ error: 'Názov športu je povinný' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: sport, error } = await supabase
      .from('sports')
      .insert({ name })
      .select('*')
      .single()

    if (error || !sport) {
      throw error || new Error('Sport was not created')
    }

    return NextResponse.json({ ok: true, sport })
  } catch (error) {
    console.error('Sport create failed:', error)
    const message = error instanceof Error ? error.message : 'Sport create failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
