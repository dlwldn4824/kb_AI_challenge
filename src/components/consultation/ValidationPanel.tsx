import type { MouseEvent } from 'react'
import {
  Check,
  X,
  FileStack,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Cpu,
  FileCode,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Separator } from '@/components/ui/Separator'
import { cn } from '@/lib/utils'
import type {
  ActivityEvent,
  ConditionalApproval,
  GenerationMetadata,
  PolicyReference,
  ValidationCheck,
} from '@/types/consultation'

interface ValidationPanelProps {
  checks: ValidationCheck[]
  policyReference: PolicyReference
  documentCount: number
  activity: ActivityEvent[]
  conditionalApproval: ConditionalApproval
  metadata: GenerationMetadata
  onToggleCheck: (checkId: string) => void
  onResolveApproval?: () => void
}

export function ValidationPanel({
  checks,
  policyReference,
  documentCount,
  activity,
  conditionalApproval,
  metadata,
  onToggleCheck,
  onResolveApproval,
}: ValidationPanelProps) {
  const pendingCount = checks.filter((c) => c.status === 'pending').length

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>운영 검증</CardTitle>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
              발송 전 업무 요건 상태입니다. AI 재검토가 아닙니다.
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="neutral">확인 {pendingCount}건</Badge>
          )}
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {checks.map((check) => (
              <li key={check.id}>
                <CheckItem
                  check={check}
                  onToggle={
                    check.confirmable
                      ? () => onToggleCheck(check.id)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>검색된 정책</CardTitle>
          <Badge variant="neutral">{documentCount}건</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3.5">
            <FileStack className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-neutral-900">
                {policyReference.title}
              </p>
              <p className="text-xs text-neutral-500">{policyReference.section}</p>
              <p className="text-[11px] text-neutral-400">
                중앙 패널의 검색 결과에서 선택된 원문입니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>승인 상태</CardTitle>
          <Badge variant={conditionalApproval.required ? 'warning' : 'success'}>
            {conditionalApproval.required ? '조건부' : '해당 없음'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            {conditionalApproval.required ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            ) : (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-2.5">
                <MetaRow
                  label="현재 상담 유형"
                  value={conditionalApproval.consultationType}
                />
                <MetaRow
                  label="케이스 분류"
                  value={conditionalApproval.classificationLabel}
                />
              </div>
              <p
                className={cn(
                  'text-xs font-medium leading-relaxed',
                  conditionalApproval.required ? 'text-warning' : 'text-success',
                )}
              >
                {conditionalApproval.message}
              </p>
              {conditionalApproval.required && !conditionalApproval.resolved && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onResolveApproval}
                >
                  추가 승인 완료 처리
                </Button>
              )}
              {conditionalApproval.required && conditionalApproval.resolved && (
                <Badge variant="success">추가 승인 완료</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>활동 기록</CardTitle>
        </CardHeader>
        <CardContent>
          <ol>
            {activity.map((event, index) => {
              const isLast = index === activity.length - 1
              return (
                <li key={event.id}>
                  <div className="flex gap-3">
                    <div className="flex w-10 shrink-0 justify-end">
                      <span
                        className={cn(
                          'pt-0.5 text-[11px] font-medium tabular-nums',
                          event.status === 'upcoming'
                            ? 'text-neutral-300'
                            : 'text-neutral-500',
                        )}
                      >
                        {event.time}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          event.status === 'done' && 'bg-success',
                          event.status === 'current' && 'bg-kb-yellow',
                          event.status === 'upcoming' && 'bg-neutral-200',
                        )}
                      />
                      {!isLast && (
                        <span className="my-1 w-px flex-1 min-h-[16px] bg-neutral-200" />
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-sm leading-snug',
                        !isLast && 'pb-4',
                        event.status === 'done' && 'text-neutral-900',
                        event.status === 'current' &&
                          'font-medium text-neutral-900',
                        event.status === 'upcoming' && 'text-neutral-400',
                      )}
                    >
                      {event.label}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>생성 메타데이터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <FileCode className="h-3.5 w-3.5" />
              <span className="text-xs">프롬프트 버전</span>
            </div>
            <span className="truncate text-xs font-medium text-neutral-900">
              {metadata.promptVersion}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">생성 시각</span>
            </div>
            <span className="truncate text-xs font-medium text-neutral-900">
              {metadata.generatedTime}
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 text-neutral-400">
              <Cpu className="h-3.5 w-3.5" />
              <span className="text-xs">모델</span>
            </div>
            <span className="truncate text-xs font-medium text-neutral-900">
              {metadata.model}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CheckItem({
  check,
  onToggle,
}: {
  check: ValidationCheck
  onToggle?: () => void
}) {
  const isPass = check.status === 'pass'
  const isPending = check.status === 'pending'
  const isFail = check.status === 'fail'
  const canToggle = Boolean(check.confirmable && onToggle)

  function handleToggle(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggle?.()
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors',
        isPass
          ? 'border-neutral-100 bg-neutral-50'
          : 'border-neutral-200 bg-white',
        canToggle && 'hover:border-neutral-300',
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium leading-snug',
            isPass && 'text-neutral-400 line-through',
            isPending && 'text-neutral-900',
            isFail && 'text-red-700',
          )}
        >
          {check.label}
        </p>
        {check.reason && (
          <p
            className={cn(
              'mt-1 text-xs leading-relaxed',
              isPass ? 'text-neutral-300 line-through' : 'text-neutral-400',
            )}
          >
            {check.reason}
          </p>
        )}
      </div>

      {canToggle ? (
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={isPass}
          aria-label={isPass ? `${check.label} 해제` : `${check.label} 완료`}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
            isPass
              ? 'bg-kb-yellow text-kb-dark-gray shadow-sm'
              : 'border-2 border-neutral-200 bg-white hover:border-kb-gray/40',
          )}
        >
          {isPass && <Check className="h-4 w-4" strokeWidth={2.75} />}
        </button>
      ) : (
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isPass && 'bg-kb-yellow text-kb-dark-gray shadow-sm',
            isPending && 'border-2 border-neutral-200 bg-white',
            isFail && 'border-2 border-red-200 bg-red-50 text-red-600',
          )}
        >
          {isPass && <Check className="h-4 w-4" strokeWidth={2.75} />}
          {isFail && <X className="h-3.5 w-3.5" strokeWidth={2.5} />}
        </span>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-kb-gray/70">{label}</span>
      <span className="font-medium text-kb-dark-gray">{value}</span>
    </div>
  )
}
