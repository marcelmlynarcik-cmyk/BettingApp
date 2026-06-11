import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RouteContext = {
  params: Promise<{ id: string }>
}

function toRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const name = toRequiredString(body.name)
    const sportId = toRequiredString(body.sport_id)

    if (!id || !name || !sportId) {
      return NextResponse.json({ error: 'Neplatná úprava ligy' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: league, error } = await supabase
      .from('leagues')
      .update({ name, sport_id: sportId })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !league) {
      throw error || new Error('League was not updated')
    }

    return NextResponse.json({ ok: true, league })
  } catch (error) {
    console.error('League update failed:', error)
    const message = error instanceof Error ? error.message : 'League update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Neplatná liga' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('leagues').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('League delete failed:', error)
    const message = error instanceof Error ? error.message : 'League delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
