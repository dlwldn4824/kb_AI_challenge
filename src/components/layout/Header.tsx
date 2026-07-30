import { Badge } from '@/components/ui/Badge'
import type { OperatorInfo } from '@/types/consultation'

interface HeaderProps {
  title: string
  operator: OperatorInfo
}

export function Header({ title, operator }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-5">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-base font-semibold tracking-tight text-kb-dark-gray">
          {title}
        </h1>
        <Badge variant="default">진행 중</Badge>
      </div>

      <div className="flex shrink-0 items-center gap-5">
        <MetaItem label="담당자" value={operator.name} />
        <Divider />
        <MetaItem label="부서" value={operator.department} />
        <Divider />
        <MetaItem label="적용 정책" value={operator.currentPolicy} />
        <Divider />
        <MetaItem label="모델" value={operator.model} />
      </div>
    </header>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-xs text-kb-gray/70">{label}</span>
      <span className="text-xs font-medium text-kb-dark-gray">{value}</span>
    </div>
  )
}

function Divider() {
  return <div className="h-4 w-px bg-neutral-200" />
}
