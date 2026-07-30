import { User, Headphones, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Separator } from '@/components/ui/Separator'
import { cn } from '@/lib/utils'
import type { CaseInformation, ConversationMessage } from '@/types/consultation'

interface ConversationPanelProps {
  messages: ConversationMessage[]
  caseInfo: CaseInformation
}

export function ConversationPanel({ messages, caseInfo }: ConversationPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>고객 대화</CardTitle>
          <Badge variant="neutral">{messages.length}건</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>케이스 정보</CardTitle>
            <p className="mt-1 text-[11px] text-neutral-400">
              최소 권한 · Need-to-Know
            </p>
          </div>
          <Badge variant="success">{caseInfo.sessionStatus}</Badge>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="케이스 ID" value={caseInfo.caseId} />
          <Separator />
          <InfoRow label="고객 ID" value={caseInfo.customerId} />
          <Separator />
          <InfoRow
            label="본인 인증"
            value={caseInfo.authentication}
            valueBadge="success"
          />
          <Separator />
          <InfoRow label="상담 유형" value={caseInfo.consultationType} />
          <Separator />
          <InfoRow label="케이스 분류" value={caseInfo.caseClassification} />
          <Separator />
          <div className="py-3.5">
            <p className="mb-2.5 text-xs text-neutral-400">연동 시스템</p>
            <ul className="space-y-2">
              {caseInfo.requiredSystems.map((system) => (
                <li
                  key={system.name}
                  className="flex items-center gap-2 text-xs text-neutral-900"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full',
                      system.connected
                        ? 'bg-success-bg text-success'
                        : 'bg-neutral-100 text-neutral-400',
                    )}
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {system.name}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>조회된 정보</CardTitle>
            <p className="mt-1 text-[11px] text-neutral-400">
              이번 상담에 필요한 항목만 조회
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {caseInfo.retrievedInfo.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-400">{item.label}</span>
                <Badge variant="warning">{item.value}</Badge>
              </div>
              <div className="mt-2.5 space-y-1.5">
                <InfoRow label="조회 시스템" value={item.source} compact />
                <InfoRow label="조회 시각" value={item.retrievedAt} compact />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isCustomer = message.role === 'customer'

  return (
    <div className={cn('flex gap-3', !isCustomer && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          isCustomer
            ? 'border-neutral-200 bg-neutral-100'
            : 'border-kb-yellow/40 bg-kb-yellow/20',
        )}
      >
        {isCustomer ? (
          <User className="h-3.5 w-3.5 text-neutral-500" />
        ) : (
          <Headphones className="h-3.5 w-3.5 text-neutral-700" />
        )}
      </div>
      <div className={cn('max-w-[85%] space-y-1', !isCustomer && 'items-end')}>
        <div
          className={cn(
            'flex items-center gap-2',
            !isCustomer && 'justify-end',
          )}
        >
          <span className="text-xs font-medium text-neutral-700">
            {isCustomer ? '고객' : '상담원'}
          </span>
          <span className="text-[11px] text-neutral-400">{message.timestamp}</span>
        </div>
        <div
          className={cn(
            'rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed',
            isCustomer
              ? 'border-neutral-200 bg-neutral-50 text-neutral-900'
              : 'border-neutral-200 bg-white text-neutral-900',
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  valueBadge,
  compact,
}: {
  label: string
  value: string
  valueBadge?: 'success' | 'warning' | 'default'
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        compact ? 'py-0.5' : 'py-3',
      )}
    >
      <span className="shrink-0 text-xs text-neutral-400">{label}</span>
      {valueBadge ? (
        <Badge variant={valueBadge}>{value}</Badge>
      ) : (
        <span className="truncate text-right text-xs font-medium text-neutral-900">
          {value}
        </span>
      )}
    </div>
  )
}
