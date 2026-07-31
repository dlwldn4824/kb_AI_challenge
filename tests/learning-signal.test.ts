/**
 * 학습 신호 이벤트 (스펙 §2.1).
 *
 * 핵심은 "기록은 남기되 게이트는 건드리지 않는다"이다. approved 뒤에 이벤트가
 * 하나 더 쌓여도 승인이 무효화되면 안 되고(불변조건 2), 발송도 그대로 통과해야 한다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PRIMARY_DEMO } from '@/fixtures/cases';

const PRIMARY = 'RG-2026-081-0142';
let dbFile = '';

beforeEach(async () => {
  dbFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-learning-')),
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

/** 스펙 §5 데모 판정을 그대로 재현하고 승인까지 간다. */
async function approvePrimary() {
  const { startReview, keepSentence, editSentence, selectReason, approveCase } = await import(
    '@/lib/actions'
  );
  startReview(PRIMARY);
  for (const idx of PRIMARY_DEMO.keptIdx) keepSentence(PRIMARY, idx);
  editSentence(PRIMARY, PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.newText);
  selectReason(PRIMARY, PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.reason);
  return approveCase(PRIMARY);
}

describe('learning_signal_saved', () => {
  it('승인 직후 판정 레이블이 기록된다', async () => {
    const result = await approvePrimary();
    expect(result.ok).toBe(true);

    const { readEvents } = await import('@/lib/db');
    const events = readEvents(PRIMARY);
    const saved = events.find((event) => event.type === 'learning_signal_saved');

    expect(saved).toBeTruthy();
    expect(saved!.payload).toEqual({
      caseId: PRIMARY,
      sentenceCount: 5,
      editCount: 1,
      reasons: ['자격 미확인'],
      tierCounts: { S: 2, A: 2, B: 1 },
    });
  });

  it('approved 바로 다음에 온다', async () => {
    await approvePrimary();
    const { readEvents } = await import('@/lib/db');
    const types = readEvents(PRIMARY).map((event) => event.type);
    const approvedAt = types.indexOf('approved');

    expect(approvedAt).toBeGreaterThan(-1);
    expect(types[approvedAt + 1]).toBe('learning_signal_saved');
  });

  it('승인을 무효화하지 않는다 — 기록 전용 이벤트다', async () => {
    await approvePrimary();
    const { replay } = await import('@/lib/projection');
    const { readEvents } = await import('@/lib/db');
    const state = replay(PRIMARY);

    expect(state.validApproval).not.toBeNull();
    expect(state.status).toBe('검토 완료');
    expect(
      readEvents(PRIMARY).filter((event) => event.type === 'approval_invalidated'),
    ).toHaveLength(0);
  });

  it('이 이벤트가 쌓인 뒤에도 발송이 통과한다', async () => {
    await approvePrimary();
    const { dispatchContent } = await import('@/lib/actions');
    const { replay } = await import('@/lib/projection');

    const result = dispatchContent(PRIMARY, replay(PRIMARY).currentContent, 'ui');
    expect(result.ok).toBe(true);
  });

  it('seed 의 기승인 케이스에도 재현된다', async () => {
    const { readEvents } = await import('@/lib/db');
    for (const caseId of ['RG-2026-081-0098', 'RG-2026-081-0091']) {
      const types = readEvents(caseId).map((event) => event.type);
      expect(types, caseId).toContain('approved');
      expect(types, caseId).toContain('learning_signal_saved');
    }
  });
});
