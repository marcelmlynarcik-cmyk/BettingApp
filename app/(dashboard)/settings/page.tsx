import { PushNotificationsPanel } from '@/components/push-notifications-panel'
import { requireProfile } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { profile } = await requireProfile()
  const profileInfo = {
    displayName: profile.display_name || profile.email || 'Používateľ',
    email: profile.email,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Nastavenia</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Správa zariadení a systémových Web Push notifikácií.
        </p>
      </div>

      <PushNotificationsPanel profile={profileInfo} />
    </div>
  )
}
