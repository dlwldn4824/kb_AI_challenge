/**
 * 발송이 끝난 등기의 편집 차단 (서버 가드).
 *
 * 화면에는 잠금 배너와 차단 모달이 있지만, 그것만으로는 UI 를 안 거치는 요청을 못 막는다.
 * 이 제품의 주장은 "검증은 화면이 아니라 발송 경로에 있다"이므로 잠금도 서버에 있어야 한다.
 * 여기서는 route handler 를 직접 호출해 UI 없이도 같은 답이 오는지 본다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let dbFile = '';

beforeEach(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-sealed-')), 'test.db');
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

function caseParams(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

function sentenceParams(caseId: string, idx: number) {
  return { params: Promise.resolve({ caseId, idx: String(idx) }) };
}

async function callEdit(idx: number, newText: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/edit/route');
  return POST(post(`/api/cases/${PRIMARY}/sentences/${idx}/edit`, { newText }), sentenceParams(PRIMARY, idx));
}

async function callKeep(idx: number) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/keep/route');
  return POST(post(`/api/cases/${PRIMARY}/sentences/${idx}/keep`), sentenceParams(PRIMARY, idx));
}

async function callReason(idx: number, reason: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/reason/route');
  return POST(post(`/api/cases/${PRIMARY}/sentences/${idx}/reason`, { reason }), sentenceParams(PRIMARY, idx));
}

async function eventsOf(caseId: string) {
  const { readEvents } = await import('@/lib/db');
  return readEvents(caseId);
}

/** 정본 케이스를 승인까지 끌고 간다. 발송은 각 테스트가 필요할 때 한다. */
async function approvePrimary(): Promise<string> {
  const { PRIMARY_DEMO } = await import('@/fixtures/cases');
  const { POST: reviewStart } = await import('@/app/api/cases/[caseId]/review-start/route');
  const { POST: approve } = await import('@/app/api/cases/[caseId]/approve/route');

  await reviewStart(post(`/api/cases/${PRIMARY}/review-start`), caseParams(PRIMARY));
  for (const idx of PRIMARY_DEMO.keptIdx) await callKeep(idx);
  await callEdit(PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.newText);
  await callReason(PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.reason);

  const approved = await (await approve(post(`/api/cases/${PRIMARY}/approve`), caseParams(PRIMARY))).json();
  expect(approved.approval.valid).toBe(true);
  return approved.approvedContent as string;
}

async function dispatchPrimary(content: string) {
  const { POST } = await import('@/app/api/dispatch/route');
  const response = await POST(post('/api/dispatch', { caseId: PRIMARY, content, via: 'api' }));
  expect(response.status).toBe(200);
}

describe('발송된 등기는 서버가 편집을 막는다', () => {
  it('dispatched 이후 edit API 는 409 이고 sentence_edited 가 늘지 않는다', async () => {
    const content = await approvePrimary();
    await dispatchPrimary(content);

    const before = (await eventsOf(PRIMARY)).filter((event) => event.type === 'sentence_edited');

    const response = await callEdit(0, '발송 뒤에 몰래 끼워 넣은 문장입니다.');
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('case_sealed');
    expect(body.reason).toBe('already_dispatched');

    const after = (await eventsOf(PRIMARY)).filter((event) => event.type === 'sentence_edited');
    expect(after).toHaveLength(before.length);
    expect(after.map((event) => (event.payload as { newText: string }).newText)).not.toContain(
      '발송 뒤에 몰래 끼워 넣은 문장입니다.',
    );
  });

  it('keep 과 reason 도 같은 409 로 막힌다', async () => {
    const content = await approvePrimary();
    await dispatchPrimary(content);
    const before = (await eventsOf(PRIMARY)).length;

    expect((await callKeep(0)).status).toBe(409);
    expect((await callReason(3, '조건 누락')).status).toBe(409);

    // 차단된 요청은 로그에 아무것도 남기지 않는다.
    expect((await eventsOf(PRIMARY)).length).toBe(before);
  });

  it('승인만 되고 아직 나가지 않은 상태의 편집은 그대로 허용된다', async () => {
    await approvePrimary();

    const response = await callEdit(0, '승인 뒤 발송 전에 고친 문장입니다.');
    expect(response.status).toBe(200);

    // 불변조건 2 — 승인은 무효가 되고, 그것이 이 경로의 정답이다.
    const types = (await eventsOf(PRIMARY)).map((event) => event.type);
    expect(types).toContain('approval_invalidated');
    expect((await response.json()).approval.valid).toBe(false);
  });
});
