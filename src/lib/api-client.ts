/**
 * 화면이 데이터를 얻는 단 하나의 통로.
 *
 * 서버 모드에서는 기존 route handler 를 fetch 로 호출하고,
 * 정적 데모 모드에서는 브라우저 안의 이벤트 스토어를 직접 호출한다.
 * 어느 쪽이든 판정·봉인·차단 규칙은 같은 함수가 실행한다 — 응답을 흉내 내지 않는다.
 */

import type { Reason } from './constants';
import type { CaseView, QueueView, RegistryView } from './view-model';

/** 빌드 타임 플래그. next build 시 값이 그대로 인라인된다. */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === '1';

export interface ApiResult {
  status: number;
  data: unknown;
}

export interface CaseApi {
  getQueue(): Promise<QueueView>;
  getCase(caseId: string): Promise<CaseView | null>;
  getRegistry(caseId: string): Promise<RegistryView | null>;
  reviewStart(caseId: string): Promise<ApiResult>;
  keep(caseId: string, idx: number): Promise<ApiResult>;
  edit(caseId: string, idx: number, newText: string): Promise<ApiResult>;
  reason(caseId: string, idx: number, reason: Reason): Promise<ApiResult>;
  approve(caseId: string): Promise<ApiResult>;
  dispatch(caseId: string, content: string): Promise<ApiResult>;
}

/* ── 서버 모드 : 기존 API 를 그대로 호출한다 ─────────────────────── */

async function post(path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  } catch {
    return { status: 0, data: {} };
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const httpApi: CaseApi = {
  async getQueue() {
    const queue = await getJson<QueueView>('/api/cases');
    if (!queue) throw new Error('queue를 불러오지 못했습니다.');
    return queue;
  },
  getCase: (caseId) => getJson<CaseView>(`/api/cases/${caseId}`),
  getRegistry: (caseId) => getJson<RegistryView>(`/api/registry/${caseId}`),
  reviewStart: (caseId) => post(`/api/cases/${caseId}/review-start`),
  keep: (caseId, idx) => post(`/api/cases/${caseId}/sentences/${idx}/keep`),
  edit: (caseId, idx, newText) =>
    post(`/api/cases/${caseId}/sentences/${idx}/edit`, { newText }),
  reason: (caseId, idx, reason) =>
    post(`/api/cases/${caseId}/sentences/${idx}/reason`, { reason }),
  approve: (caseId) => post(`/api/cases/${caseId}/approve`),
  dispatch: (caseId, content) => post('/api/dispatch', { caseId, content, via: 'ui' }),
};

/* ── 정적 모드 : 브라우저 스토어에서 같은 로직을 실행한다 ─────────── */

const store = () => import('./static-demo/store');
const views = () => import('./view-model');

const staticApi: CaseApi = {
  async getQueue() {
    const [{ allCaseStates, primeSeal, sealVerifier }, { buildQueueFrom }] = await Promise.all([
      store(),
      views(),
    ]);
    const states = allCaseStates();
    await Promise.all(states.map(primeSeal));
    return buildQueueFrom(states);
  },

  async getCase(caseId) {
    const [{ replayCase, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = replayCase(caseId);
    if (!state.exists) return null;
    await primeSeal(state);
    return toCaseView(state, sealVerifier());
  },

  async getRegistry(caseId) {
    const [{ replayCase, primeSeal, sealVerifier }, { toRegistryView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = replayCase(caseId);
    if (!state.exists) return null;
    await primeSeal(state);
    return toRegistryView(state, sealVerifier());
  },

  async reviewStart(caseId) {
    const [{ startReview, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = startReview(caseId);
    await primeSeal(state);
    return { status: 200, data: toCaseView(state, sealVerifier()) };
  },

  async keep(caseId, idx) {
    const [{ keepSentence, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = keepSentence(caseId, idx);
    await primeSeal(state);
    return { status: 200, data: toCaseView(state, sealVerifier()) };
  },

  async edit(caseId, idx, newText) {
    const [{ editSentence, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = editSentence(caseId, idx, newText);
    await primeSeal(state);
    return { status: 200, data: toCaseView(state, sealVerifier()) };
  },

  async reason(caseId, idx, reason) {
    const [{ selectReason, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const state = selectReason(caseId, idx, reason);
    await primeSeal(state);
    return { status: 200, data: toCaseView(state, sealVerifier()) };
  },

  async approve(caseId) {
    const [{ approveCase, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const result = await approveCase(caseId);
    await primeSeal(result.state);
    if (!result.ok) {
      return {
        status: 422,
        data: {
          error: 'approval_requirements_not_met',
          blockers: result.blockers,
          case: toCaseView(result.state, sealVerifier()),
        },
      };
    }
    return { status: 200, data: toCaseView(result.state, sealVerifier()) };
  },

  async dispatch(caseId, content) {
    const [{ dispatchContent, primeSeal, sealVerifier }, { toCaseView }] = await Promise.all([
      store(),
      views(),
    ]);
    const result = await dispatchContent(caseId, content, 'ui');
    await primeSeal(result.state);
    if (!result.ok) {
      return {
        status: 409,
        data: {
          error: 'dispatch_blocked',
          reason: result.reason,
          expectedDigest: result.expectedDigest,
          actualDigest: result.actualDigest,
          case: toCaseView(result.state, sealVerifier()),
        },
      };
    }
    return {
      status: 200,
      data: {
        dispatched: true,
        caseId,
        contentDigest: result.contentDigest,
        versionId: result.versionId,
        dispatchedAt: result.dispatchedAt,
        case: toCaseView(result.state, sealVerifier()),
      },
    };
  },
};

export const api: CaseApi = STATIC_DEMO ? staticApi : httpApi;
