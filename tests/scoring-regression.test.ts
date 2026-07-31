/**
 * 감지기 회귀 테스트 — 보강(팩트 대조 · 누락 · 상투구 제외) 이후에도
 * 시드 20건의 R 과 신호 조합이 한 칸도 움직이지 않았음을 고정한다.
 *
 * 기대값은 fixture 의 expected 를 다시 읽지 않고 여기에 직접 적는다.
 * fixture 와 감지기가 함께 틀리는 경우를 잡으려면 독립된 기록이 필요하다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CASES, PRIMARY_SENTENCES } from '@/fixtures/cases';
import { compareRank } from '@/lib/ranking';
import { detectDraft } from '@/lib/scoring';

/** caseId → [R, 신호 조합("티어:유형" 순서대로)] */
const SNAPSHOT: Record<string, { r: number; signals: string[] }> = {
  'RG-2026-081-0142': {
    r: 11,
    signals: [
      'S:numeric_change',
      'S:exemption_condition',
      'A:deadline_eligibility',
      'A:disadvantage_omission',
      'B:procedure_document',
    ],
  },
  'RG-2026-081-0139': {
    r: 8,
    signals: ['S:numeric_change', 'S:exemption_condition', 'A:disadvantage_omission'],
  },
  'RG-2026-081-0128': {
    r: 7,
    signals: ['S:numeric_change', 'A:deadline_eligibility', 'A:disadvantage_omission'],
  },
  'RG-2026-081-0121': { r: 6, signals: ['S:numeric_change', 'S:overcertainty'] },
  'RG-2026-081-0104': {
    r: 5,
    signals: ['A:deadline_eligibility', 'A:disadvantage_omission', 'B:procedure_document'],
  },
  'RG-2026-081-0117': { r: 4, signals: ['S:numeric_change', 'B:procedure_document'] },
  'RG-2026-081-0098': { r: 3, signals: ['A:deadline_eligibility', 'B:procedure_document'] },
  'RG-2026-081-0091': { r: 2, signals: ['A:deadline_eligibility'] },
  'RG-2026-081-0135': { r: 1, signals: ['B:procedure_document'] },
  'RG-2026-081-0083': { r: 0, signals: [] },
  'RG-2026-081-0077': { r: 0, signals: [] },
  'RG-2026-081-0072': { r: 0, signals: [] },
  'RG-2026-081-0068': { r: 0, signals: [] },
  'RG-2026-081-0064': { r: 0, signals: [] },
  'RG-2026-081-0059': { r: 0, signals: [] },
  'RG-2026-081-0055': { r: 0, signals: [] },
  'RG-2026-081-0048': { r: 0, signals: [] },
  'RG-2026-081-0042': { r: 0, signals: [] },
  'RG-2026-081-0037': { r: 0, signals: [] },
  'RG-2026-081-0031': { r: 0, signals: [] },
};

function combination(caseId: string): { r: number; signals: string[] } {
  const fixture = CASES.find((item) => item.caseId === caseId);
  if (!fixture) throw new Error(`fixture 없음: ${caseId}`);
  const detected = detectDraft(fixture.sentences, fixture.product);
  return {
    r: detected.r,
    signals: detected.signals.map((signal) => `${signal.tier}:${signal.type}`),
  };
}

describe('감지기 회귀 — 시드 케이스 불변', () => {
  it('스냅샷이 시드 20건을 모두 덮는다', () => {
    expect(Object.keys(SNAPSHOT).sort()).toEqual(CASES.map((c) => c.caseId).sort());
  });

  for (const caseId of Object.keys(SNAPSHOT)) {
    it(`${caseId} 의 R 과 신호 조합이 그대로다`, () => {
      expect(combination(caseId)).toEqual(SNAPSHOT[caseId]);
    });
  }

  it('정본 케이스는 R=11 · S·S·A·A·B · 구절별 유형 매핑까지 고정이다', () => {
    const detected = detectDraft(PRIMARY_SENTENCES, 'KB장병내일준비적금');
    expect(detected.r).toBe(11);
    expect(detected.tiers).toEqual(['S', 'S', 'A', 'A', 'B']);
    expect(detected.signals.map((signal) => [signal.sentenceIdx, signal.type])).toEqual([
      [0, 'numeric_change'],
      [1, 'exemption_condition'],
      [2, 'deadline_eligibility'],
      [3, 'disadvantage_omission'],
      [4, 'procedure_document'],
    ]);
  });

  it('정상 시드 문안에서는 보강 규칙(팩트 대조·누락)이 하나도 발화하지 않는다', () => {
    for (const fixture of CASES) {
      const detected = detectDraft(fixture.sentences, fixture.product);
      expect(detected.derived, `${fixture.caseId} 에서 보강 규칙 오발화`).toEqual([]);
    }
  });
});

describe('감지기 회귀 — seed 재생성 후 이벤트 대조', () => {
  let dbFile = '';

  beforeEach(async () => {
    dbFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-scoring-')),
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

  it('기록된 signals_detected 이벤트가 스냅샷과 일치한다', async () => {
    const { readEvents } = await import('@/lib/db');

    for (const fixture of CASES) {
      const event = readEvents(fixture.caseId).find((item) => item.type === 'signals_detected');
      expect(event, `${fixture.caseId} 의 signals_detected 이벤트 없음`).toBeTruthy();

      const payload = event!.payload as { signals: Array<{ tier: string; type: string }>; r: number };
      const expected = SNAPSHOT[fixture.caseId];

      // 저위험 표본은 신호를 비운 채 기록하므로(스펙 §2.1) R 만 대조한다.
      if (fixture.flow === 'sampled') {
        expect(payload.r).toBe(expected.r);
        continue;
      }

      expect({
        r: payload.r,
        signals: payload.signals.map((signal) => `${signal.tier}:${signal.type}`),
      }).toEqual(expected);
    }
  });
});

describe('보강 트리거 동작', () => {
  const PRODUCT = 'KB장병내일준비적금';

  it('정본과 다른 수치는 팩트 대조로 잡는다', () => {
    const tampered = PRIMARY_SENTENCES.map((text) => text.split('30만원').join('50만원'));
    const detected = detectDraft(tampered, PRODUCT);
    const mismatch = detected.derived.filter((signal) => signal.origin === 'fact_mismatch');

    expect(mismatch.length).toBeGreaterThan(0);
    expect(mismatch.every((signal) => signal.type === 'numeric_change')).toBe(true);
    expect(mismatch[0].detail).toContain('정본 30');
  });

  it('자격 요건 문장을 빼면 누락으로 잡는다', () => {
    const withoutEligibility = PRIMARY_SENTENCES.filter((_, idx) => idx !== 2);
    const detected = detectDraft(withoutEligibility, PRODUCT);

    // 존재 기반 규칙에서는 사라졌지만 부재 기반 규칙이 대신 발화한다.
    expect(detected.signals.some((signal) => signal.type === 'deadline_eligibility')).toBe(false);
    expect(
      detected.derived.some(
        (signal) => signal.origin === 'omission' && signal.type === 'deadline_eligibility',
      ),
    ).toBe(true);
  });

  it('불이익 문장을 빼면 누락으로 잡는다', () => {
    const withoutDisadvantage = PRIMARY_SENTENCES.filter((_, idx) => idx !== 3);
    const detected = detectDraft(withoutDisadvantage, PRODUCT);

    expect(detected.signals.some((signal) => signal.type === 'disadvantage_omission')).toBe(false);
    expect(
      detected.derived.some(
        (signal) => signal.origin === 'omission' && signal.type === 'disadvantage_omission',
      ),
    ).toBe(true);
  });

  it('조건절을 지우면 조건 없이 단정한 것으로 잡는다', () => {
    const withoutCondition = PRIMARY_SENTENCES.map((text) =>
      text.split('1회에 한하여 ').join(''),
    );
    const detected = detectDraft(withoutCondition, PRODUCT);

    expect(
      detected.derived.some(
        (signal) => signal.origin === 'fact_mismatch' && signal.type === 'exemption_condition',
      ),
    ).toBe(true);
  });

  it('상품명을 모르면 보강 규칙은 돌지 않는다 (감지기 입력은 문장+상품명뿐)', () => {
    const tampered = PRIMARY_SENTENCES.map((text) => text.split('30만원').join('50만원'));
    expect(detectDraft(tampered).derived).toEqual([]);
  });
});

describe('확정성 과장 — 상투구 제외', () => {
  it('"반드시 확인해 주시기 바랍니다"는 단정으로 세지 않는다', () => {
    const detected = detectDraft(['변경 후에는 반드시 내용을 확인해 주시기 바랍니다.']);
    expect(detected.signals).toEqual([]);
    expect(detected.r).toBe(0);
  });

  it('결과를 단정하는 "반드시"는 그대로 잡는다', () => {
    const detected = detectDraft(['평가일에 조건을 충족하면 반드시 조기상환됩니다.']);
    expect(detected.signals.map((signal) => signal.type)).toEqual(['overcertainty']);
  });

  it('"무조건 처리됩니다"도 그대로 잡는다', () => {
    const detected = detectDraft(['신청하신 한도 변경은 접수 즉시 무조건 처리됩니다.']);
    expect(detected.signals.map((signal) => signal.type)).toEqual(['overcertainty']);
  });
});

describe('큐 정렬 키 (ranking.ts)', () => {
  const at = (hhmm: string) => `2026-07-23T${hhmm}:00+09:00`;

  it('R 이 같으면 레퍼런스 확증이 많은 쪽이 앞선다', () => {
    const low = { r: 11, confirmedHits: 0, receivedAt: at('09:00') };
    const high = { r: 11, confirmedHits: 2, receivedAt: at('14:00') };

    expect(compareRank(high, low)).toBeLessThan(0);
    expect([low, high].sort(compareRank)).toEqual([high, low]);
  });

  it('R 이 다르면 R 이 먼저다 — 확증 건수가 R 을 뒤집지 못한다', () => {
    const higherR = { r: 11, confirmedHits: 0, receivedAt: at('14:00') };
    const lowerR = { r: 8, confirmedHits: 5, receivedAt: at('09:00') };

    expect([lowerR, higherR].sort(compareRank)).toEqual([higherR, lowerR]);
  });

  it('R 과 확증이 같으면 먼저 접수된 건이 앞선다', () => {
    const early = { r: 6, confirmedHits: 1, receivedAt: at('09:00') };
    const late = { r: 6, confirmedHits: 1, receivedAt: at('14:00') };

    expect([late, early].sort(compareRank)).toEqual([early, late]);
  });

  it('시드 케이스는 전부 confirmedHits=0 이라 큐 순서가 R 로만 결정된다', () => {
    for (const fixture of CASES) {
      const detected = detectDraft(fixture.sentences, fixture.product);
      expect(detected.confirmedHits, `${fixture.caseId}`).toBe(0);
    }
  });
});
