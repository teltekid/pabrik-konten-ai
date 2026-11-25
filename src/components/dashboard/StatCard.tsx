import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Line, LineChart } from 'recharts'
import { Card } from '../ui/card'
import { ChartContainer } from '../ui/chart'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/utils'
import type { StatCardProps } from '../../types'

export function StatCard({ title, value, changePercent, sparkline, icon: Icon }: StatCardProps) {
  const positive = changePercent >= 0
  const data = (sparkline || []).map((v, i) => ({ i, v }))
  return (
    <Card className="animate-fade-up p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="tabular mt-2 font-serif text-2xl font-semibold">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium',
            positive ? 'text-success' : 'text-danger',
          )}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(changePercent)}%
        </span>
        {data.length > 0 && (
          <div className="h-8 w-24">
            <ChartContainer config={{ v: { label: title } }} height={32}>
              <LineChart data={data}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={positive ? 'hsl(var(--success))' : 'hsl(var(--danger))'}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-3 h-3 w-16" />
    </Card>
  )
}