'use client'

import { useEffect, useState } from 'react'
import { registerAndSyncPushSubscription } from '@/lib/push-subscription-client'

export function PushPermissionPrompt() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext

    setSupported(isSupported)
    if (!isSupported) {
      setPermission('unsupported')
      return
    }

    setPermission(Notification.permission)
  }, [])

  const requestNotifications = async () => {
    if (!supported || permission !== 'default') return

    setIsLoading(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        await registerAndSyncPushSubscription()
      }
    } catch (error) {
      console.error('Notification permission request failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!supported || permission !== 'default') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-border bg-card p-3 shadow-xl">
      <p className="text-xs font-semibold text-card-foreground">Zapni push notifikácie pre podané a výherné tikety.</p>
      <button
        type="button"
        onClick={requestNotifications}
        disabled={isLoading}
        className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-70"
      >
        {isLoading ? 'Zapínam...' : 'Zapnúť notifikácie'}
      </button>
    </div>
  )
}
