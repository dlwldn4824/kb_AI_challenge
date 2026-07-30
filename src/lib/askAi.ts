import { mockSession } from '@/data/mockSession'
import type { RetrievalHit, RiskFlag, RiskSeverity } from '@/types/consultation'

function buildConversationText() {
  return mockSession.conversation
    .map((m) => {
      const role = m.role === 'customer' ? '고객' : '상담원'
      return `${role}: ${m.content}`
    })
    .join('\n')
}

function buildEvidenceText(evidence: RetrievalHit[]) {
  return evidence
    .map(
      (hit, i) =>
        `[근거 ${i + 1}] ${hit.title} ${hit.version} / ${hit.section}\n원문: ${hit.passage}`,
    )
    .join('\n\n')
}

export async function askAiToRefineResponse(params: {
  instruction: string
  currentResponse: string
  evidence: RetrievalHit[]
}): Promise<string> {
  const res = await fetch('/api/ask-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instruction: params.instruction,
      currentResponse: params.currentResponse,
      conversation: buildConversationText(),
      evidence: buildEvidenceText(params.evidence),
    }),
  })

  const data = (await res.json()) as { response?: string; error?: string }

  if (!res.ok) {
    throw new Error(data.error || 'AI 요청에 실패했습니다.')
  }

  if (!data.response?.trim()) {
    throw new Error('AI 응답이 비어 있습니다.')
  }

  return data.response.trim()
}

type RawRiskFlag = {
  phrase?: string
  category?: string
  severity?: string
  reason?: string
  reviewHint?: string
}

function normalizeSeverity(value: string | undefined): RiskSeverity {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

export async function analyzeResponseRisks(params: {
  response: string
  evidence: RetrievalHit[]
}): Promise<RiskFlag[]> {
  const res = await fetch('/api/review-risks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response: params.response,
      conversation: buildConversationText(),
      evidence: buildEvidenceText(params.evidence),
    }),
  })

  const data = (await res.json()) as {
    flags?: RawRiskFlag[]
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.error || '위험 요소 분석에 실패했습니다.')
  }

  const flags = Array.isArray(data.flags) ? data.flags : []

  return flags
    .filter((f) => f.phrase?.trim())
    .map((f, i) => ({
      id: `risk-${i}-${f.phrase!.trim().slice(0, 12)}`,
      phrase: f.phrase!.trim(),
      category: f.category?.trim() || '확인 필요',
      severity: normalizeSeverity(f.severity),
      reason: f.reason?.trim() || '상담사 확인이 필요합니다.',
      reviewHint:
        f.reviewHint?.trim() || '해당 표현이 정책·사실과 맞는지 확인하세요.',
    }))
}

/** Pass 1: 초안 생성 → Pass 2: 위험 하이라이트 */
export async function refineAndReviewResponse(params: {
  instruction: string
  currentResponse: string
  evidence: RetrievalHit[]
  onPhase?: (phase: 'draft' | 'review') => void
}): Promise<{ response: string; flags: RiskFlag[] }> {
  params.onPhase?.('draft')
  const response = await askAiToRefineResponse({
    instruction: params.instruction,
    currentResponse: params.currentResponse,
    evidence: params.evidence,
  })

  params.onPhase?.('review')
  const flags = await analyzeResponseRisks({
    response,
    evidence: params.evidence,
  })

  return { response, flags }
}
