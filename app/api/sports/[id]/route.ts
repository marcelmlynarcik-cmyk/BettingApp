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

    if (!id || !name) {
      return NextResponse.json({ error: 'Neplatná úprava športu' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: sport, error } = await supabase
      .from('sports')
      .update({ name })
      .eq('id', id)
      .select('*')
      .single()

    if (error || !sport) {
      throw error || new Error('Sport was not updated')
    }

    return NextResponse.json({ ok: true, sport })
  } catch (error) {
    console.error('Sport update failed:', error)
    const message = error instanceof Error ? error.message : 'Sport update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Neplatný šport' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: leagues, error: leaguesError } = await supabase
      .from('leagues')
      .select('id')
      .eq('sport_id', id)
      .limit(1)

    if (leaguesError) throw leaguesError

    if ((leagues || []).length > 0) {
      return NextResponse.json({ error: 'Najprv zmaž ligy patriace k tomuto športu' }, { status: 400 })
    }

    const { error } = await supabase.from('sports').delete().eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Sport delete failed:', error)
    const message = error instanceof Error ? error.message : 'Sport delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
