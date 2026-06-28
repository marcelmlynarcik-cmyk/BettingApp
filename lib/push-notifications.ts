import webPush, { type WebPushError } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export const PUSH_PREFERENCE_KEYS = [
  'ticket_created',
  'ticket_settled',
  'prediction_result_changed',
  'monthly_summary',
  'ranking_milestones',
  'pending_ticket_reminders',
  'finance_updates',
] as const

export type PushPreferenceKey = (typeof PUSH_PREFERENCE_KEYS)[number]

export type PushPreferences = {
  auth_user_id: string
  push_enabled: boolean
  ticket_created: boolean
  ticket_settled: boolean
  prediction_result_changed: boolean
  monthly_summary: boolean
  ranking_milestones: boolean
  pending_ticket_reminders: boolean
  finance_updates: boolean
  created_at?: string
  updated_at?: string
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

type PushSubscriptionRecord = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export const DEFAULT_PUSH_PREFERENCES = {
  push_enabled: false,
  ticket_created: true,
  ticket_settled: true,
  prediction_result_changed: true,
  monthly_summary: true,
  ranking_milestones: true,
  pending_ticket_reminders: true,
  finance_updates: false,
} satisfies Omit<PushPreferences, 'auth_user_id'>

let vapidConfigured = false

function configureVapid() {
  if (vapidConfigured) return

  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!subject || !publicKey || !privateKey) {
    throw new Error('Missing VAPID environment variables')
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

export function assertValidPreferenceKey(value: string): asserts value is PushPreferenceKey {
  if (!PUSH_PREFERENCE_KEYS.includes(value as PushPreferenceKey)) {
    throw new Error(`Unsupported push preference type: ${value}`)
  }
}

export async function getOrCreatePushPreferences(authUserId: string): Promise<PushPreferences> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('push_notification_preferences')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) throw error
  if (data) return data as PushPreferences

  const { data: created, error: createError } = await supabase
    .from('push_notification_preferences')
    .insert({ auth_user_id: authUserId, ...DEFAULT_PUSH_PREFERENCES })
    .select('*')
    .single()

  if (createError) throw createError

  return created as PushPreferences
}

export async function updatePushPreferences(
  authUserId: string,
  patch: Partial<Omit<PushPreferences, 'auth_user_id' | 'created_at' | 'updated_at'>>,
) {
  const allowedPatch = Object.fromEntries(
    Object.entries(patch).filter(([key, value]) => {
      return (key === 'push_enabled' || PUSH_PREFERENCE_KEYS.includes(key as PushPreferenceKey)) && typeof value === 'boolean'
    }),
  )

  const current = await getOrCreatePushPreferences(authUserId)
  if (Object.keys(allowedPatch).length === 0) return current

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('push_notification_preferences')
    .update({
      ...allowedPatch,
      updated_at: new Date().toISOString(),
    })
    .eq('auth_user_id', authUserId)
    .select('*')
    .single()

  if (error) throw error

  return data as PushPreferences
}

export async function upsertPushSubscription(input: {
  authUserId: string
  endpoint: string
  p256dh: string
  auth: string
  platform?: string | null
  userAgent?: string | null
}) {
  const now = new Date().toISOString()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      auth_user_id: input.authUserId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      platform: input.platform || null,
      user_agent: input.userAgent || null,
      enabled: true,
      revoked_at: null,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: 'endpoint' })
    .select('id, auth_user_id, endpoint, platform, enabled, last_seen_at')
    .single()

  if (error) throw error

  await updatePushPreferences(input.authUserId, { push_enabled: true })

  return data
}

export async function disablePushSubscription(endpoint: string, authUserId?: string) {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  let query = supabase
    .from('push_subscriptions')
    .update({ enabled: false, revoked_at: now, updated_at: now })
    .eq('endpoint', endpoint)

  if (authUserId) query = query.eq('auth_user_id', authUserId)

  const { error } = await query
  if (error) throw error
}

async function markSubscriptionRevoked(subscriptionId: string) {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ enabled: false, revoked_at: now, updated_at: now })
    .eq('id', subscriptionId)

  if (error) console.error('Failed to mark push subscription revoked:', error)
}

export async function sendPushToUser(input: {
  authUserId: string
  type: PushPreferenceKey
  payload: PushPayload
  dedupeKey?: string
}) {
  assertValidPreferenceKey(input.type)
  configureVapid()

  const supabase = createAdminClient()
  const preferences = await getOrCreatePushPreferences(input.authUserId)

  if (!preferences.push_enabled || !preferences[input.type]) {
    return { sent: 0, skipped: true, reason: 'preferences_disabled' }
  }

  if (input.dedupeKey) {
    const { data: existingEvent, error: eventReadError } = await supabase
      .from('push_notification_events')
      .select('id')
      .eq('auth_user_id', input.authUserId)
      .eq('event_type', input.type)
      .eq('event_key', input.dedupeKey)
      .maybeSingle()

    if (eventReadError) throw eventReadError
    if (existingEvent) return { sent: 0, skipped: true, reason: 'duplicate' }
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('auth_user_id', input.authUserId)
    .eq('enabled', true)

  if (error) throw error

  const activeSubscriptions = (subscriptions || []) as PushSubscriptionRecord[]
  if (activeSubscriptions.length === 0) {
    return { sent: 0, skipped: true, reason: 'no_active_subscriptions' }
  }

  const payload = JSON.stringify({
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    url: '/',
    tag: `${input.type}:${input.dedupeKey || Date.now()}`,
    ...input.payload,
  })

  let sent = 0
  const failures: Array<{ endpoint: string; statusCode?: number; message: string }> = []

  await Promise.all(
    activeSubscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        )
        sent += 1
      } catch (error) {
        const pushError = error as WebPushError
        failures.push({
          endpoint: subscription.endpoint,
          statusCode: pushError.statusCode,
          message: pushError.message,
        })

        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          await markSubscriptionRevoked(subscription.id)
        }
      }
    }),
  )

  if (sent > 0 && input.dedupeKey) {
    const { error: insertEventError } = await supabase.from('push_notification_events').insert({
      auth_user_id: input.authUserId,
      event_type: input.type,
      event_key: input.dedupeKey,
      payload: input.payload,
      sent_at: new Date().toISOString(),
    })

    if (insertEventError && insertEventError.code !== '23505') {
      throw insertEventError
    }
  }

  return { sent, failures, skipped: sent === 0 }
}

export async function sendPushToAllUsersSafe(input: {
  type: PushPreferenceKey
  payload: PushPayload
  dedupeKey: string
}) {
  try {
    const supabase = createAdminClient()
    const { data: profiles, error } = await supabase.from('profiles').select('id')

    if (error) throw error

    const results = await Promise.all(
      (profiles || []).map((profile) =>
        sendPushToUser({
          authUserId: profile.id,
          type: input.type,
          payload: input.payload,
          dedupeKey: input.dedupeKey,
        }).catch((error) => {
          console.error('Push send failed:', {
            authUserId: profile.id,
            type: input.type,
            error,
          })
          return { sent: 0, skipped: true, reason: 'send_failed' }
        }),
      ),
    )

    return results
  } catch (error) {
    console.error('Push fan-out failed:', error)
    return []
  }
}
