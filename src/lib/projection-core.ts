/**
 * 이벤트 재생 (스펙 §2.2). 파생 상태는 전부 여기서만 나온다.
 *
 * 이 파일에는 SQLite 도 node:crypto 도 없다. 서버 모드는 projection.ts 가
 * DB 와 Node 해시를 끼워 넣고, 정적 데모 모드는 브라우저 스토어가 같은 함수를 그대로 쓴다.
 *
 * DB 에는 뷰도, 캐시 테이블도, 가변 boolean 컬럼도 없다.
 * "이 케이스는 승인되었는가"를 묻는 방법은 이벤트를 처음부터 다시 읽는 것뿐이다.
 */

import { durationLabel } from './clock';
import type { Reason } from './constants';
import type {
  AnyStoredEvent,
  ApprovedPayload,
  BlockReason,
  DetectedSignal,
  DraftCreatedPayload,
} from './events';
import type { DiffKind } from './coherence';
import type { SignalType, Tier } from './scoring';

export type CaseStatus =
  | '검토 대기'
  | '검토 중'
  | '검토 완료'
  | '표본 검토'
  | '발행 완료'
  | '차단';

export type Verdict = 'undecided' | 'kept' | 'edited';

export interface CoherenceState {
  result: 'pass' | 'mismatch';
  diffKind: DiffKind[];
  detail: string;
}

export interface SentenceState {
  idx: number;
  originalText: string;
  currentText: string;
  flagStart: number | null;
  flagEnd: number | null;
  signal: DetectedSignal | null;
  verdict: Verdict;
  reason: Reason | null;
  coherence: CoherenceState | null;
}

export interface ApprovalState extends ApprovedPayload {
  seq: number;
  ts: string;
  /** 승인 시점 기준 각 구절 최종 텍스트를 "\n" 으로 join 한 승인문. */
  content: string;
  valid: boolean;
}

export interface DispatchBlockState {
  seq: number;
  ts: string;
  reason: BlockReason;
  expectedDigest?: string;
  actualDigest?: string;
  /** 차단된 그 시도가 실제로 보내려던 문안. 옛 이벤트에는 없을 수 있다. */
  attemptedContent?: string;
}

export interface CaseState {
  caseId: string;
  exists: boolean;
  product: string;
  inquiry: string;
  receivedAt: string;
  model: string;
  modelVersion: string;
  confidence: number;
  sentences: SentenceState[];
  signals: DetectedSignal[];
  tiers: Tier[];
  signalTypes: SignalType[];
  r: number;
  /** 레퍼런스 확증 건수. R 에는 안 들어가고 큐 정렬 2차 키로만 쓴다. */
  confirmedHits: number;
  /** 'aihub' 면 실상담 재구성 시드. 배지 문구만 바뀐다. */
  dataset: 'aihub' | null;
  sampled: boolean;
  detectedCount: number;
  keptCount: number;
  editedCount: number;
  undecidedCount: number;
  status: CaseStatus;
  reviewStartedAt: string | null;
  approval: ApprovalState | null;
  validApproval: ApprovalState | null;
  approvedContent: string | null;
  currentContent: string;
  currentDigest: string;
  dispatched: { contentDigest: string; versionId: string; dispatchedAt: string } | null;
  blocked: DispatchBlockState | null;
  reviewDuration: string | null;
  canApprove: boolean;
  approvalBlockers: string[];
  editedReasonString: string;
  events: AnyStoredEvent[];
}

/** 각 구절의 현재 텍스트를 이어 붙인 것이 곧 발송 대상 문안이다. */
export function contentOf(sentences: Array<{ currentText: string }>): string {
  return sentences.map((sentence) => sentence.currentText).join('\n');
}

function emptyState(caseId: string): CaseState {
  return {
    caseId,
    exists: false,
    product: '',
    inquiry: '',
    receivedAt: '',
    model: '',
    modelVersion: '',
    confidence: 0,
    sentences: [],
    signals: [],
    tiers: [],
    signalTypes: [],
    r: 0,
    confirmedHits: 0,
    dataset: null,
    sampled: false,
    detectedCount: 0,
    keptCount: 0,
    editedCount: 0,
    undecidedCount: 0,
    status: '검토 대기',
    reviewStartedAt: null,
    approval: null,
    validApproval: null,
    approvedContent: null,
    currentContent: '',
    currentDigest: '',
    dispatched: null,
    blocked: null,
    reviewDuration: null,
    canApprove: false,
    approvalBlockers: ['초안이 없습니다.'],
    editedReasonString: 'none',
    events: [],
  };
}

/**
 * 다이제스트 계산기를 밖에서 받는다.
 * Node 는 node:crypto 동기 함수를, 브라우저는 이 값을 쓰지 않으므로 생략한다.
 */
export type DigestFn = (content: string) => string;

export function replayEvents(
  caseId: string,
  events: AnyStoredEvent[],
  computeDigest: DigestFn = () => '',
): CaseState {
  if (events.length === 0) return emptyState(caseId);

  const state = emptyState(caseId);
  state.events = events;

  const sentences = new Map<number, SentenceState>();
  const lastEditSeq = new Map<number, number>();
  const lastCoherenceSeq = new Map<number, number>();

  let approval: ApprovalState | null = null;
  let approvalStale = false;
  let lastAttemptContent: string | undefined;
  let reviewStartedAt: string | null = null;
  let approvedAt: string | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'draft_created': {
        const payload = event.payload as DraftCreatedPayload;
        state.exists = true;
        state.dataset = payload.dataset ?? null;
        state.product = payload.product;
        state.inquiry = payload.inquiry;
        state.receivedAt = payload.receivedAt;
        state.model = payload.model;
        state.modelVersion = payload.modelVersion;
        state.confidence = payload.confidence;
        for (const sentence of payload.sentences) {
          sentences.set(sentence.idx, {
            idx: sentence.idx,
            originalText: sentence.text,
            currentText: sentence.text,
            flagStart: sentence.flagStart,
            flagEnd: sentence.flagEnd,
            signal: null,
            verdict: 'undecided',
            reason: null,
            coherence: null,
          });
        }
        break;
      }

      case 'signals_detected': {
        state.signals = event.payload.signals;
        state.r = event.payload.r;
        state.confirmedHits = event.payload.confirmedHits ?? 0;
        state.sampled = event.payload.sampled === true;
        for (const signal of event.payload.signals) {
          const sentence = sentences.get(signal.sentenceIdx);
          if (sentence) sentence.signal = signal;
        }
        break;
      }

      case 'review_started': {
        reviewStartedAt = event.ts;
        break;
      }

      case 'sentence_kept': {
        const sentence = sentences.get(event.payload.sentenceIdx);
        if (sentence) {
          sentence.verdict = 'kept';
          sentence.currentText = sentence.originalText;
          sentence.reason = null;
          sentence.coherence = null;
        }
        lastEditSeq.set(event.payload.sentenceIdx, event.seq);
        if (approval) approvalStale = true;
        break;
      }

      case 'sentence_edited': {
        const sentence = sentences.get(event.payload.sentenceIdx);
        if (sentence) {
          sentence.verdict = 'edited';
          sentence.currentText = event.payload.newText;
        }
        lastEditSeq.set(event.payload.sentenceIdx, event.seq);
        if (approval) approvalStale = true;
        break;
      }

      case 'reason_selected': {
        const sentence = sentences.get(event.payload.sentenceIdx);
        if (sentence) sentence.reason = event.payload.reason;
        break;
      }

      case 'coherence_checked': {
        const sentence = sentences.get(event.payload.sentenceIdx);
        if (sentence) {
          sentence.coherence = {
            result: event.payload.result,
            diffKind: event.payload.diffKind,
            detail: event.payload.detail,
          };
        }
        lastCoherenceSeq.set(event.payload.sentenceIdx, event.seq);
        break;
      }

      case 'approved': {
        approval = {
          ...event.payload,
          seq: event.seq,
          ts: event.ts,
          content: contentOf([...sentences.values()].sort((a, b) => a.idx - b.idx)),
          valid: true,
        };
        approvalStale = false;
        approvedAt = event.ts;
        break;
      }

      case 'approval_invalidated': {
        approvalStale = true;
        break;
      }

      case 'dispatch_attempted': {
        lastAttemptContent = event.payload.content;
        break;
      }

      case 'dispatched': {
        state.dispatched = { ...event.payload };
        break;
      }

      case 'dispatch_blocked': {
        state.blocked = {
          seq: event.seq,
          ts: event.ts,
          reason: event.payload.reason,
          expectedDigest: event.payload.expectedDigest,
          actualDigest: event.payload.actualDigest,
          // 바로 앞 dispatch_attempted 가 보내려던 문안이 곧 차단된 시도문이다.
          attemptedContent: lastAttemptContent,
        };
        break;
      }

      default:
        break;
    }
  }

  // 수정 이후 재검사가 없으면 정합성 결과는 낡은 것으로 보고 버린다.
  for (const sentence of sentences.values()) {
    const editSeq = lastEditSeq.get(sentence.idx) ?? -1;
    const checkSeq = lastCoherenceSeq.get(sentence.idx) ?? -1;
    if (sentence.coherence && checkSeq < editSeq) {
      sentence.coherence = null;
    }
  }

  const ordering = [...sentences.values()].sort((a, b) => a.idx - b.idx);
  state.sentences = ordering;
  state.tiers = state.signals.map((signal) => signal.tier);
  state.signalTypes = state.signals.map((signal) => signal.type);
  state.reviewStartedAt = reviewStartedAt;
  state.currentContent = contentOf(ordering);
  state.currentDigest = computeDigest(state.currentContent);

  const detected = ordering.filter((sentence) => sentence.signal !== null);
  state.detectedCount = detected.length;
  state.keptCount = detected.filter((sentence) => sentence.verdict === 'kept').length;
  state.editedCount = detected.filter((sentence) => sentence.verdict === 'edited').length;
  state.undecidedCount = detected.filter((sentence) => sentence.verdict === 'undecided').length;

  if (approval) {
    approval.valid = !approvalStale;
    state.approval = approval;
    state.validApproval = approvalStale ? null : approval;
    state.approvedContent = approval.content;
  }

  const blockers = approvalBlockersOf(ordering);
  state.approvalBlockers = blockers;
  state.canApprove = blockers.length === 0;
  state.editedReasonString = reasonStringOf(ordering);

  state.status = deriveStatus(state, reviewStartedAt);

  if (reviewStartedAt && approvedAt) {
    state.reviewDuration = durationLabel(reviewStartedAt, approvedAt);
  }

  return state;
}

/**
 * 승인 조건 (스펙 §2.3): 모든 감지 구절 판정 완료 AND 수정 구절 전부 사유 선택 + 정합성 pass.
 * 타임아웃으로 자동 통과시키는 경로는 없다.
 */
export function approvalBlockersOf(sentences: SentenceState[]): string[] {
  const blockers: string[] = [];
  const detected = sentences.filter((sentence) => sentence.signal !== null);

  const undecided = detected.filter((sentence) => sentence.verdict === 'undecided');
  if (undecided.length > 0) {
    blockers.push(
      `미판정 구절 ${undecided.length}건 (${undecided.map((s) => s.idx + 1).join(', ')}번)`,
    );
  }

  for (const sentence of sentences.filter((s) => s.verdict === 'edited')) {
    if (!sentence.reason) {
      blockers.push(`${sentence.idx + 1}번 구절 수정 사유 미선택`);
      continue;
    }
    if (!sentence.coherence) {
      blockers.push(`${sentence.idx + 1}번 구절 정합성 검사 미실행`);
      continue;
    }
    if (sentence.coherence.result !== 'pass') {
      blockers.push(`${sentence.idx + 1}번 구절 정합성 불일치 · 사유 재선택 필요`);
    }
  }

  return blockers;
}

/** 봉인에 들어가는 reason 문자열 (스펙 §2.3): 수정 구절 사유들을 `,` join, 수정 0건이면 "none". */
export function reasonStringOf(sentences: SentenceState[]): string {
  const reasons = sentences
    .filter((sentence) => sentence.verdict === 'edited' && sentence.reason)
    .sort((a, b) => a.idx - b.idx)
    .map((sentence) => sentence.reason as string);
  return reasons.length > 0 ? reasons.join(',') : 'none';
}

function deriveStatus(state: CaseState, reviewStartedAt: string | null): CaseStatus {
  const blockedSeq = state.blocked?.seq ?? -1;
  const dispatchedSeq = state.events.findLast((event) => event.type === 'dispatched')?.seq ?? -1;

  if (blockedSeq > dispatchedSeq) return '차단';
  if (state.dispatched) return '발행 완료';
  if (state.validApproval) return '검토 완료';
  if (reviewStartedAt) return '검토 중';
  if (state.sampled) return '표본 검토';
  return '검토 대기';
}
