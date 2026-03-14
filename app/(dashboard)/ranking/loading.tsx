import { Skeleton } from '@/components/ui/skeleton'

function RankingCardSkeleton() {
  return (
    <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    </article>
  )
}

export default function RankingLoading() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <section className="space-y-3.5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <RankingCardSkeleton key={index} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-9/12" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <Skeleton className="h-6 w-40" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <Skeleton className="h-6 w-44" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      </section>
    </div>
  )
}
