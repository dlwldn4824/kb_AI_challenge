/**
 * 이벤트 타입 정의 (스펙 §2.1).
 * append-only 로그의 스키마이자, projection 이 읽는 유일한 입력이다.
 */

import type { Reason } from './constants';
import type { DiffKind } from './coherence';
import type { SignalType, Tier } from './scoring';

export const EVENT_TYPES = [
  'draft_created',
  'signals_detected',
  'review_started',
  'sentence_kept',
  'sentence_edited',
  'reason_selected',
  'coherence_checked',
  'approved',
  'approval_invalidated',
  'dispatch_attempted',
  'dispatch_blocked',
  'dispatched',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface DraftSentence {
  idx: number;
  text: string;
  /** 하이라이트 구간 오프셋. 신호가 없으면 null. */
  flagStart: number | null;
  flagEnd: number | null;
}

export interface DetectedSignal {
  sentenceIdx: number;
  type: SignalType;
  tier: Tier;
  score: number;
  label: string;
  evidence: string;
}

export interface DraftCreatedPayload {
  product: string;
  inquiry: string;
  receivedAt: string;
  model: string;
  modelVersion: string;
  confidence: number;
  sentences: DraftSentence[];
}

export interface SignalsDetectedPayload {
  signals: DetectedSignal[];
  r: number;
  /**
   * 레퍼런스 확증 건수(팩트 불일치 + 필수 조항 누락). 큐 정렬 2차 키로만 쓴다.
   * 이 필드가 생기기 전 이벤트에는 없으므로 옵셔널이다.
   */
  confirmedHits?: number;
  /** R=0 무작위 표본 검토 대상으로 선정되었을 때만 true. */
  sampled?: boolean;
}

export interface SentenceKeptPayload {
  sentenceIdx: number;
}

export interface SentenceEditedPayload {
  sentenceIdx: number;
  newText: string;
}

export interface ReasonSelectedPayload {
  sentenceIdx: number;
  reason: Reason;
}

export interface CoherenceCheckedPayload {
  sentenceIdx: number;
  reason: Reason;
  diffKind: DiffKind[];
  result: 'pass' | 'mismatch';
  detail: string;
}

export interface ApprovedPayload {
  versionId: string;
  contentDigest: string;
  approver: string;
  team: string;
  reason: string;
  modelVersion: string;
  sealedAt: string;
  seal: string;
}

export interface ApprovalInvalidatedPayload {
  invalidatedApprovalSeq: number;
  cause: 'content_changed';
}

export interface DispatchAttemptedPayload {
  contentDigest: string;
  via: 'ui' | 'api';
  /**
   * 시도한 문안 원문. 차단 화면이 "무엇이 달랐는지"를 보여 주는 증거다.
   * 이 필드가 생기기 전에 기록된 이벤트에는 없을 수 있으므로 옵셔널이다.
   */
  content?: string;
}

export type BlockReason = 'no_valid_approval' | 'digest_mismatch' | 'seal_invalid';

export interface DispatchBlockedPayload {
  reason: BlockReason;
  expectedDigest?: string;
  actualDigest?: string;
}

export interface DispatchedPayload {
  contentDigest: string;
  versionId: string;
  dispatchedAt: string;
}

export type EventPayloadMap = {
  draft_created: DraftCreatedPayload;
  signals_detected: SignalsDetectedPayload;
  review_started: Record<string, never>;
  sentence_kept: SentenceKeptPayload;
  sentence_edited: SentenceEditedPayload;
  reason_selected: ReasonSelectedPayload;
  coherence_checked: CoherenceCheckedPayload;
  approved: ApprovedPayload;
  approval_invalidated: ApprovalInvalidatedPayload;
  dispatch_attempted: DispatchAttemptedPayload;
  dispatch_blocked: DispatchBlockedPayload;
  dispatched: DispatchedPayload;
};

export interface StoredEvent<T extends EventType = EventType> {
  seq: number;
  caseId: string;
  type: T;
  actor: string;
  ts: string;
  payload: EventPayloadMap[T];
}

export type AnyStoredEvent = {
  [K in EventType]: StoredEvent<K>;
}[EventType];
