import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { sendPushToUser } from '@/lib/push-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  void request

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfileForUser(user)
    const result = await sendPushToUser({
      authUserId: user.id,
      type: 'ticket_created',
      payload: {
        title: 'BetTracker test',
        body: 'Push notifikácie sú na tomto zariadení aktívne.',
        url: '/settings',
        tag: `push-test:${user.id}:${Date.now()}`,
      },
    })

    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error('Push test failed:', error)
    const message = error instanceof Error ? error.message : 'Push test failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
