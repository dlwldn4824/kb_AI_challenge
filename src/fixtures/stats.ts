/**
 * 화면에 뜨는 총량 지표 (스펙 §5).
 *
 * 주의: 아래 숫자는 seed 하는 20건에서 파생되지 않는다.
 * "오늘 하루 은행 전체"를 가정한 합성 상수이며, 20건은 그중 큐에 올라온 표본이다.
 * 20건에서 계산 가능한 값(차단 건수 등)도 화면 문구를 스펙과 맞추기 위해 여기 상수를 쓴다.
 */

import { MODEL_NAME, MODEL_VERSION } from '@/lib/constants';

export const STATS = {
  /** 오늘 AI 초안 */
  draftsToday: 1248,
  /** 개입 필요 */
  interventionNeeded: 27,
  /** 개입 필요 비율 (%) */
  interventionRate: 2.2,
  /** 저위험 무작위 표본 */
  randomSamples: 12,
  /** 검토 대기 */
  pendingReview: 39,
  /** 발송 차단 */
  blockedToday: 1,
} as const;

export const DISPLAY = {
  /** 상단 chrome 바 우측 시각 (스펙 §4 공통). */
  chromeTimestamp: '2026-07-23 14:32',
  /** 문장 대조 소요 표시 (스펙 §4.3). */
  comparisonElapsed: '00:00.4',
  /** 등기 조회 이력 (스펙 §4.3). */
  registryLookups: 0,
  model: MODEL_NAME,
  modelVersion: MODEL_VERSION,
} as const;

/** 고객 수신 화면 목업의 고객 말풍선 (스펙 §4.3). */
export const CUSTOMER_QUESTION =
  '제가 1월 31일 전역인데 한도 늘리고 바로 입금하면 되나요?';
