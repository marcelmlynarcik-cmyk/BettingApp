import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AppProfile = {
  id: string
  user_id: string | null
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) return null
  return user
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/auth/login')
  }

  return user
}

export async function ensureProfileForUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return null

  const supabase = createAdminClient()
  const email = user.email || null
  const displayName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : email
  const avatarUrl = typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id, user_id, display_name, avatar_url, email')
    .single()

  if (error) throw error

  return data as AppProfile
}

export async function requireProfile() {
  const user = await requireCurrentUser()
  const profile = await ensureProfileForUser(user)

  if (!profile) {
    redirect('/auth/login')
  }

  return { user, profile }
}
