import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { getOrCreatePushPreferences, updatePushPreferences } from '@/lib/push-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  void request

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfileForUser(user)
    const preferences = await getOrCreatePushPreferences(user.id)

    return NextResponse.json({ ok: true, preferences })
  } catch (error) {
    console.error('Push preferences load failed:', error)
    const message = error instanceof Error ? error.message : 'Push preferences load failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfileForUser(user)
    const preferences = await updatePushPreferences(user.id, body.preferences || {})

    return NextResponse.json({ ok: true, preferences })
  } catch (error) {
    console.error('Push preferences save failed:', error)
    const message = error instanceof Error ? error.message : 'Push preferences save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
