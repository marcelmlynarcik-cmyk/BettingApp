import { NextResponse } from 'next/server'
import { getAppOrigin, getSafeNextPath } from '@/lib/app-url'
import { ensureProfileForUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeNextPath(requestUrl.searchParams.get('next'))
  const origin = getAppOrigin(requestUrl.origin)

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    await ensureProfileForUser(user)
  }

  return NextResponse.redirect(new URL(next, origin))
}
