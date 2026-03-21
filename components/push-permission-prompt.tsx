'use client'

import { useEffect, useState } from 'react'
import { registerAndSyncPushSubscription } from '@/lib/push-subscription-client'
import { toast } from 'sonner'

export function PushPermissionPrompt() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

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
        setStatusMessage('Notifikácie sú zapnuté.')
        toast.success('Push notifikácie zapnuté')
        return
      }

      if (result === 'denied') {
        setStatusMessage('Notifikácie sú zamietnuté. Povoľ ich v Nastaveniach iPhonu.')
        toast.error('Notifikácie sú blokované')
        return
      }

      setStatusMessage('Safari nezobrazil systémové okno. Skús to znova alebo povol notifikácie v Nastaveniach.')
      toast.error('Systémové okno sa neotvorilo')
    } catch (error) {
      console.error('Notification permission request failed:', error)
      setStatusMessage('Žiadosť o notifikácie zlyhala.')
      toast.error('Žiadosť o notifikácie zlyhala')
    } finally {
      setIsLoading(false)
    }
  }

  if (!supported) return null

  if (permission === 'granted') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-border bg-card p-3 shadow-xl">
      <p className="text-xs font-semibold text-card-foreground">Zapni push notifikácie pre podané a výherné tikety.</p>
      {permission === 'default' ? (
        <button
          type="button"
          onClick={requestNotifications}
          disabled={isLoading}
          className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-70"
        >
          {isLoading ? 'Zapínam...' : 'Zapnúť notifikácie'}
        </button>
      ) : (
        <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2 text-[11px] font-medium text-muted-foreground">
          iPhone: Nastavenia {'>'} Notifikácie {'>'} BetTracker {'>'} Povoliť.
        </div>
      )}
      {statusMessage ? <p className="mt-2 text-[11px] text-muted-foreground">{statusMessage}</p> : null}
    </div>
  )
}
