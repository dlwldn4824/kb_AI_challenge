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
  // 승인 확정 직후 시스템이 남기는 기록이라 승인과 같은 초를 쓴다.
  learning_signal_saved: '2026-07-23T12:54:12+09:00',
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

/**
 * 정본 케이스의 유지 판정은 구절마다 다른 시각에 눌렸다.
 * 한 초에 몰아 두면 타임라인에서 "사람이 하나씩 읽고 판단했다"가 보이지 않는다.
 * (3번 구절은 수정이라 여기 없고, sentence_edited 시각을 따른다.)
 */
const PRIMARY_KEPT_TS: Record<number, string> = {
  0: '2026-07-23T12:52:08+09:00',
  1: '2026-07-23T12:52:19+09:00',
  2: '2026-07-23T12:52:26+09:00',
  4: '2026-07-23T12:52:47+09:00',
};

export function eventTs(caseId: string, type: EventType, sentenceIdx?: number): string {
  if (caseId === PRIMARY_CASE_ID) {
    if (type === 'sentence_kept' && sentenceIdx !== undefined) {
      const perSentence = PRIMARY_KEPT_TS[sentenceIdx];
      if (perSentence) return perSentence;
    }
    const fixed = PRIMARY_TIMELINE[type];
    if (fixed) return fixed;
  }
  return nowKst();
}

/** ISO8601 → `HH:MM` (큐의 접수 시각 표시용). */
export function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * `N시간 N분 전` 표기. 기준 시각을 인자로 받아 화면마다 흔들리지 않게 한다.
 * (데모의 "현재 시각"은 DISPLAY.chromeTimestamp 로 고정되어 있다.)
 */
export function relativeLabel(iso: string, nowIso: string): string {
  const minutes = Math.floor((Date.parse(nowIso) - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}시간 전` : `${hours}시간 ${rest}분 전`;
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
