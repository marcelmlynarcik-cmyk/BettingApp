import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type SubscriptionBody = {
  subscription?: {
    endpoint: string
    keys?: {
      p256dh?: string
      auth?: string
    }
  }
  userAgent?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubscriptionBody
    const subscription = body.subscription

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: body.userAgent || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'endpoint',
      },
    )

    if (error) {
      console.error('Push subscription upsert failed:', error)
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Push subscription API error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
