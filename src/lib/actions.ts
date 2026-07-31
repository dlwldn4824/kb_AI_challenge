/**
 * 상태 변경 = 이벤트 append. 라우트 핸들러와 스크립트가 공유하는 단일 경로다.
 *
 * 어떤 함수도 events 를 UPDATE/DELETE 하지 않는다. "승인 무효화"조차
 * 기존 행을 고치는 게 아니라 approval_invalidated 이벤트를 새로 쌓는 것이다.
 *
 * 각 함수의 `at` 인자는 이벤트 시각 주입용이다. seed 가 과거 시각의 케이스를
 * 재현할 때만 쓰고, API 라우트는 넘기지 않는다(= clock.ts 의 eventTs 를 쓴다).
 */

import { eventTs } from './clock';
import { ACTOR_ID, ACTOR_TEAM, isReason, type Reason } from './constants';
import { appendEvent } from './db';
import { digest, versionIdOf } from './digest';
import { learningSignalOf } from './learning-signal';
import type { ApprovedPayload, BlockReason } from './events';
import { checkCoherence } from './coherence';
import { replay, type CaseState } from './projection';
import { createSeal, verifySeal, type SealInput } from './seal';

export class CaseNotFoundError extends Error {
  constructor(public caseId: string) {
    super(`case not found: ${caseId}`);
  }
}

/** 이미 고객에게 나간 등기를 고치려 했을 때. 라우트가 409 로 옮긴다. */
export class CaseSealedError extends Error {
  constructor(
    public caseId: string,
    public dispatchedAt: string,
  ) {
    super(`case already dispatched: ${caseId}`);
  }
}

function requireCase(caseId: string): CaseState {
  const state = replay(caseId);
  if (!state.exists) throw new CaseNotFoundError(caseId);
  return state;
}

/**
 * 발송이 끝난 등기는 더 고칠 수 없다.
 *
 * 화면에서 잠그는 것만으로는 부족하다. 이 제품의 주장은 "검증은 화면이 아니라
 * 발송 경로에 있다"이므로, 잠금도 UI 가 아니라 여기에 있어야 curl 로 때려도 같은 답이 온다.
 *
 * 승인만 되고 아직 나가지 않은 상태의 편집은 여기서 막지 않는다 — 그 경로는
 * `approval_invalidated` 를 쌓아 승인을 무효로 돌리는 것이 정답이다 (불변조건 2).
 */
function assertNotDispatched(state: CaseState): void {
  if (state.dispatched) {
    throw new CaseSealedError(state.caseId, state.dispatched.dispatchedAt);
  }
}

/**
 * 승인 이후 내용이 바뀌면 승인을 무효화한다 (스펙 §2.2, 불변조건 2).
 * 내용 변경 이벤트를 append 한 "직후" 호출된다.
 */
function invalidateApprovalIfNeeded(caseId: string, before: CaseState, at?: string): void {
  if (!before.validApproval) return;
  appendEvent({
    caseId,
    type: 'approval_invalidated',
    actor: 'system',
    ts: at ?? eventTs(caseId, 'approval_invalidated'),
    payload: {
      invalidatedApprovalSeq: before.validApproval.seq,
      cause: 'content_changed',
    },
  });
}

export function startReview(caseId: string, at?: string): CaseState {
  requireCase(caseId);
  appendEvent({
    caseId,
    type: 'review_started',
    actor: ACTOR_ID,
    ts: at ?? eventTs(caseId, 'review_started'),
    payload: {},
  });
  return replay(caseId);
}

export function keepSentence(caseId: string, idx: number, at?: string): CaseState {
  const before = requireCase(caseId);
  assertNotDispatched(before);
  assertSentenceExists(before, idx);

  appendEvent({
    caseId,
    type: 'sentence_kept',
    actor: ACTOR_ID,
    ts: at ?? eventTs(caseId, 'sentence_kept', idx),
    payload: { sentenceIdx: idx },
  });
  invalidateApprovalIfNeeded(caseId, before, at);

  return replay(caseId);
}

export function editSentence(
  caseId: string,
  idx: number,
  newText: string,
  at?: string,
): CaseState {
  const before = requireCase(caseId);
  assertNotDispatched(before);
  assertSentenceExists(before, idx);

  appendEvent({
    caseId,
    type: 'sentence_edited',
    actor: ACTOR_ID,
    ts: at ?? eventTs(caseId, 'sentence_edited'),
    payload: { sentenceIdx: idx, newText },
  });
  invalidateApprovalIfNeeded(caseId, before, at);

  return replay(caseId);
}

/** 사유 선택 즉시 정합성 검사를 돌려 coherence_checked 까지 기록한다 (스펙 §3). */
export function selectReason(
  caseId: string,
  idx: number,
  reason: Reason,
  at?: string,
): CaseState {
  const before = requireCase(caseId);
  assertNotDispatched(before);
  const sentence = assertSentenceExists(before, idx);

  appendEvent({
    caseId,
    type: 'reason_selected',
    actor: ACTOR_ID,
    ts: at ?? eventTs(caseId, 'reason_selected', idx, reason),
    payload: { sentenceIdx: idx, reason },
  });

  const result = checkCoherence(reason, sentence.originalText, sentence.currentText);
  appendEvent({
    caseId,
    type: 'coherence_checked',
    actor: 'system',
    ts: at ?? eventTs(caseId, 'coherence_checked', idx, reason),
    payload: {
      sentenceIdx: idx,
      reason,
      diffKind: result.diffKind,
      result: result.result,
      detail: result.detail,
    },
  });

  return replay(caseId);
}

function assertSentenceExists(state: CaseState, idx: number) {
  const sentence = state.sentences.find((item) => item.idx === idx);
  if (!sentence) {
    throw new RangeError(`sentence ${idx} not found in ${state.caseId}`);
  }
  return sentence;
}

export type ApproveResult =
  | { ok: true; state: CaseState; approval: ApprovedPayload }
  | { ok: false; blockers: string[] };

/**
 * 승인 (스펙 §2.3). 조건 미충족이면 approved 이벤트를 남기지 않는다.
 * 무응답 타임아웃으로 자동 승인하는 경로는 존재하지 않는다.
 */
export function approveCase(caseId: string, at?: string): ApproveResult {
  const state = requireCase(caseId);

  if (!state.canApprove) {
    return { ok: false, blockers: state.approvalBlockers };
  }

  const content = state.currentContent;
  const contentDigest = digest(content);
  const versionId = versionIdOf(contentDigest);
  const reason = state.editedReasonString;
  const sealedAt = at ?? eventTs(caseId, 'approved');

  const sealInput: SealInput = {
    caseId,
    versionId,
    contentDigest,
    approver: ACTOR_ID,
    reason,
    modelVersion: state.modelVersion,
    ts: sealedAt,
  };

  const payload: ApprovedPayload = {
    versionId,
    contentDigest,
    approver: ACTOR_ID,
    team: ACTOR_TEAM,
    reason,
    modelVersion: state.modelVersion,
    sealedAt,
    seal: createSeal(sealInput),
  };

  appendEvent({ caseId, type: 'approved', actor: ACTOR_ID, ts: sealedAt, payload });

  // 판정 레이블을 남긴다. 기록 전용이라 승인을 무효화하지 않는다(불변조건 2).
  appendEvent({
    caseId,
    type: 'learning_signal_saved',
    actor: 'system',
    ts: at ?? eventTs(caseId, 'learning_signal_saved'),
    payload: learningSignalOf(state),
  });

  return { ok: true, state: replay(caseId), approval: payload };
}

export type DispatchResult =
  | {
      ok: true;
      contentDigest: string;
      versionId: string;
      dispatchedAt: string;
      state: CaseState;
    }
  | {
      ok: false;
      reason: BlockReason;
      expectedDigest?: string;
      actualDigest?: string;
      state: CaseState;
    };

/**
 * 발송 (스펙 §2.4, 불변조건 1·3). UI 든 curl 이든 이 경로 하나만 지난다.
 * 승인문과 한 글자라도 다르면 여기서 멈춘다.
 */
export function dispatchContent(
  caseId: string,
  content: string,
  via: 'ui' | 'api',
  at?: string,
): DispatchResult {
  requireCase(caseId);

  const actualDigest = digest(content);

  appendEvent({
    caseId,
    type: 'dispatch_attempted',
    actor: via === 'ui' ? ACTOR_ID : 'system',
    ts: at ?? eventTs(caseId, 'dispatch_attempted'),
    payload: { contentDigest: actualDigest, via, content },
  });

  const state = replay(caseId);
  const approval = state.validApproval;

  if (!approval) {
    return { ok: false, ...block(caseId, { reason: 'no_valid_approval' }, at) };
  }

  if (approval.contentDigest !== actualDigest) {
    return {
      ok: false,
      ...block(
        caseId,
        {
          reason: 'digest_mismatch',
          expectedDigest: approval.contentDigest,
          actualDigest,
        },
        at,
      ),
    };
  }

  const sealOk = verifySeal(
    {
      caseId,
      versionId: approval.versionId,
      contentDigest: approval.contentDigest,
      approver: approval.approver,
      reason: approval.reason,
      modelVersion: approval.modelVersion,
      ts: approval.sealedAt,
    },
    approval.seal,
  );

  if (!sealOk) {
    return { ok: false, ...block(caseId, { reason: 'seal_invalid' }, at) };
  }

  const dispatchedAt = at ?? eventTs(caseId, 'dispatched');
  appendEvent({
    caseId,
    type: 'dispatched',
    actor: ACTOR_ID,
    ts: dispatchedAt,
    payload: { contentDigest: actualDigest, versionId: approval.versionId, dispatchedAt },
  });

  return {
    ok: true,
    contentDigest: actualDigest,
    versionId: approval.versionId,
    dispatchedAt,
    state: replay(caseId),
  };
}

function block(
  caseId: string,
  payload: { reason: BlockReason; expectedDigest?: string; actualDigest?: string },
  at?: string,
): { reason: BlockReason; expectedDigest?: string; actualDigest?: string; state: CaseState } {
  appendEvent({
    caseId,
    type: 'dispatch_blocked',
    actor: 'system',
    ts: at ?? eventTs(caseId, 'dispatch_blocked'),
    payload,
  });
  return { ...payload, state: replay(caseId) };
}

export { isReason };
