/**
 * 사유 오선택 → 불일치 → 재선택 흐름 (스펙 §5 정본 케이스).
 *
 * 사람이 처음 고른 사유가 실제 수정과 어긋나면 승인이 막히고, 사유를 바꿔 다시 고른
 * 뒤에야 통과한다. 여기서 지켜야 할 것은 "고쳐서 통과했다"가 아니라 **틀린 시도가
 * 지워지지 않고 남는다**는 쪽이다. append-only 로그의 존재 이유이자 덱 4번 캡처의 논점이다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let dbFile = '';

beforeEach(async () => {
  dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-retry-')), 'test.db');
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
/** 실제 수정은 확인 안내 추가라, 수치 사유를 고르면 어긋난다. */
const WRONG_REASON = '수치 오류';

function post(url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sentenceParams(caseId: string, idx: number) {
  return { params: Promise.resolve({ caseId, idx: String(idx) }) };
}

async function callReason(idx: number, reason: string) {
  const { POST } = await import('@/app/api/cases/[caseId]/sentences/[idx]/reason/route');
  return POST(
    post(`/api/cases/${PRIMARY}/sentences/${idx}/reason`, { reason }),
    sentenceParams(PRIMARY, idx),
  );
}

async function callApprove() {
  const { POST } = await import('@/app/api/cases/[caseId]/approve/route');
  return POST(post(`/api/cases/${PRIMARY}/approve`), {
    params: Promise.resolve({ caseId: PRIMARY }),
  });
}

/** 오선택까지 진행한다. 재선택은 각 테스트가 필요할 때 이어서 한다. */
async function reviewUpToWrongReason() {
  const { PRIMARY_DEMO } = await import('@/fixtures/cases');
  const { POST: reviewStart } = await import('@/app/api/cases/[caseId]/review-start/route');
  const { POST: keep } = await import('@/app/api/cases/[caseId]/sentences/[idx]/keep/route');
  const { POST: edit } = await import('@/app/api/cases/[caseId]/sentences/[idx]/edit/route');

  await reviewStart(post(`/api/cases/${PRIMARY}/review-start`), {
    params: Promise.resolve({ caseId: PRIMARY }),
  });
  for (const idx of PRIMARY_DEMO.keptIdx) {
    await keep(post(`/api/cases/${PRIMARY}/sentences/${idx}/keep`), sentenceParams(PRIMARY, idx));
  }
  await edit(
    post(`/api/cases/${PRIMARY}/sentences/${PRIMARY_DEMO.editedIdx}/edit`, {
      newText: PRIMARY_DEMO.newText,
    }),
    sentenceParams(PRIMARY, PRIMARY_DEMO.editedIdx),
  );
  await callReason(PRIMARY_DEMO.editedIdx, WRONG_REASON);
  return PRIMARY_DEMO;
}

async function readPrimaryEvents() {
  const { readEvents } = await import('@/lib/db');
  return readEvents(PRIMARY);
}

describe('사유 오선택과 재판단', () => {
  it('어긋난 사유는 불일치로 기록되고 승인을 막는다', async () => {
    await reviewUpToWrongReason();

    const events = await readPrimaryEvents();
    const checks = events.filter((event) => event.type === 'coherence_checked');
    expect(checks).toHaveLength(1);
    expect(checks[0].payload).toMatchObject({
      reason: WRONG_REASON,
      result: 'mismatch',
      detail: '문구 추가만 있고 수치 변경 없음 — 수치 오류 사유와 맞지 않습니다.',
    });

    const approve = await callApprove();
    expect(approve.status).toBe(422);
  });

  it('재선택해도 틀린 시도가 로그에서 지워지지 않는다', async () => {
    const demo = await reviewUpToWrongReason();
    await callReason(demo.editedIdx, demo.reason);

    const events = await readPrimaryEvents();
    const reasons = events
      .filter((event) => event.type === 'reason_selected')
      .map((event) => (event.payload as { reason: string }).reason);
    const results = events
      .filter((event) => event.type === 'coherence_checked')
      .map((event) => (event.payload as { result: string }).result);

    expect(reasons).toEqual([WRONG_REASON, demo.reason]);
    expect(results).toEqual(['mismatch', 'pass']);

    const approve = await callApprove();
    expect(approve.status).toBe(200);
  });

  it('오선택은 확정 사유보다 앞선 시각으로 남고 seq 순서와 어긋나지 않는다', async () => {
    const demo = await reviewUpToWrongReason();
    await callReason(demo.editedIdx, demo.reason);

    const events = await readPrimaryEvents();
    const reasonEvents = events.filter(
      (event) => event.type === 'reason_selected' || event.type === 'coherence_checked',
    );

    expect(reasonEvents.map((event) => event.ts)).toEqual([
      '2026-07-23T12:53:12+09:00',
      '2026-07-23T12:53:12+09:00',
      '2026-07-23T12:53:29+09:00',
      '2026-07-23T12:53:29+09:00',
    ]);

    // 전체 로그에서 seq 가 오르면 ts 도 뒤로만 간다 — 타임라인이 거꾸로 흐르지 않는다.
    const ordered = [...events].sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(Date.parse(ordered[i].ts)).toBeGreaterThanOrEqual(Date.parse(ordered[i - 1].ts));
    }
  });

  it('오선택이 끼어도 승인 봉인과 검토 소요는 그대로다', async () => {
    const demo = await reviewUpToWrongReason();
    await callReason(demo.editedIdx, demo.reason);
    const approved = await (await callApprove()).json();

    expect(approved.approval).toMatchObject({ valid: true, reason: demo.reason });

    const { GET } = await import('@/app/api/registry/[caseId]/route');
    const registry = await (
      await GET(new Request(`http://localhost/api/registry/${PRIMARY}`), {
        params: Promise.resolve({ caseId: PRIMARY }),
      })
    ).json();

    expect(registry.reviewDuration).toBe('02:41');
    expect(registry.edits).toHaveLength(1);
    expect(registry.edits[0].reason).toBe(demo.reason);
  });
});
