import { StatCardSkeleton } from './StatCard'
import { ChartCardSkeleton } from './ChartCard'
import { ActivityPanelSkeleton } from './ActivityPanel'
import { Skeleton } from '../ui/skeleton'

export function SkeletonLoader() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCardSkeleton />
        </div>
        <ActivityPanelSkeleton />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}