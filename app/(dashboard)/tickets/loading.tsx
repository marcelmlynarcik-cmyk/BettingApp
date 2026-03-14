import { Skeleton } from '@/components/ui/skeleton'

export default function TicketsLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>

      <div className="flex gap-2 overflow-hidden">
        <Skeleton className="h-10 w-28 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-card p-4 md:p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-56" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
