'use client'

import { useEffect } from 'react'

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

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublicKey || !('PushManager' in window)) return

        if (!('Notification' in window)) return

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const existingSubscription = await registration.pushManager.getSubscription()
        const subscription =
          existingSubscription ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }))

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription,
            userAgent: navigator.userAgent,
          }),
        })
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    register()
  }, [])

  return null
}
