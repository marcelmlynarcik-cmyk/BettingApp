'use client'

import { useEffect } from 'react'
import { ensurePushSubscriptionHealthy } from '@/lib/push-subscription-client'

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    let isSyncing = false
    const syncPush = async (force = false) => {
      if (isSyncing) return
      isSyncing = true
      try {
        await ensurePushSubscriptionHealthy({ force })
      } catch (error) {
        console.error('Push subscription health check failed:', error)
      } finally {
        isSyncing = false
      }
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
        if ('Notification' in window && Notification.permission === 'granted') {
          await syncPush(true)
        }
      } catch (error) {
        console.error('Service worker registration failed:', error)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      void syncPush()
    }

    const handleOnline = () => {
      void syncPush()
    }

    register()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    const interval = window.setInterval(() => {
      void syncPush()
    }, 30 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.clearInterval(interval)
    }
  }, [])

  return null
}
