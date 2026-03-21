'use client'

import { toast } from 'sonner'

async function showBrowserNotification(title: string, description?: string, url?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, {
        body: description,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-192x192.png',
        data: url ? { url } : undefined,
        tag: 'bettracker-local',
      })
      return
    }

    const notification = new Notification(title, {
      body: description,
      data: url ? { url } : undefined,
    })

    if (url) {
      notification.onclick = () => {
        window.focus()
        window.location.href = url
      }
    }
  } catch {
    // Ignore notification API failures and keep toast-only feedback.
  }
}

export function notifySuccess(title: string, description?: string, url?: string) {
  toast.success(title, {
    description,
  })
  void showBrowserNotification(title, description, url)
}

export function notifyError(title: string, description?: string) {
  toast.error(title, {
    description,
  })
}

type PushEventPayload = {
  title: string
  body?: string
  url?: string
  tag?: string
}

export async function triggerPushNotification(payload: PushEventPayload) {
  try {
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      let details = ''
      try {
        const body = (await response.json()) as { error?: string }
        details = body?.error ? `: ${body.error}` : ''
      } catch {
        // ignore parse failure
      }
      throw new Error(`Push send failed (${response.status})${details}`)
    }

    const result = (await response.json()) as { ok?: boolean; sent?: number; stale?: number }
    if (!result.ok || (result.sent ?? 0) <= 0) {
      console.warn('Push send returned no delivered targets:', result)
      return false
    }

    return true
  } catch (error) {
    console.error('Push trigger failed:', error)
    return false
  }
}
