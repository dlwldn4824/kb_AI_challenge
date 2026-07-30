/**
 * 불변조건 테스트 (스펙 §7).
 *
 * UI 를 거치지 않고 route handler 를 직접 import 해 Request 로 호출한다.
 * 화면에서만 지켜지는 규칙이 아니라 서버가 지키는 규칙임을 보이기 위해서다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let dbFile = '';

// 라우트 모듈은 db.ts 를 통해 매 호출마다 ANSWER_REGISTRY_DB 를 읽으므로
// 테스트마다 임시 파일을 지정하면 서로 간섭하지 않는다.
beforeEach(async () => {
  dbFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-test-')),
    'test.db',
  );
  process.env.ANSWER_REGISTRY_DB = dbFile;

  const { seedDatabase } = await import('@/lib/seed-runner');
  seedDatabase();
});

afterEach(async () => {
  const { closeDb } = await import('@/lib/db');
  closeDb(dbFile);
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
  delete process.env.ANSWER_REGISTRY_DB;
});

const PRIMARY = 'RG-2026-081-0142';

function post(url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(url: string): Request {
  return new Request(`http://localhost${url}`);
}

function caseParams(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

function sentenceParams(caseId: string, idx: number) {
  return { params: Promise.resolve({ caseId, idx: String(idx) }) };
}

async function callReviewStart(caseId: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/review-start/route');
  return POST(post(`/api/cases/${caseId}/review-start`), caseParams(caseId));
}

async function callKeep(caseId: string, idx: number) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/keep/route');
  return POST(post(`/api/cases/${caseId}/sentences/${idx}/keep`), sentenceParams(caseId, idx));
}

async function callEdit(caseId: string, idx: number, newText: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/edit/route');
  return POST(
    post(`/api/cases/${caseId}/sentences/${idx}/edit`, { newText }),
    sentenceParams(caseId, idx),
  );
}

async function callReason(caseId: string, idx: number, reason: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/reason/route');
  return POST(
    post(`/api/cases/${caseId}/sentences/${idx}/reason`, { reason }),
    sentenceParams(caseId, idx),
  );
}

async function callApprove(caseId: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/approve/route');
  return POST(post(`/api/cases/${caseId}/approve`), caseParams(caseId));
}

async function callDispatch(caseId: string, content: string, via: 'ui' | 'api' = 'api') {
  const { POST } = await import('@/app/api/dispatch/route');
  return POST(post('/api/dispatch', { caseId, content, via }));
}

async function callRegistry(caseId: string) {
  const { GET } = await import('@/app/api/registry/[caseId]/route');
  return GET(get(`/api/registry/${caseId}`), caseParams(caseId));
}

async function callCase(caseId: string) {
  const { GET } = await import('@/app/api/cases/[caseId]/route');
  return GET(get(`/api/cases/${caseId}`), caseParams(caseId));
}

async function eventTypes(caseId: string): Promise<string[]> {
  const { readEvents } = await import('@/lib/db');
  return readEvents(caseId).map((event) => event.type);
}

/** 스펙 §5 데모 판정: 1·2·3·5 유지, 4번 구절 수정 + 사유 원탭. */
async function runPrimaryReview(reason = '자격 미확인') {
  const { PRIMARY_DEMO } = await import('@/fixtures/cases');

  await callReviewStart(PRIMARY);
  for (const idx of PRIMARY_DEMO.keptIdx) {
    await callKeep(PRIMARY, idx);
  }
  await callEdit(PRIMARY, PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.newText);
  await callReason(PRIMARY, PRIMARY_DEMO.editedIdx, reason);
}

describe('불변조건', () => {
  it('1. 유효한 승인 없이는 발송할 수 없다', async () => {
    const caseId = 'RG-2026-081-0139';

    const before = await (await callCase(caseId)).json();
    expect(before.approval).toBeNull();

    const response = await callDispatch(caseId, before.currentContent);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('dispatch_blocked');
    expect(body.reason).toBe('no_valid_approval');

    const { readEvents } = await import('@/lib/db');
    const blocked = readEvents(caseId).filter((event) => event.type === 'dispatch_blocked');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].payload).toMatchObject({ reason: 'no_valid_approval' });

    expect(await eventTypes(caseId)).toContain('dispatch_attempted');
    expect(await eventTypes(caseId)).not.toContain('dispatched');
  });

  it('2. 승인 후 내용이 바뀌면 승인이 즉시 무효가 된다', async () => {
    await runPrimaryReview();

    const approveResponse = await callApprove(PRIMARY);
    expect(approveResponse.status).toBe(200);
    const approved = await approveResponse.json();
    const approvedContent: string = approved.approvedContent;
    expect(approved.approval.valid).toBe(true);

    // 승인 이후 구절을 고친다 — UI 가 아니라 API 직접 호출.
    const editResponse = await callEdit(
      PRIMARY,
      0,
      '한 은행의 월 저축한도는 최고 50만원이며, 매월 50만원 이하 금액을 만기일 전일까지 저축 가능합니다.',
    );
    expect(editResponse.status).toBe(200);

    const { readEvents } = await import('@/lib/db');
    const invalidated = readEvents(PRIMARY).filter(
      (event) => event.type === 'approval_invalidated',
    );
    expect(invalidated).toHaveLength(1);
    expect(invalidated[0].payload).toMatchObject({ cause: 'content_changed' });

    const after = await (await callCase(PRIMARY)).json();
    expect(after.approval.valid).toBe(false);

    // 원래 승인문 그대로 보내도 유효 승인이 없으므로 막힌다.
    const dispatchResponse = await callDispatch(PRIMARY, approvedContent);
    expect(dispatchResponse.status).toBe(409);
    expect((await dispatchResponse.json()).reason).toBe('no_valid_approval');
    expect(await eventTypes(PRIMARY)).not.toContain('dispatched');
  });

  it('3. 발송문이 승인문과 다르면 409 — 정규화 변형은 통과한다', async () => {
    await runPrimaryReview();
    const approved = await (await callApprove(PRIMARY)).json();
    const approvedContent: string = approved.approvedContent;
    expect(approved.approval.contentDigest).toHaveLength(64);

    // 30만원 → 50만원. 사람 눈에는 사소하지만 다이제스트는 완전히 달라진다.
    const tampered = approvedContent.replace('매월 30만원 이하', '매월 50만원 이하');
    expect(tampered).not.toBe(approvedContent);

    const blockedResponse = await callDispatch(PRIMARY, tampered);
    const blockedBody = await blockedResponse.json();
    expect(blockedResponse.status).toBe(409);
    expect(blockedBody.reason).toBe('digest_mismatch');
    expect(blockedBody.expectedDigest).toBe(approved.approval.contentDigest);
    expect(blockedBody.actualDigest).not.toBe(blockedBody.expectedDigest);

    const { readEvents } = await import('@/lib/db');
    expect(
      readEvents(PRIMARY).some(
        (event) =>
          event.type === 'dispatch_blocked' &&
          (event.payload as { reason: string }).reason === 'digest_mismatch',
      ),
    ).toBe(true);
    expect(await eventTypes(PRIMARY)).not.toContain('dispatched');

    // 같은 내용의 CRLF·NFD 변형은 정규화로 흡수되어 통과해야 한다.
    const normalizedVariant = approvedContent.replaceAll('\n', '\r\n').normalize('NFD');
    expect(normalizedVariant).not.toBe(approvedContent);

    const okResponse = await callDispatch(PRIMARY, normalizedVariant);
    const okBody = await okResponse.json();
    expect(okResponse.status).toBe(200);
    expect(okBody.dispatched).toBe(true);
    expect(okBody.contentDigest).toBe(approved.approval.contentDigest);
  });

  it('4. 등기번호 하나로 이벤트를 재생하면 원문·수정·사유·승인자가 복원된다', async () => {
    const { PRIMARY_DEMO, PRIMARY_SENTENCES } = await import('@/fixtures/cases');

    await runPrimaryReview();
    const approved = await (await callApprove(PRIMARY)).json();
    const dispatchResponse = await callDispatch(PRIMARY, approved.approvedContent, 'ui');
    expect(dispatchResponse.status).toBe(200);

    const registryResponse = await callRegistry(PRIMARY);
    expect(registryResponse.status).toBe(200);
    const registry = await registryResponse.json();

    expect(registry.originalSentences).toEqual(PRIMARY_SENTENCES);
    expect(registry.originalSentences).toHaveLength(5);

    expect(registry.edits).toHaveLength(1);
    expect(registry.edits[0].idx).toBe(PRIMARY_DEMO.editedIdx);
    expect(registry.edits[0].originalText).toBe(PRIMARY_SENTENCES[PRIMARY_DEMO.editedIdx]);
    expect(registry.edits[0].newText).toBe(PRIMARY_DEMO.newText);
    expect(registry.edits[0].reason).toBe('자격 미확인');
    expect(registry.edits[0].coherenceResult).toBe('pass');

    expect(registry.approver).toBe('EMP-4471');
    expect(registry.team).toBe('고객센터 1팀');
    expect(registry.approval.sealValid).toBe(true);
    expect(registry.modelVersion).toBe('v3.4.2');
    expect(registry.r).toBe(11);
    expect(registry.tiers).toEqual(['S', 'S', 'A', 'A', 'B']);
    expect(registry.verdictSummary).toBe(PRIMARY_DEMO.verdictSummary);
    expect(registry.detectedSummary).toBe(PRIMARY_DEMO.detectedSummary);
    expect(registry.reviewDuration).toBe('02:41');

    // 복원된 최종 문안 = 실제 발송된 문안.
    expect(registry.finalSentences.join('\n')).toBe(registry.approvedContent);
    expect(registry.dispatched.contentDigest).toBe(registry.approval.contentDigest);
  });
});

describe('승인 게이트', () => {
  it('사유와 실제 수정이 어긋나면 승인이 422 로 막힌다', async () => {
    // 4번 구절은 "확인 안내"를 덧붙였을 뿐 수치를 바꾸지 않았다.
    await runPrimaryReview('수치 오류');

    const response = await callApprove(PRIMARY);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('approval_requirements_not_met');
    expect(body.blockers.join(' ')).toContain('정합성 불일치');
    expect(await eventTypes(PRIMARY)).not.toContain('approved');

    const { readEvents } = await import('@/lib/db');
    const check = readEvents(PRIMARY).findLast((event) => event.type === 'coherence_checked');
    expect((check?.payload as { result: string }).result).toBe('mismatch');
  });

  it('미판정 구절이 남아 있으면 승인이 422 로 막힌다', async () => {
    await callReviewStart(PRIMARY);
    await callKeep(PRIMARY, 0);

    const response = await callApprove(PRIMARY);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.blockers.join(' ')).toContain('미판정 구절 4건');
    expect(await eventTypes(PRIMARY)).not.toContain('approved');
  });
});

describe('판정 중복·경합', () => {
  it('같은 구절에 유지 판정이 여러 번 쌓여도 판정 결과는 1건으로 수렴한다', async () => {
    // 화면에서 같은 버튼이 연달아 눌리면(같은 틱 클릭) 요청이 겹칠 수 있다.
    // 로그는 append-only 라 이벤트가 여러 건 쌓이더라도, 재생 결과는 흔들리면 안 된다.
    await callReviewStart(PRIMARY);
    for (let i = 0; i < 5; i += 1) {
      await callKeep(PRIMARY, 0);
    }

    const { readEvents } = await import('@/lib/db');
    const kept = readEvents(PRIMARY).filter((event) => event.type === 'sentence_kept');
    expect(kept).toHaveLength(5);

    const { replay } = await import('@/lib/projection');
    const state = replay(PRIMARY);
    expect(state.keptCount).toBe(1);
    expect(state.undecidedCount).toBe(4);
    expect(state.sentences[0].verdict).toBe('kept');
  });

  it('판정 순서가 뒤섞여 들어와도 마지막 판정이 이긴다', async () => {
    const { PRIMARY_DEMO } = await import('@/fixtures/cases');
    await callReviewStart(PRIMARY);
    await callKeep(PRIMARY, 3);
    await callEdit(PRIMARY, 3, PRIMARY_DEMO.newText);
    await callKeep(PRIMARY, 3);

    const { replay } = await import('@/lib/projection');
    const state = replay(PRIMARY);
    // 마지막이 유지였으므로 본문은 원문으로 돌아가고 사유·정합성은 비워진다.
    expect(state.sentences[3].verdict).toBe('kept');
    expect(state.sentences[3].currentText).toBe(state.sentences[3].originalText);
    expect(state.sentences[3].reason).toBeNull();
  });
});
