'use client'

import { Chrome } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAppOrigin, getSafeNextPath } from '@/lib/app-url'
import { notifyError } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({ nextPath = '/' }: { nextPath?: string }) {
  async function signInWithGoogle() {
    const supabase = createClient()
    const origin = getAppOrigin(window.location.origin)
    const safeNextPath = getSafeNextPath(nextPath)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath)}`,
      },
    })

    if (error) {
      notifyError('Prihlásenie zlyhalo', error.message)
    }
  }

  return (
    <Button type="button" className="w-full" onClick={signInWithGoogle}>
      <Chrome className="h-4 w-4" />
      Prihlásiť cez Google
    </Button>
  )
}
