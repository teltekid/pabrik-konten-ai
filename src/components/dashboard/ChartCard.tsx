import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card } from '../ui/card'
import { ChartContainer, ChartTooltip } from '../ui/chart'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/utils'
import type { ChartCardProps } from '../../types'

export function ChartCard({ title, data, series, ranges = ['7H', '30H', '1T'], height = 280 }: ChartCardProps) {
  const [range, setRange] = useState(ranges[0])
  return (
    <Card className="animate-fade-up p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold">{title}</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                range === r ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ChartContainer
        config={Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))}
        height={height}
      >
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={32} stroke="hsl(var(--muted-foreground))" />
            <ChartTooltip />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color || `hsl(var(--primary))`}
                fill={s.color || `hsl(var(--primary))`}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
    </Card>
  )
}

export function ChartCardSkeleton({ height = 280 }: { height?: number }) {
  return (
    <Card className="p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </Card>
  )
}