import type { PushSubscription } from 'web-push'
import { sendPushNotification } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'

export type ServerPushPayload = {
  title: string
  body?: string
  url?: string
  tag?: string
}

export async function sendPushToAll(payload: ServerPushPayload) {
  const supabase = createAdminClient()
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (error) {
    throw new Error(`Failed to read push subscriptions: ${error.message}`)
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
      await sendPushNotification(subscription, payload)
      sentCount += 1
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0

      if ([400, 401, 403, 404, 410].includes(statusCode)) {
        staleEndpoints.push(row.endpoint)
      } else {
        console.error('Push send failed for subscription:', row.endpoint, error)
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return {
    total: (subscriptions || []).length,
    sent: sentCount,
    stale: staleEndpoints.length,
  }
}
