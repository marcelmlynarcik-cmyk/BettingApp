import { NextResponse } from 'next/server'
import { ensureProfileForUser, getCurrentUser } from '@/lib/auth'
import { normalizeLocale } from '@/lib/i18n'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfileForUser(user)

    const body = await request.json().catch(() => ({}))
    const locale = normalizeLocale(body.locale)
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('profiles')
      .update({
        locale,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('locale')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, locale: normalizeLocale(data?.locale) })
  } catch (error) {
    console.error('Profile locale update failed:', error)
    const message = error instanceof Error ? error.message : 'Profile locale update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
