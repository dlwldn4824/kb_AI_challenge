/**
 * 정적 데모 모드의 이벤트 로그 (브라우저 메모리 + sessionStorage).
 *
 * mock 응답을 심지 않는다. 서버가 하던 판정·봉인·차단 검증을 브라우저에서 그대로 실행한다.
 *   - 상태 도출: projection.replayEvents (서버와 동일 함수)
 *   - 승인 조건: approvalBlockersOf / reasonStringOf (서버와 동일 함수)
 *   - 정합성:   coherence.checkCoherence (서버와 동일 함수)
 *   - 해시·봉인: WebCrypto 구현 (tests/hash-parity.test.ts 로 Node 구현과 동등성 고정)
 *
 * SQLite 대신 배열에 append 할 뿐, UPDATE/DELETE 경로는 여기에도 없다.
 */

import { checkCoherence } from '../coherence';
import { eventTs } from '../clock';
import { ACTOR_ID, ACTOR_TEAM, type Reason } from '../constants';
import { versionIdOf } from '../digest-core';
import type { AnyStoredEvent, ApprovedPayload, BlockReason, EventPayloadMap, EventType } from '../events';
import {
  approvalBlockersOf,
  contentOf,
  reasonStringOf,
  replayEvents,
  type CaseState,
} from '../projection-core';
import type { SealInput } from '../seal-core';
import { createSealWeb, digestWeb, verifySealWeb } from '../webcrypto';
import seedEvents from './seed-events.json';

const STORAGE_KEY = 'answer-registry:static-demo:events';

const seed = seedEvents as unknown as AnyStoredEvent[];

let events: AnyStoredEvent[] = [];
let loaded = false;

/** seed 이후 이 세션에서 추가된 이벤트만 저장한다. seed 는 번들에 이미 있다. */
function persist() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(seed.length)));
  } catch {
    // 저장 실패는 데모 진행을 막지 않는다. 새로고침 시 seed 상태로 돌아갈 뿐이다.
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  events = [...seed];

  if (typeof sessionStorage === 'undefined') return;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved) as AnyStoredEvent[];
    if (Array.isArray(parsed)) events = [...seed, ...parsed];
  } catch {
    // 손상된 저장본은 무시하고 seed 로 시작한다.
  }
}

function append<T extends EventType>(input: {
  caseId: string;
  type: T;
  actor: string;
  ts: string;
  payload: EventPayloadMap[T];
}): void {
  load();
  const seq = events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
  events.push({ seq, ...input } as AnyStoredEvent);
  persist();
}

/**
 * 봉인 검증 결과 캐시.
 * 뷰 조립은 동기 함수인데 WebCrypto 는 비동기라, 뷰를 만들기 직전에 실제 HMAC 검증을
 * 돌려 여기에 담아 둔다. 값은 흉내가 아니라 verifySealWeb 의 실제 결과다.
 */
const sealCache = new Map<string, boolean>();

export async function primeSeal(state: CaseState): Promise<void> {
  const approval = state.approval;
  if (!approval || sealCache.has(approval.seal)) return;
  const valid = await verifySealWeb(
    {
      caseId: state.caseId,
      versionId: approval.versionId,
      contentDigest: approval.contentDigest,
      approver: approval.approver,
      reason: approval.reason,
      modelVersion: approval.modelVersion,
      ts: approval.sealedAt,
    },
    approval.seal,
  );
  sealCache.set(approval.seal, valid);
}

export function sealVerifier() {
  return (_input: SealInput, seal: string): boolean => sealCache.get(seal) ?? false;
}

export function allEvents(): AnyStoredEvent[] {
  load();
  return events;
}

export function caseIds(): string[] {
  load();
  const seen: string[] = [];
  for (const event of events) {
    if (!seen.includes(event.caseId)) seen.push(event.caseId);
  }
  return seen;
}

export function replayCase(caseId: string): CaseState {
  load();
  return replayEvents(
    caseId,
    events.filter((event) => event.caseId === caseId),
  );
}

export function allCaseStates(): CaseState[] {
  return caseIds().map(replayCase);
}

/** 데모를 처음 상태로 되돌린다. */
export function resetStore(): void {
  loaded = false;
  events = [];
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // 무시
    }
  }
  load();
}

function requireCase(caseId: string): CaseState {
  const state = replayCase(caseId);
  if (!state.exists) throw new CaseNotFound(caseId);
  return state;
}

export class CaseNotFound extends Error {
  constructor(public caseId: string) {
    super(`case not found: ${caseId}`);
  }
}

/** 승인 이후 내용이 바뀌면 승인을 무효화한다 (스펙 §2.2, 불변조건 2). */
function invalidateApprovalIfNeeded(caseId: string, before: CaseState): void {
  if (!before.validApproval) return;
  append({
    caseId,
    type: 'approval_invalidated',
    actor: 'system',
    ts: eventTs(caseId, 'approval_invalidated'),
    payload: { invalidatedApprovalSeq: before.validApproval.seq, cause: 'content_changed' },
  });
}

export function startReview(caseId: string): CaseState {
  requireCase(caseId);
  append({
    caseId,
    type: 'review_started',
    actor: ACTOR_ID,
    ts: eventTs(caseId, 'review_started'),
    payload: {},
  });
  return replayCase(caseId);
}

export function keepSentence(caseId: string, idx: number): CaseState {
  const before = requireCase(caseId);
  assertSentence(before, idx);
  append({
    caseId,
    type: 'sentence_kept',
    actor: ACTOR_ID,
    ts: eventTs(caseId, 'sentence_kept', idx),
    payload: { sentenceIdx: idx },
  });
  invalidateApprovalIfNeeded(caseId, before);
  return replayCase(caseId);
}

export function editSentence(caseId: string, idx: number, newText: string): CaseState {
  const before = requireCase(caseId);
  assertSentence(before, idx);
  append({
    caseId,
    type: 'sentence_edited',
    actor: ACTOR_ID,
    ts: eventTs(caseId, 'sentence_edited'),
    payload: { sentenceIdx: idx, newText },
  });
  invalidateApprovalIfNeeded(caseId, before);
  return replayCase(caseId);
}

/** 사유 선택 즉시 정합성 검사까지 기록한다 (스펙 §3). */
export function selectReason(caseId: string, idx: number, reason: Reason): CaseState {
  const before = requireCase(caseId);
  const sentence = assertSentence(before, idx);

  append({
    caseId,
    type: 'reason_selected',
    actor: ACTOR_ID,
    ts: eventTs(caseId, 'reason_selected'),
    payload: { sentenceIdx: idx, reason },
  });

  const result = checkCoherence(reason, sentence.originalText, sentence.currentText);
  append({
    caseId,
    type: 'coherence_checked',
    actor: 'system',
    ts: eventTs(caseId, 'coherence_checked'),
    payload: {
      sentenceIdx: idx,
      reason,
      diffKind: result.diffKind,
      result: result.result,
      detail: result.detail,
    },
  });

  return replayCase(caseId);
}

function assertSentence(state: CaseState, idx: number) {
  const sentence = state.sentences.find((item) => item.idx === idx);
  if (!sentence) throw new RangeError(`sentence ${idx} not found in ${state.caseId}`);
  return sentence;
}

export type ApproveResult =
  | { ok: true; state: CaseState }
  | { ok: false; blockers: string[]; state: CaseState };

/**
 * 승인 (스펙 §2.3). 조건 미충족이면 approved 이벤트를 남기지 않는다.
 * 조건 판정은 서버와 같은 approvalBlockersOf 를 쓴다.
 */
export async function approveCase(caseId: string): Promise<ApproveResult> {
  const state = requireCase(caseId);
  const blockers = approvalBlockersOf(state.sentences);
  if (blockers.length > 0) return { ok: false, blockers, state };

  const content = contentOf(state.sentences);
  const contentDigest = await digestWeb(content);
  const versionId = versionIdOf(contentDigest);
  const reason = reasonStringOf(state.sentences);
  const sealedAt = eventTs(caseId, 'approved');

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
    seal: await createSealWeb(sealInput),
  };

  append({ caseId, type: 'approved', actor: ACTOR_ID, ts: sealedAt, payload });
  return { ok: true, state: replayCase(caseId) };
}

export type DispatchResult =
  | { ok: true; contentDigest: string; versionId: string; dispatchedAt: string; state: CaseState }
  | {
      ok: false;
      reason: BlockReason;
      expectedDigest?: string;
      actualDigest?: string;
      state: CaseState;
    };

/**
 * 발송 (스펙 §2.4, 불변조건 1·3).
 * 유효 승인 → 다이제스트 일치 → 봉인 검증 순서까지 서버와 동일하다.
 */
export async function dispatchContent(
  caseId: string,
  content: string,
  via: 'ui' | 'api' = 'ui',
): Promise<DispatchResult> {
  requireCase(caseId);
  const actualDigest = await digestWeb(content);

  append({
    caseId,
    type: 'dispatch_attempted',
    actor: via === 'ui' ? ACTOR_ID : 'system',
    ts: eventTs(caseId, 'dispatch_attempted'),
    payload: { contentDigest: actualDigest, via, content },
  });

  const state = replayCase(caseId);
  const approval = state.validApproval;

  if (!approval) return block(caseId, { reason: 'no_valid_approval' });

  if (approval.contentDigest !== actualDigest) {
    return block(caseId, {
      reason: 'digest_mismatch',
      expectedDigest: approval.contentDigest,
      actualDigest,
    });
  }

  const sealOk = await verifySealWeb(
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
  if (!sealOk) return block(caseId, { reason: 'seal_invalid' });

  const dispatchedAt = eventTs(caseId, 'dispatched');
  append({
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
    state: replayCase(caseId),
  };
}

function block(
  caseId: string,
  payload: { reason: BlockReason; expectedDigest?: string; actualDigest?: string },
): DispatchResult {
  append({
    caseId,
    type: 'dispatch_blocked',
    actor: 'system',
    ts: eventTs(caseId, 'dispatch_blocked'),
    payload,
  });
  return { ok: false, ...payload, state: replayCase(caseId) };
}
