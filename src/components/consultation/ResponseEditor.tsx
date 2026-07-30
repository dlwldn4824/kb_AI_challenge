import { useState, type FormEvent } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { renderHighlightedText } from '@/lib/highlightText'
import { cn } from '@/lib/utils'
import type { RiskFlag, RiskSeverity } from '@/types/consultation'

interface ResponseEditorProps {
  value: string
  onChange: (value: string) => void
  evidenceCount: number
  riskFlags: RiskFlag[]
  activeRiskId?: string | null
  onSelectRisk?: (id: string | null) => void
  onAskAi?: (instruction: string) => void | Promise<void>
  asking?: boolean
  askPhase?: 'idle' | 'draft' | 'review'
  askError?: string | null
}

const severityLabel: Record<RiskSeverity, string> = {
  high: '높음',
  medium: '중간',
  low: '낮음',
}

const severityBadge: Record<RiskSeverity, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-900',
  low: 'bg-orange-50 text-orange-800',
}

export function ResponseEditor({
  value,
  onChange,
  evidenceCount,
  riskFlags,
  activeRiskId = null,
  onSelectRisk,
  onAskAi,
  asking = false,
  askPhase = 'idle',
  askError = null,
}: ResponseEditorProps) {
  const [instruction, setInstruction] = useState('')
  const [editing, setEditing] = useState(false)

  async function handleAsk(e: FormEvent) {
    e.preventDefault()
    const trimmed = instruction.trim()
    if (!trimmed || asking) return
    await onAskAi?.(trimmed)
    setInstruction('')
    setEditing(false)
  }

  const phaseLabel =
    askPhase === 'draft'
      ? '1/2 초안 생성 중…'
      : askPhase === 'review'
        ? '2/2 위험 요소 분석 중…'
        : null

  return (
    <Card>
      <div className="border-b border-neutral-200 px-5 py-3">
        <form onSubmit={handleAsk} className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
            <Sparkles className="h-3.5 w-3.5 text-neutral-500" />
          </div>
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="검색된 근거 안에서 응답 수정 요청… 예: 확정 표현 제거"
            disabled={asking}
            className="h-9 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!instruction.trim() || asking}
            className="shrink-0"
          >
            {asking ? phaseLabel || '생성 중…' : '요청'}
          </Button>
        </form>
        {phaseLabel && (
          <p className="mt-2 text-xs text-neutral-500">{phaseLabel}</p>
        )}
        {askError && (
          <p className="mt-2 text-xs text-red-600">{askError}</p>
        )}
      </div>

      <CardHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>AI 답변 초안</CardTitle>
            <Badge variant="default">편집 가능</Badge>
            <Badge variant="neutral">근거 {evidenceCount}건 기반</Badge>
            {riskFlags.length > 0 && (
              <Badge variant="neutral">
                확인 필요 {riskFlags.length}건
              </Badge>
            )}
          </div>
          <span className="text-xs text-neutral-400">
            1차로 초안을 만들고, 2차로 위험 표현을 표시합니다. 하이라이트를
            눌러 확인 포인트를 보세요.
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? '하이라이트 보기' : '직접 수정'}
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {editing ? (
          <textarea
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              onSelectRisk?.(null)
            }}
            className="min-h-[180px] w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-900 outline-none transition-colors focus:border-neutral-400 focus:bg-white"
            placeholder="AI가 생성한 응답이 여기에 표시됩니다..."
            spellCheck={false}
          />
        ) : (
          <div
            className="min-h-[180px] w-full whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-900"
            onDoubleClick={() => setEditing(true)}
          >
            {value.trim()
              ? renderHighlightedText(
                  value,
                  riskFlags,
                  activeRiskId,
                  (id) => onSelectRisk?.(id),
                )
              : (
                  <span className="text-neutral-400">
                    AI가 생성한 응답이 여기에 표시됩니다...
                  </span>
                )}
          </div>
        )}

        <p className="text-[11px] text-neutral-400">
          {value.length}자 · 수정 내역은 감사 로그에 기록됩니다
        </p>

        {riskFlags.length > 0 && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3.5 py-3">
            <div className="mb-2.5 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
              <p className="text-xs font-semibold text-amber-900">
                상담사 확인 필요
              </p>
            </div>
            <ul className="space-y-2">
              {riskFlags.map((flag) => {
                const active = activeRiskId === flag.id
                return (
                  <li key={flag.id}>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectRisk?.(active ? null : flag.id)
                      }
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-amber-400 bg-white shadow-sm'
                          : 'border-transparent bg-white/70 hover:border-amber-200',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            severityBadge[flag.severity],
                          )}
                        >
                          {severityLabel[flag.severity]}
                        </span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                          {flag.category}
                        </span>
                        <span className="text-xs font-semibold text-neutral-900">
                          “{flag.phrase}”
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                        {flag.reviewHint}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {flag.reason}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
