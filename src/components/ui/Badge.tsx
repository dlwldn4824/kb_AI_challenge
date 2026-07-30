import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'neutral' | 'danger'
  className?: string
}

const variants = {
  default: 'bg-kb-yellow/15 text-kb-dark-gray border-kb-yellow/40',
  success: 'bg-success-bg text-success border-success/20',
  warning: 'bg-warning-bg text-warning border-warning/20',
  neutral: 'bg-neutral-100 text-kb-gray border-neutral-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
