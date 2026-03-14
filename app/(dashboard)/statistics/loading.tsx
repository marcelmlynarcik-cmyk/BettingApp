import { Skeleton } from '@/components/ui/skeleton'

export default function StatisticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <section
            key={index}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
          </section>
        ))}
      </div>
    </div>
  )
}
