'use client'

import { Chrome } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/lib/notifications'
import { createClient } from '@/lib/supabase/client'

export function LoginForm({ nextPath = '/' }: { nextPath?: string }) {
  async function signInWithGoogle() {
    const supabase = createClient()
    const origin = window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
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
