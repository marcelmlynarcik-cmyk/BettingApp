import { LoginForm } from '@/components/login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_35%,#eef2ff_70%,#f8fafc_100%)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-card-foreground">BetTracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prihlás sa Google účtom, aby si mal vlastné nastavenia a push zariadenia.
          </p>
        </div>
        <LoginForm nextPath={next || '/'} />
      </div>
    </main>
  )
}
