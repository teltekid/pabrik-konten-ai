import type { LucideIcon } from 'lucide-react'

export interface StatCardProps {
  title: string
  value: string
  changePercent: number
  sparkline?: number[]
  icon?: LucideIcon
}

export interface ChartPoint {
  label: string
  [key: string]: string | number
}

export interface ChartSeries {
  key: string
  label: string
  color?: string
}

export interface ChartCardProps {
  title: string
  data: ChartPoint[]
  series: ChartSeries[]
  ranges?: string[]
  height?: number
}

export interface TableColumn<T> {
  key: keyof T | string
  header: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columns: TableColumn<T>[]
  data: T[]
  loading?: boolean
  error?: string | null
  pageSize?: number
  rowKey: (row: T) => string
  emptyTitle?: string
  emptyDescription?: string
}

export interface ActivityItem {
  id: string
  title: string
  time: string
  icon?: LucideIcon
}

export type StatusVariant = 'success' | 'danger' | 'warning' | 'neutral' | 'accent'

export interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
}

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}