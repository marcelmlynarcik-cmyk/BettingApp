import { NextResponse } from 'next/server'
import { ensureProfileForUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    await ensureProfileForUser(user)
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
