/**
 * 상품별 정본 팩트 테이블 (스펙 §2.6 보강).
 *
 * 감지기가 "위험해 보이는 구절"을 찾는 것만으로는 수치 오류와 조항 누락을 못 잡는다.
 * 이 파일은 상품마다 옳은 값이 무엇인지를 적어 두고, 감지기가 초안을 그 값과
 * 대조할 수 있게 한다. LLM 은 쓰지 않는다 — 전부 정규식 대조다.
 *
 * 세 종류를 구분한다.
 *  - numbers   : 문맥으로 슬롯을 특정한 뒤 값이 정본과 다르면 발화 (수치 오류)
 *  - conditions: 어떤 주장을 하는 "그 문장"에 한정 조건이 붙어 있는지 (조건절 삭제)
 *  - required  : 초안 전체가 어떤 주장을 하면 반드시 함께 있어야 하는 신호 유형 (조항 누락)
 *
 * 슬롯 패턴은 반드시 문맥을 포함시킨다. 맨 숫자만 잡으면 다른 뜻의 숫자까지 물어
 * 오탐이 된다(예: "기본이율의 30%"는 중도해지이율이지 만기 후 이율이 아니다).
 */

import type { SignalType } from '@/lib/scoring';

/** 문맥으로 특정한 수치 슬롯. 캡처그룹 1 이 정본과 대조할 값이다. */
export interface NumericFact {
  key: string;
  label: string;
  slot: RegExp;
  canonical: string;
  type: SignalType;
}

/** 주장 문장에 반드시 붙어 있어야 하는 한정 조건. 문장 단위로 본다. */
export interface ConditionFact {
  key: string;
  label: string;
  claim: RegExp;
  qualifier: RegExp;
  type: SignalType;
}

/** 초안 전체가 이 주장을 하면 함께 있어야 하는 신호 유형들. 부재를 감지한다. */
export interface RequiredElement {
  key: string;
  label: string;
  claim: RegExp;
  requires: SignalType[];
}

export interface ProductFacts {
  product: string;
  /** 정본 출처 표기 (UI 노출용). 공시 확인일 포함. */
  source?: string;
  numbers: NumericFact[];
  conditions: ConditionFact[];
  required: RequiredElement[];
}

/** 쉼표·공백을 지운 비교용 표기. "15,000" 과 "15000" 을 같게 본다. */
export function normalizeNumber(raw: string): string {
  return raw.replace(/[,\s]/g, '');
}

export const PRODUCT_FACTS: ProductFacts[] = [
  {
    product: 'KB장병내일준비적금',
    // ── 정본 출처 (T16-b) ─────────────────────────────────────────
    // KB 상품설명서 공시 확인: 2026-08-02
    //  - 상품공시 페이지: https://obank1.kbstar.com/quics?page=C016613 (웹상품코드 DP000939)
    //  - KB 공식 안내: https://kbthink.com/main/asset-management/wealth-manage-tip/kbthink-original/202411/soldiers-tomorrow.html
    // 아래 기존 6개 팩트는 전부 공시와 일치 확인됨:
    //  은행별 월 최고 30만원 · 고객별(합산) 월 55만원(2025-01-02부터) · 한도변경 1회
    //  (2025-01-01 이전 가입 계좌, 5만원 단위) · 가입자격 확인서 발급일로부터 3개월 이내.
    // 공시에서 추가 확인했으나 감지 슬롯으로 배선하지 않은 팩트(정본 케이스 R=11 불변 보호):
    //  가입대상 현역병·상근예비역·의무경찰·사회복무요원·대체복무요원(잔여 복무 1개월 이상) ·
    //  계약기간 1~24개월(만기=전역예정일) · 기본금리 연 4.0~5.0% + 우대 최고 4.5%p ·
    //  비과세는 2026-12-31까지 가입분 한정, 중도해지 시 비과세·1% 이자지원 상실 ·
    //  매칭지원금 2024년 이후 납입분 원금의 100%(만기 해지 시) · 1인 1계좌, 만기해지 후 재가입 불가.
    source: 'KB 상품설명서 공시 (kbstar.com 상품공시 DP000939 · 확인일 2026-08-02)',
    numbers: [
      {
        key: 'monthly_limit',
        label: '은행별 월 저축한도',
        slot: /월\s*저축한도[^.]*?최고\s*([0-9][0-9,.]*)\s*만원/,
        canonical: '30',
        type: 'numeric_change',
      },
      {
        key: 'monthly_limit_ceiling',
        label: '매월 저축 가능 금액',
        slot: /매월\s*([0-9][0-9,.]*)\s*만원\s*이하/,
        canonical: '30',
        type: 'numeric_change',
      },
      {
        key: 'combined_limit',
        label: '만기 원리금 합산 한도',
        slot: /원리금[^.]*?최고\s*([0-9][0-9,.]*)\s*만원/,
        canonical: '55',
        type: 'numeric_change',
      },
      {
        key: 'limit_change_count',
        label: '비과세 한도변경 허용 횟수',
        slot: /([0-9][0-9,.]*)\s*회에\s*한하[여어]/,
        canonical: '1',
        type: 'exemption_condition',
      },
      {
        key: 'document_validity',
        label: '제출 서류 유효기간',
        slot: /제출\s*서류[^.]*?([0-9][0-9,.]*)\s*개월\s*이내\s*발급분/,
        canonical: '3',
        type: 'numeric_change',
      },
      {
        key: 'join_cutoff_year',
        label: '한도변경 가능 가입 기준 연도',
        slot: /([0-9]{2,4})\s*년\s*[0-9]{1,2}\s*월\s*[0-9]{1,2}\s*일\s*전에\s*가입/,
        canonical: '25',
        type: 'numeric_change',
      },
    ],
    conditions: [
      {
        key: 'limit_change_needs_count',
        label: '한도변경 가능 안내에는 허용 횟수가 붙어야 한다',
        claim: /한도\s*변경[^.]*?가능/,
        qualifier: /[0-9][0-9,.]*\s*회에\s*한하[여어]/,
        type: 'exemption_condition',
      },
      {
        key: 'document_needs_validity',
        label: '제출 서류 안내에는 발급 기한이 붙어야 한다',
        claim: /제출\s*서류/,
        qualifier: /[0-9][0-9,.]*\s*개월\s*이내\s*발급분/,
        type: 'procedure_document',
      },
    ],
    required: [
      {
        key: 'limit_change_notice',
        label: '한도변경 안내',
        claim: /한도\s*변경[^.]*?가능/,
        requires: ['deadline_eligibility', 'disadvantage_omission'],
      },
      {
        key: 'termination_procedure',
        label: '해지 절차 안내',
        claim: /해지\s*시/,
        requires: ['procedure_document'],
      },
    ],
  },
  {
    product: 'KB주택담보대출',
    numbers: [
      {
        key: 'prepayment_fee_rate',
        label: '중도상환수수료율',
        slot: /상환\s*원금의\s*([0-9][0-9,.]*)\s*%/,
        canonical: '1.4',
        type: 'numeric_change',
      },
      {
        key: 'fee_waiver_years',
        label: '수수료 면제 경과 기간',
        slot: /대출\s*실행일부터\s*([0-9][0-9,.]*)\s*년/,
        canonical: '3',
        type: 'numeric_change',
      },
    ],
    conditions: [
      {
        key: 'waiver_needs_period',
        label: '수수료 면제 안내에는 경과 기간이 붙어야 한다',
        claim: /수수료[^.]*?면제/,
        qualifier: /대출\s*실행일부터\s*[0-9][0-9,.]*\s*년/,
        type: 'exemption_condition',
      },
      {
        key: 'document_needs_deadline',
        label: '증빙 서류 안내에는 제출 시점이 붙어야 한다',
        claim: /증빙\s*서류/,
        qualifier: /상환\s*예정일\s*전에/,
        type: 'procedure_document',
      },
    ],
    required: [
      {
        key: 'fee_waiver_notice',
        label: '중도상환수수료 면제 안내',
        claim: /수수료[^.]*?면제/,
        requires: ['deadline_eligibility', 'disadvantage_omission'],
      },
      {
        key: 'prepayment_procedure',
        label: '중도상환 절차 안내',
        claim: /상환\s*예정일/,
        requires: ['procedure_document'],
      },
    ],
  },
  {
    product: 'KB더블모아예금',
    numbers: [
      {
        key: 'post_maturity_rate',
        label: '만기 후 이율 (기본이율 대비)',
        slot: /만기\s*후\s*이율[^.]*?기본이율의\s*([0-9][0-9,.]*)\s*%/,
        canonical: '50',
        type: 'numeric_change',
      },
    ],
    conditions: [
      {
        key: 'tax_exemption_needs_account',
        label: '이자소득세 면제 안내에는 비과세 계좌 조건이 붙어야 한다',
        claim: /이자소득세[^.]*?면제/,
        qualifier: /비과세종합저축/,
        type: 'exemption_condition',
      },
      {
        key: 'identity_document_needs_validity',
        label: '실명확인 증표 안내에는 발급 기한이 붙어야 한다',
        claim: /실명확인\s*증표/,
        qualifier: /[0-9][0-9,.]*\s*개월\s*이내\s*발급분/,
        type: 'procedure_document',
      },
    ],
    required: [
      {
        key: 'maturity_termination_notice',
        label: '만기 해지 안내',
        claim: /만기\s*해지/,
        requires: ['disadvantage_omission', 'deadline_eligibility', 'procedure_document'],
      },
    ],
  },
  {
    product: 'KB국민카드 프리미엄',
    numbers: [
      {
        key: 'annual_fee',
        label: '연회비 청구 금액',
        slot: /연회비[^.]*?([0-9][0-9,.]*)\s*원/,
        canonical: '15,000',
        type: 'numeric_change',
      },
      {
        key: 'waiver_spend_threshold',
        label: '연회비 면제 실적 기준',
        slot: /이용실적이\s*([0-9][0-9,.]*)\s*만원\s*이상/,
        canonical: '300',
        type: 'numeric_change',
      },
    ],
    conditions: [
      {
        key: 'waiver_needs_threshold',
        label: '연회비 면제 안내에는 실적 기준 금액이 붙어야 한다',
        claim: /연회비[^.]*?면제/,
        qualifier: /이용실적이\s*[0-9][0-9,.]*\s*만원\s*이상/,
        type: 'exemption_condition',
      },
    ],
    required: [
      {
        key: 'annual_fee_waiver_notice',
        label: '연회비 면제 안내',
        claim: /연회비[^.]*?면제/,
        requires: ['deadline_eligibility', 'disadvantage_omission', 'procedure_document'],
      },
    ],
  },
];

export function findProductFacts(product: string | undefined): ProductFacts | undefined {
  if (!product) return undefined;
  return PRODUCT_FACTS.find((facts) => facts.product === product);
}
