import { Skeleton } from '@/components/ui/skeleton'

export default function FinanceLoading() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-64" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>

        <div className="rounded-xl border border-border bg-card p-2">
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg px-2 py-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
