'use client'

import { toast } from 'sonner'

function showBrowserNotification(title: string, description?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    new Notification(title, { body: description })
  } catch {
    // Ignore notification API failures and keep toast-only feedback.
  }
}

export function notifySuccess(title: string, description?: string) {
  toast.success(title, {
    description,
  })
  showBrowserNotification(title, description)
}

export function notifyError(title: string, description?: string) {
  toast.error(title, {
    description,
  })
}
