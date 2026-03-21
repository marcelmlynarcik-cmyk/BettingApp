'use client'

import { toast } from 'sonner'

export function notifySuccess(title: string, description?: string, url?: string) {
  toast.success(title, {
    description,
  })
  // Keep only toast feedback here; broadcast notifications go via /api/push/send.
  void url
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
