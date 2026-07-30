import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Save, Send } from 'lucide-react'

interface BottomActionBarProps {
  statusLabel: string
  readyToSend: boolean
  sent: boolean
  onSaveDraft?: () => void
  onSend?: () => void
}

export function BottomActionBar({
  statusLabel,
  readyToSend,
  sent,
  onSaveDraft,
  onSend,
}: BottomActionBarProps) {
  const badgeVariant = sent || readyToSend ? 'success' : 'warning'

  return (
    <div className="z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-t border-neutral-200 bg-white px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-xs text-neutral-400">현재 상태</span>
        <Badge variant={badgeVariant}>{statusLabel}</Badge>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" onClick={onSaveDraft} disabled={sent}>
          <Save className="h-4 w-4" />
          임시 저장
        </Button>
        <Button
          variant="primary"
          disabled={!readyToSend || sent}
          onClick={onSend}
          title={
            sent
              ? '이미 발송되었습니다'
              : readyToSend
                ? '고객에게 응답 발송'
                : '상담사 확인이 완료되어야 발송할 수 있습니다'
          }
        >
          <Send className="h-4 w-4" />
          {sent ? '발송 완료' : '응답 발송'}
        </Button>
      </div>
    </div>
  )
}
