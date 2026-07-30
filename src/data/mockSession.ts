import type { ConsultationSession } from '@/types/consultation'
import { retrievalHits, retrievalQuery } from '@/data/mockRetrieval'
import {
  buildActivity,
  buildConditionalApproval,
  buildInitialChecks,
  deriveSessionState,
} from '@/lib/validation'

export const sidebarMenu = [
  { id: 'dashboard', label: '대시보드', icon: 'LayoutDashboard' },
  { id: 'ai-consultation', label: 'AI 상담', icon: 'MessageSquare' },
  { id: 'policy-center', label: '정책 센터', icon: 'Shield' },
  { id: 'approval-queue', label: '승인 대기열', icon: 'ClipboardCheck' },
  { id: 'audit-trail', label: '감사 추적', icon: 'FileSearch' },
  { id: 'prompt-management', label: '프롬프트 관리', icon: 'FileText' },
  { id: 'model-management', label: '모델 관리', icon: 'Cpu' },
  { id: 'settings', label: '설정', icon: 'Settings' },
] as const

const caseInfo = {
  caseId: 'CS-2026-001248',
  customerId: 'C-884291',
  authentication: '인증 완료' as const,
  consultationType: '이체 제한',
  caseClassification: '일반 상담' as const,
  sessionStatus: '진행 중' as const,
  requiredSystems: [
    { name: '코어뱅킹', connected: true },
    { name: '본인인증', connected: true },
    { name: '정책 센터', connected: true },
  ],
  retrievedInfo: [
    {
      label: '계좌 제한 상태',
      value: '제한',
      source: '코어뱅킹 시스템',
      retrievedAt: '14:21',
    },
  ],
}

const topHit = retrievalHits[0]
const policyReference = {
  title: `${topHit.title} ${topHit.version}`,
  section: `${topHit.chapter} · ${topHit.section}`,
}

const validationChecks = buildInitialChecks(caseInfo, retrievalHits)
const conditionalApproval = buildConditionalApproval(caseInfo)
const derived = deriveSessionState({
  checks: validationChecks,
  sessionStatus: 'reviewing',
  conditionalApproval,
})

export const mockSession: ConsultationSession = {
  id: caseInfo.caseId,
  status: derived.status,
  statusLabel: derived.statusLabel,
  operator: {
    name: '이지우',
    department: '고객지원',
    currentPolicy: 'v4.2',
    model: 'Claude Sonnet 4.6',
  },
  conversation: [
    {
      id: 'm1',
      role: 'customer',
      content: '돈을 이체했는데 계좌가 여전히 제한되어 있어요.',
      timestamp: '14:18',
    },
    {
      id: 'm2',
      role: 'consultant',
      content: '계좌 상태를 확인해 드리겠습니다.',
      timestamp: '14:19',
    },
    {
      id: 'm3',
      role: 'customer',
      content: '바로 해제될 수 있을까요?',
      timestamp: '14:20',
    },
  ],
  caseInfo,
  aiResponse:
    '본인 확인과 거래 상태 검토가 완료된 뒤 제한 해제 가능 여부를 안내해 드리겠습니다. 현재 단계에서는 즉시 해제를 확정할 수 없습니다.',
  retrievalQuery,
  retrievalHits,
  metadata: {
    promptVersion: 'Prompt-v8',
    generatedTime: '오늘 14:21',
    model: 'Claude Sonnet 4.6',
  },
  validationChecks,
  policyReference,
  activity: buildActivity('reviewing', false),
  conditionalApproval,
  audit: {
    policyVersion: 'v4.2',
    promptVersion: 'Prompt-v8',
    modelVersion: 'Claude Sonnet 4.6',
    timestamp: '2026-07-30 14:21:08',
    operator: '이지우',
  },
  readyToSend: derived.readyToSend,
}
