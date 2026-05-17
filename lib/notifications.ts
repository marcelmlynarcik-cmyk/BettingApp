'use client'

import { toast } from 'sonner'

export function notifySuccess(title: string, description?: string, url?: string) {
  void url
  toast.success(title, {
    description,
  })
}

export function notifyError(title: string, description?: string) {
  toast.error(title, {
    description,
  })
}
