import { Badge } from '../ui/badge'
import type { StatusBadgeProps, StatusVariant } from '../../types'

const map: Record<string, StatusVariant> = {
  completed: 'success',
  active: 'success',
  success: 'success',
  failed: 'danger',
  error: 'danger',
  pending: 'warning',
  processing: 'accent',
  cancelled: 'neutral',
}

export function StatusBadge({ status, variant }: StatusBadgeProps) {
  return <Badge variant={variant || map[status.toLowerCase()] || 'neutral'}>{status}</Badge>
}