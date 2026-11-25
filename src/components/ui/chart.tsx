import * as React from 'react'
import { ResponsiveContainer } from 'recharts'
import { cn } from '../../lib/utils'

export interface ChartConfig {
  [key: string]: { label: string; color?: string }
}

function ChartContainer({
  config: _config,
  className,
  children,
  height = 280,
}: {
  config: ChartConfig
  className?: string
  children: React.ReactElement
  height?: number
}) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-surface p-2 text-xs shadow-soft">
      {label != null && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="tabular text-muted-foreground">
          {p.name}: <span className="text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export { ChartContainer, ChartTooltip }