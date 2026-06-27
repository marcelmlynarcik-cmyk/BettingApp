'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, Send, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { notifyError, notifySuccess } from '@/lib/notifications'
import { cn } from '@/lib/utils'

type ProfileInfo = {
  displayName: string
  email: string | null
}

type PushPreferences = {
  auth_user_id: string
  push_enabled: boolean
  ticket_created: boolean
  ticket_settled: boolean
  prediction_result_changed: boolean
  monthly_summary: boolean
  ranking_milestones: boolean
  pending_ticket_reminders: boolean
  finance_updates: boolean
}

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

const preferenceItems: Array<{ key: keyof Omit<PushPreferences, 'auth_user_id' | 'push_enabled'>; label: string }> = [
  { key: 'ticket_created', label: 'Nový tiket' },
  { key: 'ticket_settled', label: 'Vyhodnotený tiket' },
  { key: 'prediction_result_changed', label: 'Zmena výsledku tipu' },
  { key: 'monthly_summary', label: 'Mesačný report' },
  { key: 'ranking_milestones', label: 'Míľnik v sieni slávy' },
  { key: 'pending_ticket_reminders', label: 'Dlho čakajúci tiket' },
  { key: 'finance_updates', label: 'Finančný pohyb' },
]

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

function getPlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return nav.userAgentData?.platform || navigator.platform || 'unknown'
}

function getPermissionState(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }

  return Notification.permission as PermissionState
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export function PushNotificationsPanel({
  profile,
  compact = false,
  onDismiss,
}: {
  profile: ProfileInfo
  compact?: boolean
  onDismiss?: () => void
}) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const [permission, setPermission] = useState<PermissionState>('unsupported')
  const [preferences, setPreferences] = useState<PushPreferences | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const statusLabel = useMemo(() => {
    if (!vapidPublicKey) return 'Chýba VAPID public key'
    if (permission === 'unsupported') return 'Nepodporované'
    if (permission === 'denied') return 'Zablokované'
    if (permission === 'granted') return preferences?.push_enabled ? 'Povolené' : 'Povolenie prehliadača aktívne'
    return 'Nepovolené'
  }, [permission, preferences?.push_enabled, vapidPublicKey])

  const loadPreferences = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/push/preferences', {
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Nepodarilo sa načítať nastavenia')
      }

      setPreferences(payload.preferences)
    } catch (error) {
      notifyError('Push nastavenia sa nenačítali', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPermission(getPermissionState())
    void registerServiceWorker()
    void loadPreferences()
  }, [loadPreferences])

  async function savePreferences(nextPreferences: Partial<PushPreferences>) {
    if (!preferences) return

    setSaving(true)
    try {
      const response = await fetch('/api/push/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preferences: nextPreferences,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Nepodarilo sa uložiť nastavenia')
      }

      setPreferences(payload.preferences)
    } catch (error) {
      notifyError('Push nastavenia sa neuložili', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  async function enableOnThisDevice() {
    if (!vapidPublicKey) {
      notifyError('Chýba VAPID public key')
      return
    }

    if (getPermissionState() === 'unsupported') {
      notifyError('Tento prehliadač nepodporuje Web Push')
      return
    }

    setSaving(true)
    try {
      const registration = await registerServiceWorker()
      if (!registration) throw new Error('Service worker nie je dostupný')

      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission as PermissionState)

      if (nextPermission !== 'granted') {
        throw new Error('Notifikácie neboli povolené')
      }

      const existingSubscription = await registration.pushManager.getSubscription()
      const subscription = existingSubscription || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const subscriptionJson = subscription.toJSON()
      const response = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscriptionJson.keys,
          platform: getPlatform(),
          userAgent: navigator.userAgent,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Subscription sa nepodarilo uložiť')
      }

      await loadPreferences()
      notifySuccess('Push notifikácie sú povolené', profile.displayName)
    } catch (error) {
      notifyError('Push notifikácie sa nepodarilo povoliť', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  async function disableThisDevice() {
    if (!('serviceWorker' in navigator)) return

    setSaving(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        })
        await subscription.unsubscribe()
      }

      notifySuccess('Toto zariadenie je vypnuté')
    } catch (error) {
      notifyError('Zariadenie sa nepodarilo vypnúť', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  async function sendTestPush() {
    setSaving(true)
    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Test push zlyhal')
      }

      notifySuccess('Test push odoslaný', `Odoslané zariadenia: ${payload.result?.sent ?? 0}`)
    } catch (error) {
      notifyError('Test push zlyhal', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={cn('rounded-lg border border-border bg-card p-4 shadow-sm', compact ? 'space-y-4' : 'space-y-5')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className={cn('font-bold text-card-foreground', compact ? 'text-lg' : 'text-xl')}>Push notifikácie</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Systémové Web Push notifikácie pre nainštalovanú PWA. Na iPhone alebo iPade otvor aplikáciu z plochy.
          </p>
        </div>
        {onDismiss && (
          <Button type="button" variant="ghost" size="icon" onClick={onDismiss} aria-label="Zavrieť">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-border bg-background px-2.5 py-1 font-medium">{statusLabel}</span>
          <span className="text-muted-foreground">Zariadenie: {typeof navigator === 'undefined' ? 'unknown' : getPlatform()}</span>
        </div>
        <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm">
          <p className="truncate font-medium text-foreground">{profile.displayName}</p>
          {profile.email && <p className="truncate text-xs text-muted-foreground">{profile.email}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" onClick={enableOnThisDevice} disabled={saving || loading || permission === 'unsupported' || permission === 'denied'}>
          <Smartphone className="h-4 w-4" />
          Povoliť na tomto zariadení
        </Button>
        <Button type="button" variant="outline" onClick={disableThisDevice} disabled={saving || permission === 'unsupported'}>
          <BellOff className="h-4 w-4" />
          Vypnúť zariadenie
        </Button>
        <Button type="button" variant="secondary" onClick={sendTestPush} disabled={saving || loading || !preferences?.push_enabled}>
          <Send className="h-4 w-4" />
          Test
        </Button>
      </div>

      {permission === 'denied' && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Notifikácie sú zablokované v prehliadači alebo systéme. Povoľ ich v nastaveniach zariadenia.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {preferenceItems.map((item) => (
          <label
            key={item.key}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium',
              saving && 'opacity-70',
            )}
          >
            <Checkbox
              checked={Boolean(preferences?.[item.key])}
              disabled={!preferences || saving}
              onCheckedChange={(checked) => {
                void savePreferences({ [item.key]: checked === true })
              }}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
