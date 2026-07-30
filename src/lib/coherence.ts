/**
 * 사유 ↔ 실제 수정 정합성 검사 (스펙 §2.5). 규칙 기반이며 LLM 이 아니다.
 *
 * 상담직원이 고른 사유가 실제로 고친 내용과 맞는지 본다.
 * "수치 오류"라고 골라놓고 문구만 덧붙였다면 mismatch 로 잡아 승인 자체를 막는다.
 */

import type { Reason } from './constants';

export type DiffKind =
  | 'number_changed'
  | 'condition_added'
  | 'assertion_softened'
  | 'verification_added'
  | 'benefit_risk_added'
  | 'procedure_fixed';

export const DIFF_KIND_LABEL: Record<DiffKind, string> = {
  number_changed: '수치 변경',
  condition_added: '조건 문구 추가',
  assertion_softened: '단정 표현 완화',
  verification_added: '확인 안내 추가',
  benefit_risk_added: '불이익 문구 추가',
  procedure_fixed: '절차·서류 표현 변경',
};

/** 사유별 요구 diffKind. 하나라도 만족하면 적합. */
export const REASON_REQUIREMENTS: Record<Reason, DiffKind[]> = {
  '수치 오류': ['number_changed'],
  '조건 누락': ['condition_added'],
  '확정성 과장': ['assertion_softened'],
  '자격 미확인': ['verification_added'],
  '불이익 누락': ['benefit_risk_added', 'condition_added'],
  '절차·서류 오류': ['procedure_fixed', 'number_changed'],
};

const NUMBER_TOKEN = /[0-9][0-9,.]*/g;

/** 조건 표지 — 신규 등장 여부만 본다. */
const CONDITION_MARKERS: RegExp[] = [
  /단,/,
  /경우/,
  /조건/,
  /한하[여어]/,
  /한해/,
  /이내/,
  /이후/,
  /전에/,
  /(?:계좌|고객|회원|대상|경우|회원만|건)만\s/,
];

/** 단정 완화 — 완화 표현이 새로 생겼거나, 강한 단정어가 사라졌으면 참. */
const SOFTENED_MARKERS: RegExp[] = [
  /일\s*수\s*있습니다/,
  /될\s*수\s*있습니다/,
  /수\s*있습니다/,
  /확인\s*후\s*안내/,
  /달라질\s*수\s*있습니다/,
];
const ASSERTIVE_MARKERS: RegExp[] = [/반드시/, /무조건/, /즉시/, /절대/, /확정적으로/];

const VERIFICATION_MARKERS: RegExp[] = [
  /확인이\s*필요/,
  /확인해\s*주시기/,
  /확인\s*후/,
  /문의/,
];

const RISK_MARKERS: RegExp[] = [
  /불이익/,
  /손실/,
  /해지/,
  /연체/,
  /제한/,
  /불가/,
  /추징/,
  /부담/,
];

/** 절차·서류 어휘 — 추가/삭제 어느 쪽이든 변화가 있으면 참. */
const PROCEDURE_TOKENS = ['서류', '제출', '신청', '발급', '증빙', '접수', '창구', '영업점'];

function numberTokens(text: string): Set<string> {
  return new Set(text.match(NUMBER_TOKEN) ?? []);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function newlyAppears(markers: RegExp[], oldText: string, newText: string): boolean {
  return markers.some((marker) => !marker.test(oldText) && marker.test(newText));
}

function disappears(markers: RegExp[], oldText: string, newText: string): boolean {
  return markers.some((marker) => marker.test(oldText) && !marker.test(newText));
}

function procedureTokenSet(text: string): Set<string> {
  return new Set(PROCEDURE_TOKENS.filter((token) => text.includes(token)));
}

/** 원문과 수정문을 비교해 어떤 종류의 수정이 일어났는지 분류한다. */
export function classifyDiff(oldText: string, newText: string): DiffKind[] {
  const kinds: DiffKind[] = [];

  if (!setsEqual(numberTokens(oldText), numberTokens(newText))) {
    kinds.push('number_changed');
  }
  if (newlyAppears(CONDITION_MARKERS, oldText, newText)) {
    kinds.push('condition_added');
  }
  if (
    newlyAppears(SOFTENED_MARKERS, oldText, newText) ||
    disappears(ASSERTIVE_MARKERS, oldText, newText)
  ) {
    kinds.push('assertion_softened');
  }
  if (newlyAppears(VERIFICATION_MARKERS, oldText, newText)) {
    kinds.push('verification_added');
  }
  if (newlyAppears(RISK_MARKERS, oldText, newText)) {
    kinds.push('benefit_risk_added');
  }
  if (!setsEqual(procedureTokenSet(oldText), procedureTokenSet(newText))) {
    kinds.push('procedure_fixed');
  }

  return kinds;
}

export interface CoherenceResult {
  reason: Reason;
  diffKind: DiffKind[];
  result: 'pass' | 'mismatch';
  detail: string;
}

function labelsOf(kinds: DiffKind[]): string {
  return kinds.map((kind) => DIFF_KIND_LABEL[kind]).join(' · ');
}

/** 사유와 실제 수정을 대조한다. mismatch 면 승인·발송이 막힌다. */
export function checkCoherence(
  reason: Reason,
  oldText: string,
  newText: string,
): CoherenceResult {
  const diffKind = classifyDiff(oldText, newText);
  const required = REASON_REQUIREMENTS[reason];
  const satisfied = required.filter((kind) => diffKind.includes(kind));

  if (satisfied.length > 0) {
    return {
      reason,
      diffKind,
      result: 'pass',
      detail: `수정문에서 ${labelsOf(satisfied)} 확인 — 사유와 일치합니다.`,
    };
  }

  if (diffKind.length === 0) {
    return {
      reason,
      diffKind,
      result: 'mismatch',
      detail: '수정된 내용이 없어 사유를 확인할 수 없습니다.',
    };
  }

  const wantsNumber = required.includes('number_changed');
  if (wantsNumber && !diffKind.includes('number_changed')) {
    return {
      reason,
      diffKind,
      result: 'mismatch',
      detail: `문구 추가만 있고 수치 변경 없음 — ${reason} 사유와 맞지 않습니다.`,
    };
  }

  return {
    reason,
    diffKind,
    result: 'mismatch',
    detail: `${reason} 사유에는 ${required
      .map((kind) => DIFF_KIND_LABEL[kind])
      .join(' 또는 ')}이(가) 필요하지만, 실제 수정에서는 ${labelsOf(diffKind)}만 확인되었습니다.`,
  };
}
