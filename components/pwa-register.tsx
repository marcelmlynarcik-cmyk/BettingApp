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
            await registerAndSyncPushSubscription()
          } catch (syncError) {
            console.warn('Push subscription sync failed, trying refresh:', syncError)
            await refreshPushSubscription()
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
