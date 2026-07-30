/**
 * 서버 모드(SQLite + node:crypto)용 읽기 모델 어댑터.
 * 실제 조립은 view-model.ts 의 순수 빌더가 하고, 여기서는 재료만 넣는다.
 */

import { listCaseIds } from './db';
import { replay, type CaseState } from './projection';
import { verifySeal } from './seal';
import {
  buildQueueFrom,
  toCaseView as toCaseViewPure,
  toRegistryView as toRegistryViewPure,
  type CaseView,
  type QueueView,
  type RegistryView,
} from './view-model';

export * from './view-model';

export function allCaseStates(): CaseState[] {
  return listCaseIds().map((caseId) => replay(caseId));
}

export function buildQueue(): QueueView {
  return buildQueueFrom(allCaseStates());
}

export function toCaseView(state: CaseState): CaseView {
  return toCaseViewPure(state, verifySeal);
}

export function toRegistryView(state: CaseState): RegistryView {
  return toRegistryViewPure(state, verifySeal);
}

export function buildCaseView(caseId: string): CaseView | null {
  const state = replay(caseId);
  return state.exists ? toCaseView(state) : null;
}

/** 등기번호 하나로 전 과정을 복원한다 (스펙 §3, 불변조건 4). */
export function buildRegistryView(caseId: string): RegistryView | null {
  const state = replay(caseId);
  return state.exists ? toRegistryView(state) : null;
}
