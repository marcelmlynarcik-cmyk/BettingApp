'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ensurePushSubscriptionHealthy, registerAndSyncPushSubscription } from '@/lib/push-subscription-client'

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

  const repairNotifications = async () => {
    setIsLoading(true)
    try {
      const ok = await ensurePushSubscriptionHealthy({ force: true })
      if (ok) {
        setStatusMessage('Push token bol obnovený.')
        toast.success('Push token obnovený')
      } else {
        setStatusMessage('Push token sa nepodarilo obnoviť.')
        toast.error('Obnova push tokenu zlyhala')
      }
    } catch (error) {
      console.error('Push token refresh failed:', error)
      setStatusMessage('Push token sa nepodarilo obnoviť.')
      toast.error('Obnova push tokenu zlyhala')
    } finally {
      setIsLoading(false)
    }
  }

  if (permission === 'granted') {
    return (
      <details className="mb-4 rounded-xl border border-border/70 bg-card/50 p-2">
        <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Push notifikácie sú aktívne • pokročilé
        </summary>
        <div className="mt-2 rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Ak sa notifikácie nedoručujú spoľahlivo, obnov push token.</p>
          <button
            type="button"
            onClick={repairNotifications}
            disabled={isLoading}
            className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground disabled:opacity-70"
          >
            {isLoading ? 'Obnovujem...' : 'Obnoviť push token'}
          </button>
          {statusMessage ? <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p> : null}
        </div>
      </details>
    )
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-3 md:p-4">
      <p className="text-sm font-semibold text-card-foreground">Push notifikácie (iOS + Android)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {permission === 'default' ? 'Zapni notifikácie pre podané a výherné tikety.' : 'Notifikácie nie sú aktívne.'}
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

      {platformMessage ? <p className="mt-2 text-xs text-muted-foreground">{platformMessage}</p> : null}
      {statusMessage ? <p className="mt-2 text-xs text-muted-foreground">{statusMessage}</p> : null}
    </section>
  )
}
