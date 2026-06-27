import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { disablePushSubscription, upsertPushSubscription } from '@/lib/push-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const user = await getCurrentUser()
    const endpoint = toOptionalString(body.endpoint)
    const p256dh = toOptionalString(body.keys?.p256dh)
    const auth = toOptionalString(body.keys?.auth)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Neplatná push subscription' }, { status: 400 })
    }

    await ensureProfileForUser(user)
    const subscription = await upsertPushSubscription({
      authUserId: user.id,
      endpoint,
      p256dh,
      auth,
      platform: toOptionalString(body.platform),
      userAgent: toOptionalString(body.userAgent) || request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, subscription })
  } catch (error) {
    console.error('Push subscription save failed:', error)
    const message = error instanceof Error ? error.message : 'Push subscription save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const user = await getCurrentUser()
    const endpoint = toOptionalString(body.endpoint)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!endpoint) {
      return NextResponse.json({ error: 'Chýba endpoint' }, { status: 400 })
    }

    await disablePushSubscription(endpoint, user.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Push subscription disable failed:', error)
    const message = error instanceof Error ? error.message : 'Push subscription disable failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
