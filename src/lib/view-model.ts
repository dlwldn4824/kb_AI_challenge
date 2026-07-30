/**
 * 화면·API 가 쓰는 읽기 모델. 전부 이벤트 재생 결과에서만 만든다.
 *
 * 이 파일에는 Node 전용 의존이 없다 — SQLite 도, node:crypto 도 모른다.
 * 서버 모드는 views.ts 가, 정적 데모 모드는 api-client 가 각자 재료를 넣어 준다.
 */

import { CUSTOMER_QUESTION, DISPLAY, STATS } from '@/fixtures/stats';
import { hhmm } from './clock';
import { PRIMARY_CASE_ID, R_FORMULA_TEXT } from './constants';
import { shortDigest } from './digest-core';
import type { AnyStoredEvent, DetectedSignal } from './events';
import type { CaseState, CaseStatus } from './projection';
import type { SealInput } from './seal-core';
import type { Tier } from './scoring';

export interface QueueItem {
  caseId: string;
  r: number;
  tiers: Tier[];
  signals: DetectedSignal[];
  receivedAt: string;
  receivedAtLabel: string;
  product: string;
  inquiry: string;
  status: CaseStatus;
  sampled: boolean;
  isPrimary: boolean;
  sentenceCount: number;
  detectedCount: number;
}

export interface QueueView {
  kpi: {
    draftsToday: number;
    interventionNeeded: number;
    interventionRate: number;
    randomSamples: number;
    pendingReview: number;
    blockedToday: number;
  };
  rFormula: string;
  /** 개입이 필요한 큐. R 내림차순 엄격 정렬 (스펙 §0). */
  queue: QueueItem[];
  /** 저위험 무작위 표본 (R=0 중 표본으로 선정된 건). */
  samples: QueueItem[];
  /** R=0 이면서 표본도 아닌 건. 큐에는 올라오지 않는다. */
  lowRisk: QueueItem[];
  badge: string;
  chromeTimestamp: string;
}

function toQueueItem(state: CaseState): QueueItem {
  return {
    caseId: state.caseId,
    r: state.r,
    tiers: state.tiers,
    signals: state.signals,
    receivedAt: state.receivedAt,
    receivedAtLabel: hhmm(state.receivedAt),
    product: state.product,
    inquiry: state.inquiry,
    status: state.status,
    sampled: state.sampled,
    isPrimary: state.caseId === PRIMARY_CASE_ID,
    sentenceCount: state.sentences.length,
    detectedCount: state.detectedCount,
  };
}

/** DB 를 모르는 순수 빌더. 정적 데모 모드가 브라우저에서 그대로 쓴다. */
export function buildQueueFrom(states: CaseState[]): QueueView {
  const items = states.map(toQueueItem);

  const byRisk = (a: QueueItem, b: QueueItem) =>
    b.r - a.r || b.receivedAt.localeCompare(a.receivedAt);

  return {
    kpi: {
      draftsToday: STATS.draftsToday,
      interventionNeeded: STATS.interventionNeeded,
      interventionRate: STATS.interventionRate,
      randomSamples: STATS.randomSamples,
      pendingReview: STATS.pendingReview,
      blockedToday: STATS.blockedToday,
    },
    rFormula: R_FORMULA_TEXT,
    queue: items.filter((item) => item.r > 0).sort(byRisk),
    samples: items.filter((item) => item.r === 0 && item.sampled).sort(byRisk),
    lowRisk: items.filter((item) => item.r === 0 && !item.sampled).sort(byRisk),
    badge: 'SYNTHETIC DEMO · 합성 예시 데이터',
    chromeTimestamp: DISPLAY.chromeTimestamp,
  };
}

export interface CaseView {
  caseId: string;
  product: string;
  inquiry: string;
  receivedAt: string;
  receivedAtLabel: string;
  model: string;
  modelVersion: string;
  confidence: number;
  status: CaseStatus;
  r: number;
  tiers: Tier[];
  signals: DetectedSignal[];
  sentences: CaseState['sentences'];
  detectedCount: number;
  keptCount: number;
  editedCount: number;
  undecidedCount: number;
  /** "감지 5 · 유지 4 · 수정 1" */
  detectedSummary: string;
  /** "5개 구절 중 1개 수정" */
  verdictSummary: string;
  currentContent: string;
  currentDigest: string;
  currentDigestShort: string;
  approvedContent: string | null;
  approval: ApprovalView | null;
  dispatched: CaseState['dispatched'];
  blocked: CaseState['blocked'];
  reviewDuration: string | null;
  canApprove: boolean;
  approvalBlockers: string[];
  events: AnyStoredEvent[];
}

export interface ApprovalView {
  versionId: string;
  contentDigest: string;
  contentDigestShort: string;
  approver: string;
  team: string;
  reason: string;
  reasonLabel: string;
  modelVersion: string;
  sealedAt: string;
  seal: string;
  sealShort: string;
  sealValid: boolean;
  valid: boolean;
}

/**
 * 봉인 검증 함수를 밖에서 받는다.
 * Node 는 crypto.timingSafeEqual, 브라우저는 WebCrypto 로 미리 계산한 결과를 넘긴다.
 */
export type SealVerifier = (input: SealInput, seal: string) => boolean;

function toApprovalView(state: CaseState, verify: SealVerifier): ApprovalView | null {
  const approval = state.approval;
  if (!approval) return null;

  const sealValid = verify(
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

  return {
    versionId: approval.versionId,
    contentDigest: approval.contentDigest,
    contentDigestShort: shortDigest(approval.contentDigest),
    approver: approval.approver,
    team: approval.team,
    reason: approval.reason,
    reasonLabel: approval.reason === 'none' ? '수정 없음' : `${approval.reason} (원탭)`,
    modelVersion: approval.modelVersion,
    sealedAt: approval.sealedAt,
    seal: approval.seal,
    sealShort: shortDigest(approval.seal),
    sealValid,
    valid: approval.valid,
  };
}

export function toCaseView(state: CaseState, verify: SealVerifier): CaseView {
  return {
    caseId: state.caseId,
    product: state.product,
    inquiry: state.inquiry,
    receivedAt: state.receivedAt,
    receivedAtLabel: hhmm(state.receivedAt),
    model: state.model,
    modelVersion: state.modelVersion,
    confidence: state.confidence,
    status: state.status,
    r: state.r,
    tiers: state.tiers,
    signals: state.signals,
    sentences: state.sentences,
    detectedCount: state.detectedCount,
    keptCount: state.keptCount,
    editedCount: state.editedCount,
    undecidedCount: state.undecidedCount,
    detectedSummary: `감지 ${state.detectedCount} · 유지 ${state.keptCount} · 수정 ${state.editedCount}`,
    verdictSummary: `${state.sentences.length}개 구절 중 ${state.editedCount}개 수정`,
    currentContent: state.currentContent,
    currentDigest: state.currentDigest,
    currentDigestShort: shortDigest(state.currentDigest),
    approvedContent: state.approvedContent,
    approval: toApprovalView(state, verify),
    dispatched: state.dispatched,
    blocked: state.blocked,
    reviewDuration: state.reviewDuration,
    canApprove: state.canApprove,
    approvalBlockers: state.approvalBlockers,
    events: state.events,
  };
}

export interface RegistryEdit {
  idx: number;
  originalText: string;
  newText: string;
  reason: string | null;
  coherenceResult: 'pass' | 'mismatch' | null;
  coherenceDetail: string | null;
}

export interface RegistryView {
  caseId: string;
  product: string;
  inquiry: string;
  receivedAt: string;
  model: string;
  modelVersion: string;
  confidence: number;
  r: number;
  tiers: Tier[];
  status: CaseStatus;
  /** 이벤트 재생으로 복원한 원문 — 초안 그대로. */
  originalSentences: string[];
  /** 재생으로 복원한 최종 문안. */
  finalSentences: string[];
  sentences: Array<{
    idx: number;
    originalText: string;
    finalText: string;
    verdict: string;
    reason: string | null;
    signalType: string | null;
    signalTier: Tier | null;
  }>;
  edits: RegistryEdit[];
  approver: string | null;
  team: string | null;
  approval: ApprovalView | null;
  approvedContent: string | null;
  approvedContentDigestShort: string | null;
  dispatched: CaseState['dispatched'];
  dispatchedDigestShort: string | null;
  blocked: CaseState['blocked'];
  reviewDuration: string | null;
  verdictSummary: string;
  detectedSummary: string;
  lookups: number;
  customerQuestion: string;
  comparisonElapsed: string;
  eventCount: number;
  events: AnyStoredEvent[];
}

/** DB 를 모르는 순수 빌더. 정적 데모 모드가 브라우저에서 그대로 쓴다. */
export function toRegistryView(state: CaseState, verify: SealVerifier): RegistryView {
  const view = toCaseView(state, verify);

  return {
    caseId: state.caseId,
    product: state.product,
    inquiry: state.inquiry,
    receivedAt: state.receivedAt,
    model: state.model,
    modelVersion: state.modelVersion,
    confidence: state.confidence,
    r: state.r,
    tiers: state.tiers,
    status: state.status,
    originalSentences: state.sentences.map((sentence) => sentence.originalText),
    finalSentences: state.sentences.map((sentence) => sentence.currentText),
    sentences: state.sentences.map((sentence) => ({
      idx: sentence.idx,
      originalText: sentence.originalText,
      finalText: sentence.currentText,
      verdict: sentence.verdict,
      reason: sentence.reason,
      signalType: sentence.signal?.type ?? null,
      signalTier: sentence.signal?.tier ?? null,
    })),
    edits: state.sentences
      .filter((sentence) => sentence.verdict === 'edited')
      .map((sentence) => ({
        idx: sentence.idx,
        originalText: sentence.originalText,
        newText: sentence.currentText,
        reason: sentence.reason,
        coherenceResult: sentence.coherence?.result ?? null,
        coherenceDetail: sentence.coherence?.detail ?? null,
      })),
    approver: state.approval?.approver ?? null,
    team: state.approval?.team ?? null,
    approval: view.approval,
    approvedContent: state.approvedContent,
    approvedContentDigestShort: state.approval
      ? shortDigest(state.approval.contentDigest)
      : null,
    dispatched: state.dispatched,
    dispatchedDigestShort: state.dispatched
      ? shortDigest(state.dispatched.contentDigest)
      : null,
    blocked: state.blocked,
    reviewDuration: state.reviewDuration,
    verdictSummary: view.verdictSummary,
    detectedSummary: view.detectedSummary,
    lookups: DISPLAY.registryLookups,
    customerQuestion: CUSTOMER_QUESTION,
    comparisonElapsed: DISPLAY.comparisonElapsed,
    eventCount: state.events.length,
    events: state.events,
  };
}
