import type { RetrievalHit, RetrievalQuery } from '@/types/consultation'

export const retrievalQuery: RetrievalQuery = {
  rawQuery: '이체 제한 즉시 해제 정책 본인확인',
  filters: ['시행 중 정책만', '최신 버전', '이체 제한', '고객 상담'],
  methodLabel: 'Hybrid Search · Keyword + Vector + Metadata Filter',
}

export const retrievalHits: RetrievalHit[] = [
  {
    documentId: 'policy-transfer-004',
    title: '이체 제한 업무지침',
    version: 'v4.2',
    chapter: '제3장 거래제한 해제',
    section: '제3.2.4조',
    effectiveDate: '2026.06.01',
    relevance: 94,
    passage:
      '제한 해제 여부는 본인 확인 및 거래 상태 검토 후 결정하며, 즉시 해제를 확정적으로 안내해서는 안 된다.',
    repository: '사내 정책 센터',
    sourceUrl: '/documents/policy-transfer-004#3.2.4',
    matchType: ['keyword', 'vector', 'metadata'],
  },
  {
    documentId: 'manual-consult-028',
    title: '고객상담 표준 응대 매뉴얼',
    version: 'v2.8',
    chapter: '제5장 확정적 표현 제한',
    section: '제5.1.2조',
    effectiveDate: '2026.04.15',
    relevance: 87,
    passage:
      '처리 결과가 확인되지 않은 상태에서는 “즉시”, “반드시”, “확정” 등의 표현을 사용하지 않는다.',
    repository: '사내 정책 센터',
    sourceUrl: '/documents/manual-consult-028#5.1.2',
    matchType: ['keyword', 'vector'],
  },
  {
    documentId: 'ops-identity-011',
    title: '본인확인 및 거래제한 운영 절차',
    version: 'v3.1',
    chapter: '제2장 본인확인 절차',
    section: '제2.4.1조',
    effectiveDate: '2026.03.01',
    relevance: 81,
    passage:
      '계좌 제한 해제 상담 시 본인확인 완료 여부를 먼저 확인하고, 미완료 상태에서는 해제 가능 여부를 언급하지 않는다.',
    repository: '사내 정책 센터',
    sourceUrl: '/documents/ops-identity-011#2.4.1',
    matchType: ['vector', 'metadata'],
  },
]
