'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { refreshPushSubscription, registerAndSyncPushSubscription } from '@/lib/push-subscription-client'

type PermissionState = NotificationPermission | 'unsupported'

export function PushNotificationBanner() {
  const [permission, setPermission] = useState<PermissionState>('unsupported')
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      window.isSecureContext

    if (!isSupported) {
      setPermission('unsupported')
      return
    }

    setPermission(Notification.permission)
  }, [])

  const platformMessage = useMemo(() => {
    if (permission === 'unsupported') {
      return 'Push notifikácie vyžadujú HTTPS a moderný browser. Na iPhone fungujú cez appku pridanú na plochu (iOS 16.4+).'
    }
    if (permission === 'denied') {
      return 'Notifikácie sú blokované. iPhone: Nastavenia > Notifikácie > BetTracker > Povoliť. Android: Nastavenia stránok > Notifikácie > Povoliť.'
    }
    return ''
  }, [permission])

  const enableNotifications = async () => {
    if (permission !== 'default') return

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
        setStatusMessage('Žiadosť bola zamietnutá.')
        toast.error('Notifikácie sú blokované')
        return
      }

      setStatusMessage('Systémové okno sa neotvorilo.')
      toast.error('Povolenie notifikácií sa nepotvrdilo')
    } catch (error) {
      console.error('Notification permission request failed:', error)
      setStatusMessage('Žiadosť o notifikácie zlyhala.')
      toast.error('Žiadosť o notifikácie zlyhala')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefreshSubscription = async () => {
    setIsLoading(true)
    try {
      const refreshed = await refreshPushSubscription()
      if (!refreshed) {
        setStatusMessage('Odber sa nepodarilo obnoviť. Skús znovu povoliť notifikácie v prehliadači.')
        toast.error('Obnova odberu zlyhala')
        return
      }
      setStatusMessage('Odber notifikácií bol obnovený.')
      toast.success('Odber notifikácií obnovený')
    } catch (error) {
      console.error('Push subscription refresh failed:', error)
      const message = error instanceof Error && error.message ? error.message : 'Neznáma chyba'
      setStatusMessage(`Odber sa nepodarilo obnoviť: ${message}`)
      toast.error('Obnova odberu zlyhala')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-3 md:p-4">
      <p className="text-sm font-semibold text-card-foreground">Push notifikácie (iOS + Android)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Dostaneš upozornenie na podaný tiket aj na výherný tiket.
      </p>

      {permission === 'default' ? (
        <button
          type="button"
          onClick={enableNotifications}
          disabled={isLoading}
          className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-70"
        >
          {isLoading ? 'Zapínam...' : 'Zapnúť notifikácie'}
        </button>
      ) : null}

      {permission === 'granted' ? (
        <button
          type="button"
          onClick={handleRefreshSubscription}
          disabled={isLoading}
          className="mt-3 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-bold text-card-foreground disabled:opacity-70"
        >
          {isLoading ? 'Obnovujem...' : 'Obnoviť odber na tomto zariadení'}
        </button>
      ) : null}

      {platformMessage ? <p className="mt-2 text-xs text-muted-foreground">{platformMessage}</p> : null}
      {statusMessage ? <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p> : null}
    </section>
  )
}
