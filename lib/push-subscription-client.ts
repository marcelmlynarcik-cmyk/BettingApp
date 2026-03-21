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
    throw new Error(`Push subscription sync failed with status ${response.status}`)
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
    await existingSubscription.unsubscribe()
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

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
    throw new Error(`Push subscription refresh failed with status ${response.status}`)
  }

  return true
}
