'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Languages } from 'lucide-react'
import { notifyError, notifySuccess } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { getDictionary, type AppLocale } from '@/lib/i18n'

export function LanguageSettings({ locale }: { locale: AppLocale }) {
  const router = useRouter()
  const [currentLocale, setCurrentLocale] = useState<AppLocale>(locale)
  const [saving, setSaving] = useState(false)
  const labels = getDictionary(currentLocale)

  async function updateLocale(nextLocale: AppLocale) {
    if (nextLocale === currentLocale || saving) return

    const previousLocale = currentLocale
    setCurrentLocale(nextLocale)
    setSaving(true)

    try {
      const response = await fetch('/api/profile/locale', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || labels.saveFailed)
      }

      notifySuccess(getDictionary(nextLocale).saved)
      router.refresh()
    } catch (error) {
      setCurrentLocale(previousLocale)
      notifyError(labels.saveFailed, error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const options: Array<{ locale: AppLocale; label: string }> = [
    { locale: 'sk', label: labels.slovak },
    { locale: 'cs', label: labels.czech },
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Languages className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-card-foreground">{labels.language}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.languageDescription}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {options.map((option) => (
              <button
                key={option.locale}
                type="button"
                disabled={saving}
                onClick={() => updateLocale(option.locale)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-bold transition-colors disabled:opacity-60',
                  currentLocale === option.locale
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-secondary',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
