'use client'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

async function syncSubscription(subscription: PushSubscription) {
  const payload = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: payload,
      userAgent: navigator.userAgent,
    }),
  })

  if (!response.ok) {
    let details = ''
    try {
      const body = (await response.json()) as { error?: string }
      details = body?.error ? `: ${body.error}` : ''
    } catch {
      // ignore parse failure
    }
    throw new Error(`Push subscription sync failed (${response.status})${details}`)
  }
}

export async function registerAndSyncPushSubscription() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return false

  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }))

  await syncSubscription(subscription)

  return true
}

export async function refreshPushSubscription() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) return false

  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()

  if (existingSubscription) {
    try {
      await existingSubscription.unsubscribe()
    } catch {
      // Some browsers can fail unsubscribe for stale tokens; we still continue.
    }
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  await syncSubscription(subscription)

  return true
}
