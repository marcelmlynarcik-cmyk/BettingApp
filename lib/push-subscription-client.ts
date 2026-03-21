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

function uint8ArrayToBase64Url(value: Uint8Array) {
  let binary = ''
  for (let i = 0; i < value.length; i += 1) {
    binary += String.fromCharCode(value[i])
  }
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function normalizeSubscriptionPayload(subscription: PushSubscription) {
  const raw = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {}
  let p256dh = (raw as { keys?: { p256dh?: string } })?.keys?.p256dh
  let auth = (raw as { keys?: { auth?: string } })?.keys?.auth

  if (!p256dh || !auth) {
    const p256dhKey = subscription.getKey?.('p256dh')
    const authKey = subscription.getKey?.('auth')

    if (p256dhKey) {
      p256dh = uint8ArrayToBase64Url(new Uint8Array(p256dhKey))
    }
    if (authKey) {
      auth = uint8ArrayToBase64Url(new Uint8Array(authKey))
    }
  }

  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('Push subscription is missing endpoint or keys')
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh,
      auth,
    },
  }
}

async function syncSubscription(subscription: PushSubscription) {
  const payload = normalizeSubscriptionPayload(subscription)
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
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  try {
    await syncSubscription(subscription)
  } catch {
    // Fallback for stale/invalid browser subscription state.
    try {
      await subscription.unsubscribe()
    } catch {
      // ignore and continue with forced re-subscribe
    }

    const freshSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
    await syncSubscription(freshSubscription)
  }

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
