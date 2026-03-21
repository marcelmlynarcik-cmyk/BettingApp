'use client'

import { useEffect } from 'react'
import { refreshPushSubscription, registerAndSyncPushSubscription } from '@/lib/push-subscription-client'

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            // Force renewal to avoid stale subscriptions after VAPID/endpoint drift.
            await refreshPushSubscription()
          } catch (refreshError) {
            console.warn('Push subscription refresh failed, trying sync:', refreshError)
            await registerAndSyncPushSubscription()
          }
        }
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    register()
  }, [])

  return null
}
