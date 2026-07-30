import type {
  ActivityEvent,
  CaseInformation,
  ConditionalApproval,
  RetrievalHit,
  SessionStatus,
  ValidationCheck,
} from '@/types/consultation'

/** 고위험 케이스 분류만 추가 승인 */
export function buildConditionalApproval(
  caseInfo: CaseInformation,
): ConditionalApproval {
  const required = caseInfo.caseClassification === '고위험 상담'

  return {
    required,
    consultationType: caseInfo.consultationType,
    classificationLabel: caseInfo.caseClassification,
    message: required
      ? '고위험 금융 상담으로 추가 승인이 필요합니다.'
      : '추가 승인 불필요 · 상담사 확인 후 발송 가능',
    resolved: !required,
  }
}

export function buildInitialChecks(
  caseInfo: CaseInformation,
  retrievalHits: RetrievalHit[],
): ValidationCheck[] {
  const evidenceOk = retrievalHits.length > 0
  const latestOk = retrievalHits.some((h) => h.relevance >= 85)
  const authOk = caseInfo.authentication === '인증 완료'
  const systemsOk = caseInfo.requiredSystems.every((s) => s.connected)
  const retrievedOk = caseInfo.retrievedInfo.length > 0
  const caseOk = authOk && systemsOk && retrievedOk

  return [
    {
      id: 'policy-search',
      label: '정책 검색 완료',
      status: evidenceOk ? 'pass' : 'fail',
      confirmable: evidenceOk,
      reason: evidenceOk
        ? `Hybrid Search로 정책 문서 ${retrievalHits.length}건을 확보했습니다.`
        : '검색된 정책 문서가 없습니다.',
    },
    {
      id: 'latest-policy',
      label: '최신 정책 적용',
      status: latestOk ? 'pass' : 'fail',
      confirmable: latestOk,
      reason: latestOk
        ? '관련도 85% 이상 최신 정책이 포함되어 있습니다.'
        : '최신 고관련도 정책이 없습니다.',
    },
    {
      id: 'evidence-check',
      label: '관련 근거 확인',
      status: evidenceOk ? 'pass' : 'fail',
      confirmable: evidenceOk,
      reason: evidenceOk
        ? '검색된 원문 조항이 AI 답변 근거로 연결되어 있습니다.'
        : '원문 근거가 없습니다.',
    },
    {
      id: 'case-context',
      label: '케이스 정보 확인',
      status: caseOk ? 'pass' : 'fail',
      confirmable: caseOk,
      reason: caseOk
        ? '인증·고객 ID·상담 유형·최소 조회 정보가 확인되었습니다.'
        : '케이스에 필요한 최소 정보가 부족합니다.',
    },
    {
      id: 'consultant-review',
      label: '상담사 확인 필요',
      status: 'pending',
      confirmable: true,
      reason: '답변 초안과 원문 근거를 확인한 뒤 체크하세요.',
    },
  ]
}

export function toggleValidationCheck(
  checks: ValidationCheck[],
  checkId: string,
): ValidationCheck[] {
  return checks.map((check) => {
    if (check.id !== checkId || !check.confirmable) return check

    const willPass = check.status !== 'pass'

    if (check.id === 'consultant-review') {
      return {
        ...check,
        status: willPass ? 'pass' : 'pending',
        label: willPass ? '상담사 확인 완료' : '상담사 확인 필요',
        reason: willPass
          ? '상담사가 답변과 근거를 확인했습니다. 다시 누르면 해제됩니다.'
          : '답변 초안과 원문 근거를 확인한 뒤 체크하세요.',
      }
    }

    return {
      ...check,
      status: willPass ? 'pass' : 'pending',
    }
  })
}

export function buildActivity(
  sessionStatus: SessionStatus,
  allConfirmed: boolean,
): ActivityEvent[] {
  return [
    { id: 'e1', time: '14:21', label: '질문 접수', status: 'done' },
    { id: 'e2', time: '14:21', label: '정책 3건 검색 완료', status: 'done' },
    {
      id: 'e3',
      time: '14:21',
      label: '필요 고객정보 최소 조회',
      status: 'done',
    },
    { id: 'e4', time: '14:21', label: 'AI 답변 생성', status: 'done' },
    {
      id: 'e5',
      time: '14:22',
      label: allConfirmed ? '상담사 확인 완료' : '상담사 검토 중',
      status: allConfirmed ? 'done' : 'current',
    },
    {
      id: 'e6',
      time: sessionStatus === 'sent' ? '14:23' : '—',
      label: '응답 발송',
      status:
        sessionStatus === 'sent'
          ? 'done'
          : allConfirmed
            ? 'current'
            : 'upcoming',
    },
  ]
}

export function deriveSessionState(params: {
  checks: ValidationCheck[]
  sessionStatus: SessionStatus
  conditionalApproval: ConditionalApproval
}) {
  const { checks, sessionStatus, conditionalApproval } = params
  const allConfirmed = checks.every((c) => c.status === 'pass')
  const approvalOk = !conditionalApproval.required || conditionalApproval.resolved
  const readyToSend = allConfirmed && approvalOk

  if (sessionStatus === 'sent') {
    return {
      status: 'sent' as const,
      statusLabel: '발송 완료',
      readyToSend: false,
      activity: buildActivity('sent', true),
    }
  }

  if (readyToSend) {
    return {
      status: 'ready' as const,
      statusLabel: '발송 준비 완료',
      readyToSend: true,
      activity: buildActivity('ready', true),
    }
  }

  return {
    status: 'reviewing' as const,
    statusLabel: '상담사 검토 중',
    readyToSend: false,
    activity: buildActivity('reviewing', false),
  }
}

export function nowTimestamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
