import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        success: 'border-success/20 bg-success/10 text-success',
        danger: 'border-danger/20 bg-danger/10 text-danger',
        warning: 'border-accent/20 bg-accent/10 text-accent',
        accent: 'border-accent/20 bg-accent/10 text-accent',
        neutral: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }