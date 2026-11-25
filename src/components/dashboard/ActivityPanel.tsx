import { Card } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import type { ActivityItem } from '../../types'

export function ActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="animate-fade-up p-4">
      <h3 className="mb-3 font-serif text-lg font-semibold">Aktivitas Terbaru</h3>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const Icon = it.icon
            return (
              <li key={it.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm">{it.title}</p>
                  <p className="text-xs text-muted-foreground">{it.time}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function ActivityPanelSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-5 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}