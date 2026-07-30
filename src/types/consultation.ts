export type MessageRole = 'customer' | 'consultant'

export interface ConversationMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
}

export interface RequiredSystem {
  name: string
  connected: boolean
}

export interface RetrievedCustomerInfo {
  label: string
  value: string
  source: string
  retrievedAt: string
}

export interface CaseInformation {
  caseId: string
  customerId: string
  authentication: '인증 완료' | '대기' | '실패'
  consultationType: string
  caseClassification: '일반 상담' | '고위험 상담'
  sessionStatus: '진행 중' | '종료'
  requiredSystems: RequiredSystem[]
  retrievedInfo: RetrievedCustomerInfo[]
}

export interface RetrievalHit {
  documentId: string
  title: string
  version: string
  chapter: string
  section: string
  effectiveDate: string
  relevance: number
  passage: string
  repository: string
  sourceUrl: string
  matchType: Array<'keyword' | 'vector' | 'metadata'>
}

export interface RetrievalQuery {
  rawQuery: string
  filters: string[]
  methodLabel: string
}

export interface GenerationMetadata {
  promptVersion: string
  generatedTime: string
  model: string
}

export type RiskSeverity = 'high' | 'medium' | 'low'

export interface RiskFlag {
  id: string
  phrase: string
  category: string
  severity: RiskSeverity
  reason: string
  reviewHint: string
}

export type CheckStatus = 'pending' | 'pass' | 'warning' | 'fail'

export interface ValidationCheck {
  id: string
  label: string
  status: CheckStatus
  reason?: string
  confirmable: boolean
}

export interface PolicyReference {
  title: string
  section: string
}

export interface ActivityEvent {
  id: string
  time: string
  label: string
  status: 'done' | 'current' | 'upcoming'
}

export interface ConditionalApproval {
  required: boolean
  consultationType: string
  classificationLabel: string
  message: string
  resolved: boolean
}

export interface AuditInfo {
  policyVersion: string
  promptVersion: string
  modelVersion: string
  timestamp: string
  operator: string
}

export interface OperatorInfo {
  name: string
  department: string
  currentPolicy: string
  model: string
}

export type SessionStatus = 'reviewing' | 'ready' | 'sent'

export interface ConsultationSession {
  id: string
  status: SessionStatus
  statusLabel: string
  operator: OperatorInfo
  conversation: ConversationMessage[]
  caseInfo: CaseInformation
  aiResponse: string
  retrievalQuery: RetrievalQuery
  retrievalHits: RetrievalHit[]
  metadata: GenerationMetadata
  validationChecks: ValidationCheck[]
  policyReference: PolicyReference
  activity: ActivityEvent[]
  conditionalApproval: ConditionalApproval
  audit: AuditInfo
  readyToSend: boolean
}
