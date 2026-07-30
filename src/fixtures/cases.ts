/**
 * 합성 상담 20건 (스펙 §5, §6). 실제 고객 데이터가 아니다.
 *
 * 문장에는 신호를 주석하지 않는다. 어떤 구절이 위험한지는 seed 실행 시
 * src/lib/scoring.ts 의 감지기가 규칙으로 찾아낸다(스펙 §2.6).
 * `expected` 는 감지 결과를 검증하기 위한 기대값일 뿐 입력이 아니며,
 * seed 가 실제 감지 결과와 대조해 어긋나면 즉시 실패한다.
 */

import type { Tier } from '@/lib/scoring';

export type SeedFlow =
  | 'pending' // draft_created + signals_detected 까지 (검토 대기)
  | 'sampled' // R=0 무작위 표본 선정 (표본 검토)
  | 'in_review' // review_started 까지 (검토 중)
  | 'approved' // 판정 + 승인까지 (검토 완료)
  | 'published' // 승인 + 발송까지 (발행 완료)
  | 'blocked'; // 승인 후 변조 발송 시도 → 차단

export interface CaseFixture {
  caseId: string;
  product: string;
  inquiry: string;
  /** 접수 시각 (ISO8601 KST). 큐에는 HH:MM 으로 표시된다. */
  receivedAt: string;
  confidence: number;
  sentences: string[];
  flow: SeedFlow;
  expected: { r: number; tiers: Tier[] };
  /** blocked 흐름에서 발송 단계에 끼어든 변조 문안. */
  tamperedContent?: string;
  note?: string;
}

/** 스펙 §5 정본 케이스. 문장·수치·사유는 한 글자도 바꾸지 않는다. */
export const PRIMARY_SENTENCES = [
  '한 은행의 월 저축한도는 최고 30만원이며, 매월 30만원 이하 금액을 만기일 전일까지 저축 가능합니다.',
  '위 계좌는 1회에 한하여 비과세저축 한도 변경이 가능합니다.',
  '25년 1월 1일 전에 가입한 계좌만 변경이 가능합니다.',
  '조기전역 · 신분전환 · 금융소득종합과세 대상의 경우 비대면 해지가 불가합니다.',
  '해지 시 제출 서류는 3개월 이내 발급분이어야 합니다.',
];

/** 스펙 §5 데모 판정: 1·2·3·5 유지, 4번 구절만 수정. */
export const PRIMARY_DEMO = {
  keptIdx: [0, 1, 2, 4],
  editedIdx: 3,
  reason: '자격 미확인' as const,
  newText:
    '조기전역 · 신분전환 · 금융소득종합과세 대상의 경우 비대면 해지가 불가합니다. 고객님이 해당 대상인지는 확인이 필요하니, 전역 예정일과 신분 전환 여부를 먼저 확인해 주시기 바랍니다.',
  verdictSummary: '5개 구절 중 1개 수정',
  detectedSummary: '감지 5 · 유지 4 · 수정 1',
};

export const CASES: CaseFixture[] = [
  {
    caseId: 'RG-2026-081-0142',
    product: 'KB장병내일준비적금',
    inquiry: '비과세 저축한도 20→30만원 변경 · 급여공제',
    receivedAt: '2026-07-23T12:51:00+09:00',
    confidence: 0.6,
    sentences: PRIMARY_SENTENCES,
    flow: 'pending',
    expected: { r: 11, tiers: ['S', 'S', 'A', 'A', 'B'] },
    note: '정본 데모 케이스. 시연에서 직접 검토·승인·발송한다.',
  },
  {
    caseId: 'RG-2026-081-0139',
    product: 'KB장병내일준비적금',
    inquiry: '만기 비대면 해지 조건 · 자격 제외 대상',
    receivedAt: '2026-07-23T14:05:00+09:00',
    confidence: 0.62,
    sentences: [
      '만기 시 원리금은 최고 55만원 한도 내에서 지급됩니다.',
      '이자소득은 1인 2계좌에 한하여 비과세 혜택이 적용됩니다.',
      '조기전역이나 신분전환에 해당하면 비대면 해지가 불가합니다.',
      '만기일은 가입 시 안내된 일자와 같습니다.',
    ],
    flow: 'pending',
    expected: { r: 8, tiers: ['S', 'S', 'A'] },
  },
  {
    caseId: 'RG-2026-081-0128',
    product: '주택청약종합저축',
    inquiry: '연간 소득공제 한도 · 무주택 요건',
    receivedAt: '2026-07-23T13:41:00+09:00',
    confidence: 0.58,
    sentences: [
      '연간 납입액 300만원까지 소득공제가 적용됩니다.',
      '무주택 세대주 요건을 충족한 가입자가 대상입니다.',
      '중도 해지 시 소득공제 받은 금액이 추징될 수 있습니다.',
    ],
    flow: 'pending',
    expected: { r: 7, tiers: ['S', 'A', 'A'] },
  },
  {
    caseId: 'RG-2026-081-0121',
    product: 'ELS 제12,340회차',
    inquiry: '조기상환 평가일 · 낙인 조건',
    receivedAt: '2026-07-23T13:20:00+09:00',
    confidence: 0.55,
    sentences: [
      '1차 조기상환 평가일의 기준가격은 최초기준가격의 90% 이상입니다.',
      '평가일에 조건을 충족하면 반드시 조기상환됩니다.',
      '낙인 발생 여부는 기초자산 종가 기준으로 판정합니다.',
    ],
    flow: 'in_review',
    expected: { r: 6, tiers: ['S', 'S'] },
    note: '스펙 §6: R=6 은 numeric_change + overcertainty 조합.',
  },
  {
    caseId: 'RG-2026-081-0104',
    product: 'KB국민카드 프리미엄',
    inquiry: '연회비 면제 조건',
    receivedAt: '2026-07-23T12:38:00+09:00',
    confidence: 0.64,
    sentences: [
      '직전 1년간 이용실적 기준을 충족한 회원이 대상입니다.',
      '실적 기준에 미달하면 연회비가 청구되며 해지 시에도 환급되지 않습니다.',
      '실적 확인 결과는 별도 신청서 제출 없이 조회할 수 있습니다.',
    ],
    flow: 'pending',
    expected: { r: 5, tiers: ['A', 'A', 'B'] },
  },
  {
    caseId: 'RG-2026-081-0117',
    product: 'KB더블모아예금',
    inquiry: '중도해지 이율 · 만기 후 이율',
    receivedAt: '2026-07-23T13:02:00+09:00',
    confidence: 0.61,
    sentences: [
      '중도에 찾으시는 경우 기본이율의 30%가 적용됩니다.',
      '만기 후 이율은 만기일 다음 날부터 적용됩니다.',
      '이율 적용 내역 확인을 위해서는 통장 사본 제출이 필요합니다.',
    ],
    flow: 'pending',
    expected: { r: 4, tiers: ['S', 'B'] },
  },
  {
    caseId: 'RG-2026-081-0098',
    product: 'KB주택담보대출',
    inquiry: '중도상환수수료 면제 조건',
    receivedAt: '2026-07-23T12:11:00+09:00',
    confidence: 0.66,
    sentences: [
      '대출 실행일부터 3년이 지난 이후 상환하는 경우가 대상입니다.',
      '상환 예정일 전에 증빙 서류를 제출해 주셔야 합니다.',
      '수수료율은 상환 시점에 따라 달라집니다.',
    ],
    flow: 'approved',
    expected: { r: 3, tiers: ['A', 'B'] },
  },
  {
    caseId: 'RG-2026-081-0091',
    product: '청년희망적금',
    inquiry: '우대금리 적용 요건',
    receivedAt: '2026-07-23T11:54:00+09:00',
    confidence: 0.69,
    sentences: [
      '우대금리는 급여이체 실적 요건을 충족한 경우에 적용됩니다.',
      '적용 여부는 매월 말일 기준으로 산정합니다.',
    ],
    flow: 'approved',
    expected: { r: 2, tiers: ['A'] },
    note:
      'Figma 큐는 이 행을 B·B 로 그렸지만, R 은 "신호 유형별" 티어 점수의 합이라 같은 유형 두 번은 1회만 가산된다(스펙 §0·§6). B·B 로는 R=2 를 만들 수 없어 R=2 를 유지하고 신호를 A 1건으로 잡았다.',
  },
  {
    caseId: 'RG-2026-081-0083',
    product: 'KB Star 정기예금',
    inquiry: '금리 조회',
    receivedAt: '2026-07-23T11:30:00+09:00',
    confidence: 0.91,
    sentences: [
      'KB Star 정기예금의 기본금리는 영업점 게시 이율을 따릅니다.',
      '우대조건 없이 가입하셔도 기본금리는 동일하게 적용됩니다.',
    ],
    flow: 'sampled',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0077',
    product: '입출금통장',
    inquiry: '이체한도 변경 절차',
    receivedAt: '2026-07-23T11:02:00+09:00',
    confidence: 0.93,
    sentences: [
      '이체한도 변경은 인터넷뱅킹 또는 영업점에서 처리하실 수 있습니다.',
      '변경된 한도는 당일부터 적용됩니다.',
    ],
    flow: 'sampled',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0135',
    product: 'KB국민은행 신용대출',
    inquiry: '금리인하요구권 신청 서류',
    receivedAt: '2026-07-23T10:47:00+09:00',
    confidence: 0.72,
    sentences: [
      '금리인하요구권은 영업점 또는 인터넷뱅킹으로 접수하실 수 있습니다.',
      '재직 및 소득 증빙 서류를 함께 접수해 주시기 바랍니다.',
    ],
    flow: 'blocked',
    expected: { r: 1, tiers: ['B'] },
    tamperedContent:
      '금리인하요구권은 영업점 또는 인터넷뱅킹으로 접수하실 수 있습니다.\n재직 및 소득 증빙 서류 없이도 즉시 처리됩니다.',
    note: '승인 후 발송 단계에서 문안이 바뀐 사례. KPI "발송 차단 1건" 의 근거다.',
  },
  {
    caseId: 'RG-2026-081-0072',
    product: 'KB국민카드 체크카드',
    inquiry: '카드 재발급 진행 상황',
    receivedAt: '2026-07-23T11:41:00+09:00',
    confidence: 0.95,
    sentences: [
      '요청하신 체크카드 재발급은 정상 접수되었습니다.',
      '배송 진행 상황은 스타뱅킹 앱에서 확인하실 수 있습니다.',
    ],
    flow: 'published',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0068',
    product: 'KB스타뱅킹',
    inquiry: '간편비밀번호 재설정 방법',
    receivedAt: '2026-07-23T11:18:00+09:00',
    confidence: 0.94,
    sentences: [
      '간편비밀번호는 앱 로그인 후 설정 메뉴에서 다시 지정하실 수 있습니다.',
      '지정이 끝나면 기존 비밀번호는 사용되지 않습니다.',
    ],
    flow: 'published',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0064',
    product: 'KB국민은행 영업점',
    inquiry: '영업시간 안내',
    receivedAt: '2026-07-23T10:59:00+09:00',
    confidence: 0.96,
    sentences: [
      '영업점 창구 업무 시간은 평일 09:00부터 16:00까지입니다.',
      '점심시간에도 창구는 정상 운영합니다.',
    ],
    flow: 'published',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0059',
    product: 'KB국민은행 외화예금',
    inquiry: '환율 우대 적용 문의',
    receivedAt: '2026-07-23T10:33:00+09:00',
    confidence: 0.9,
    sentences: [
      '환율 우대는 스타뱅킹에서 환전을 신청하시면 자동으로 적용됩니다.',
      '적용된 환율은 거래 내역에서 확인하실 수 있습니다.',
    ],
    flow: 'published',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0055',
    product: '주택청약종합저축',
    inquiry: '납입 회차 조회',
    receivedAt: '2026-07-23T10:12:00+09:00',
    confidence: 0.92,
    sentences: [
      '납입 회차는 스타뱅킹 상품 상세 화면에서 조회하실 수 있습니다.',
      '창구를 방문하지 않아도 조회가 가능합니다.',
    ],
    flow: 'pending',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0048',
    product: 'KB국민은행 자동이체',
    inquiry: '자동이체 일자 변경',
    receivedAt: '2026-07-23T09:58:00+09:00',
    confidence: 0.93,
    sentences: [
      '자동이체 출금일은 스타뱅킹 자동이체 관리 메뉴에서 변경하실 수 있습니다.',
      '변경 내용은 다음 출금일부터 반영됩니다.',
    ],
    flow: 'pending',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0042',
    product: 'KB국민카드',
    inquiry: '포인트리 사용처 안내',
    receivedAt: '2026-07-23T09:35:00+09:00',
    confidence: 0.94,
    sentences: [
      '포인트리는 카드 대금 결제와 제휴 가맹점 결제에 사용하실 수 있습니다.',
      '보유 포인트리는 앱 메인 화면에서 확인하실 수 있습니다.',
    ],
    flow: 'pending',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0037',
    product: 'KB스타뱅킹',
    inquiry: '알림 설정 변경',
    receivedAt: '2026-07-23T09:14:00+09:00',
    confidence: 0.95,
    sentences: [
      '입출금 알림은 앱 알림 설정 메뉴에서 켜고 끄실 수 있습니다.',
      '설정은 기기별로 따로 저장됩니다.',
    ],
    flow: 'pending',
    expected: { r: 0, tiers: [] },
  },
  {
    caseId: 'RG-2026-081-0031',
    product: 'KB국민은행 통장',
    inquiry: '통장 사본 발급 방법',
    receivedAt: '2026-07-23T08:52:00+09:00',
    confidence: 0.93,
    sentences: [
      '통장 사본은 스타뱅킹에서 내려받으실 수 있습니다.',
      '영업점을 방문하시면 창구에서도 받으실 수 있습니다.',
    ],
    flow: 'pending',
    expected: { r: 0, tiers: [] },
  },
];

export function findFixture(caseId: string): CaseFixture | undefined {
  return CASES.find((fixture) => fixture.caseId === caseId);
}
