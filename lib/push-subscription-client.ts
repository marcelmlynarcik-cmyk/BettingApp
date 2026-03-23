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

let cachedVapidPublicKey: string | null = null
const SUBSCRIPTION_SYNC_STORAGE_KEY = 'bettracker.push.last-sync'
const SUBSCRIPTION_SYNC_MAX_AGE_MS = 12 * 60 * 60 * 1000

async function getVapidPublicKey() {
  if (cachedVapidPublicKey) return cachedVapidPublicKey

  const fromEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (fromEnv) {
    cachedVapidPublicKey = fromEnv
    return fromEnv
  }

  const response = await fetch('/api/push/public-key', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    let details = ''
    try {
      const body = (await response.json()) as { error?: string }
      details = body?.error ? `: ${body.error}` : ''
    } catch {
      // ignore parse failure
    }
    throw new Error(`Failed to load VAPID public key (${response.status})${details}`)
  }

  const body = (await response.json()) as { publicKey?: string }
  if (!body.publicKey) {
    throw new Error('VAPID public key missing in response')
  }

  cachedVapidPublicKey = body.publicKey
  return body.publicKey
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

function readLastSync() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SUBSCRIPTION_SYNC_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { endpoint?: string; syncedAt?: number }
    if (!parsed?.endpoint || typeof parsed.syncedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeLastSync(endpoint: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      SUBSCRIPTION_SYNC_STORAGE_KEY,
      JSON.stringify({ endpoint, syncedAt: Date.now() }),
    )
  } catch {
    // ignore storage write failures
  }
}

export async function registerAndSyncPushSubscription() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  const vapidPublicKey = await getVapidPublicKey()

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
    writeLastSync(subscription.endpoint)
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
    writeLastSync(freshSubscription.endpoint)
  }

  return true
}

export async function refreshPushSubscription() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  const vapidPublicKey = await getVapidPublicKey()

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
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    } catch {
      // If subscribe fails due to an internal browser state race, retry by reading existing.
      subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('Unable to create push subscription on this device')
    }
  }

  await syncSubscription(subscription)
  writeLastSync(subscription.endpoint)

  return true
}

export async function ensurePushSubscriptionHealthy(options?: { force?: boolean }) {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return false
  }
  if (Notification.permission !== 'granted') return false

  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    return registerAndSyncPushSubscription()
  }

  const force = options?.force === true
  const lastSync = readLastSync()
  const isRecentlySynced =
    !force &&
    lastSync?.endpoint === subscription.endpoint &&
    Date.now() - lastSync.syncedAt < SUBSCRIPTION_SYNC_MAX_AGE_MS

  if (isRecentlySynced) return true

  try {
    await syncSubscription(subscription)
    writeLastSync(subscription.endpoint)
    return true
  } catch {
    const recovered = await refreshPushSubscription()
    subscription = await registration.pushManager.getSubscription()
    if (recovered && subscription) {
      writeLastSync(subscription.endpoint)
    }
    return recovered
  }
}
