'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PushNotificationsPanel } from '@/components/push-notifications-panel'

type ProfileInfo = {
  displayName: string
  email: string | null
}

const ONBOARDING_STORAGE_KEY = 'bettracker-push-onboarding-seen-v1'

export function PushNotificationsOnboarding({ profile }: { profile: ProfileInfo }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1') return
    setOpen(true)
  }, [])

  function dismiss() {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) dismiss()
      else setOpen(true)
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Zapnúť systémové notifikácie</DialogTitle>
          <DialogDescription>
            Vyber tipéra, typy upozornení a povoľ Web Push na tomto zariadení.
          </DialogDescription>
        </DialogHeader>
        <PushNotificationsPanel profile={profile} compact onDismiss={dismiss} />
      </DialogContent>
    </Dialog>
  )
}
