import webpush, { type PushSubscription } from 'web-push'

type PushPayload = {
  title: string
  body?: string
  url?: string
  tag?: string
}

let configured = false

function ensureWebPushConfigured() {
  if (configured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID keys')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: PushPayload,
) {
  ensureWebPushConfigured()
  return webpush.sendNotification(subscription, JSON.stringify(payload))
}
