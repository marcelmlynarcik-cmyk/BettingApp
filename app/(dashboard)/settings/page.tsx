import { LanguageSettings } from '@/components/language-settings'
import { PushNotificationsPanel } from '@/components/push-notifications-panel'
import { requireProfile } from '@/lib/auth'
import { getDictionary, normalizeLocale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { profile } = await requireProfile()
  const locale = normalizeLocale(profile.locale)
  const labels = getDictionary(locale)
  const profileInfo = {
    displayName: profile.display_name || profile.email || 'Používateľ',
    email: profile.email,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">{labels.settings}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {labels.settingsDescription}
        </p>
      </div>

      <LanguageSettings locale={locale} />
      <PushNotificationsPanel profile={profileInfo} />
    </div>
  )
}
