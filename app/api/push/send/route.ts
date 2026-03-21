import { NextResponse } from 'next/server'
import type { PushSubscription } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushNotification } from '@/lib/push'

type SendBody = {
  title?: string
  body?: string
  url?: string
  tag?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendBody
    if (!body.title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')

    if (error) {
      console.error('Push send read subscriptions failed:', error)
      return NextResponse.json({ error: 'Failed to read subscriptions' }, { status: 500 })
    }

    const staleEndpoints: string[] = []
    let sentCount = 0

    for (const row of subscriptions || []) {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      }

      try {
        await sendPushNotification(subscription, {
          title: body.title,
          body: body.body,
          url: body.url,
          tag: body.tag,
        })
        sentCount += 1
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error && 'statusCode' in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0

        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(row.endpoint)
        } else {
          console.error('Push send failed for subscription:', row.endpoint, error)
        }
      }
    }

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ ok: true, sent: sentCount, stale: staleEndpoints.length })
  } catch (error) {
    console.error('Push send API error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
