/**
 * 답변등기 공통 상수.
 * 로그인/권한은 만들지 않으므로 상담직원은 고정 상수를 쓴다(스펙 §3).
 */

export const ACTOR_ID = 'EMP-4471';
export const ACTOR_TEAM = '고객센터 1팀';
export const SYSTEM_ACTOR = 'system';

/** 정본 데모 케이스 등기번호 (스펙 §5). */
export const PRIMARY_CASE_ID = 'RG-2026-081-0142';

export const MODEL_NAME = 'KB-FAQ-2026-06';
export const MODEL_VERSION = 'v3.4.2';

/** 화면 상단 chrome 바에 상시 노출되는 배지 (스펙 §1). */
export const SYNTHETIC_BADGE = 'SYNTHETIC DEMO · 합성 예시 데이터';
/** seed --aihub 로 실상담 재구성 케이스를 넣었을 때만 쓴다. SYNTHETIC 표기는 유지한다. */
export const AIHUB_BADGE = 'SYNTHETIC DEMO · AI Hub 실상담 기반 재구성';

/** 발행 대기 화면 우측 R 산식 카드 문구 (스펙 §4.1). */
export const R_FORMULA_TEXT =
  'R = Σ(영향 티어 점수 × 의심 신호 발화 여부) · 징후 없으면 0점';

/** 수정 사유 6종 — 원탭 버튼 (스펙 §2.5). */
export const REASONS = [
  '조건 누락',
  '수치 오류',
  '확정성 과장',
  '자격 미확인',
  '불이익 누락',
  '절차·서류 오류',
] as const;

export type Reason = (typeof REASONS)[number];

export function isReason(value: unknown): value is Reason {
  return typeof value === 'string' && (REASONS as readonly string[]).includes(value);
}
