/**
 * 이벤트 타임스탬프 (KST, ISO8601).
 *
 * 정본 데모 케이스(RG-2026-081-0142)는 스펙 §5 에 타임라인이 고정되어 있다.
 * 심사 시연을 몇 번 돌려도 "검토 소요 02:41", "봉인 12:54:12"가 동일하게 나와야 하므로
 * 이 케이스의 이벤트만 고정 시각을 쓰고, 나머지 케이스는 실제 시각을 쓴다.
 * 합성 데모 데이터에 한정된 장치이며 승인·차단 판정에는 관여하지 않는다.
 */

import { PRIMARY_CASE_ID } from './constants';
import type { EventType } from './events';

const KST_OFFSET_MINUTES = 9 * 60;

/** 스펙 §5 고정 타임라인. */
const PRIMARY_TIMELINE: Partial<Record<EventType, string>> = {
  draft_created: '2026-07-23T12:49:00+09:00',
  signals_detected: '2026-07-23T12:49:00+09:00',
  review_started: '2026-07-23T12:51:31+09:00',
  sentence_kept: '2026-07-23T12:52:08+09:00',
  sentence_edited: '2026-07-23T12:53:04+09:00',
  reason_selected: '2026-07-23T12:53:29+09:00',
  coherence_checked: '2026-07-23T12:53:29+09:00',
  approved: '2026-07-23T12:54:12+09:00',
  dispatch_attempted: '2026-07-23T12:54:12+09:00',
  dispatched: '2026-07-23T12:54:12+09:00',
};

export function nowKst(): string {
  return toKstIso(new Date());
}

export function toKstIso(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

export function eventTs(caseId: string, type: EventType): string {
  if (caseId === PRIMARY_CASE_ID) {
    const fixed = PRIMARY_TIMELINE[type];
    if (fixed) return fixed;
  }
  return nowKst();
}

/** ISO8601 → `HH:MM` (큐의 접수 시각 표시용). */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** 두 시각의 차이를 `MM:SS` 로. 검토 소요 표시용. */
export function durationLabel(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
