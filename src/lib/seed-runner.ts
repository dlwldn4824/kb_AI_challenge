/**
 * 시드 실행기 (스펙 §6). scripts/seed.ts 와 테스트가 함께 쓴다.
 *
 * DB 파일을 지우고 다시 만든 뒤 이벤트만 INSERT 한다.
 * 신호는 fixture 에 적힌 값을 옮기는 게 아니라 scoring.ts 감지기를 돌려서 얻고,
 * fixture 의 expected 와 어긋나면 그 자리에서 실패시킨다.
 */

import { CASES, type CaseFixture } from '@/fixtures/cases';
import { approveCase, dispatchContent, keepSentence, startReview } from './actions';
import { eventTs } from './clock';
import { MODEL_NAME, MODEL_VERSION, PRIMARY_CASE_ID, SYSTEM_ACTOR } from './constants';
import { appendEvent, readAllEvents, recreateDatabaseFile } from './db';
import { replay } from './projection';
import { detectDraft } from './scoring';

/** 접수 시각 기준 상대 오프셋(초). 시드 케이스의 이벤트 시각을 결정론적으로 만든다. */
const OFFSET = {
  draft: 0,
  reviewStarted: 120,
  verdict: 180,
  approved: 300,
  dispatch: 360,
} as const;

function shift(iso: string, seconds: number): string {
  const shifted = new Date(Date.parse(iso) + seconds * 1000 + 9 * 3600 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

/**
 * 정본 케이스는 스펙 §5 의 고정 타임라인을 그대로 쓴다(clock.ts 가 관리).
 * 나머지 케이스는 접수 시각 + 오프셋.
 */
function tsFor(fixture: CaseFixture, seconds: number): string | undefined {
  return fixture.caseId === PRIMARY_CASE_ID ? undefined : shift(fixture.receivedAt, seconds);
}

export interface SeedSummary {
  dbFile: string;
  caseCount: number;
  eventCount: number;
  eventsByType: Record<string, number>;
  blockedCases: string[];
}

export interface SeedOptions {
  verbose?: boolean;
  /**
   * 시드에 넣을 케이스. 넣지 않으면 합성 정본 20건(CASES) 이다.
   * 실상담 재구성 트랙은 scripts/seed.ts 가 만들어 넘긴다 — src 가 scripts 를
   * 거꾸로 import 하지 않게 하려는 것이다.
   */
  cases?: CaseFixture[];
  /** 'aihub' 면 draft_created 에 표식을 남겨 화면 배지가 바뀐다. */
  dataset?: 'aihub';
}

export function seedDatabase(options: SeedOptions = {}): SeedSummary {
  const log = options.verbose ? console.log : () => {};
  const dbFile = recreateDatabaseFile();
  const blockedCases: string[] = [];

  const fixtures = options.cases ?? CASES;

  for (const fixture of fixtures) {
    const detected = detectDraft(fixture.sentences, fixture.product);

    // 정본 시드는 팩트 대조·누락 경로가 하나도 발화하지 않아야 한다. 발화한다면
    // 보강 규칙이 정상 문안을 물었다는 뜻이므로, 문장이 아니라 규칙을 고쳐야 한다.
    if (detected.derived.length > 0) {
      const detail = detected.derived
        .map((signal) => `${signal.origin}/${signal.type} — ${signal.detail}`)
        .join(' / ');
      throw new Error(`${fixture.caseId}: 정상 시드 문안에서 보강 규칙이 발화했습니다 — ${detail}`);
    }

    if (detected.r !== fixture.expected.r) {
      throw new Error(
        `${fixture.caseId}: 감지기 R=${detected.r} 이지만 fixture 기대값은 ${fixture.expected.r} 입니다.`,
      );
    }
    if (detected.tiers.join('·') !== fixture.expected.tiers.join('·')) {
      throw new Error(
        `${fixture.caseId}: 감지 티어 ${detected.tiers.join('·') || '-'} 이지만 기대값은 ${
          fixture.expected.tiers.join('·') || '-'
        } 입니다.`,
      );
    }

    const draftTs = tsFor(fixture, OFFSET.draft) ?? eventTs(fixture.caseId, 'draft_created');
    const signalsTs = tsFor(fixture, OFFSET.draft) ?? eventTs(fixture.caseId, 'signals_detected');

    appendEvent({
      caseId: fixture.caseId,
      type: 'draft_created',
      actor: SYSTEM_ACTOR,
      ts: draftTs,
      payload: {
        dataset: options.dataset,
        product: fixture.product,
        inquiry: fixture.inquiry,
        receivedAt: fixture.receivedAt,
        model: MODEL_NAME,
        modelVersion: MODEL_VERSION,
        confidence: fixture.confidence,
        sentences: detected.sentences,
      },
    });

    appendEvent({
      caseId: fixture.caseId,
      type: 'signals_detected',
      actor: SYSTEM_ACTOR,
      ts: signalsTs,
      // R=0 표본 선정도 플래그 컬럼이 아니라 이벤트로 남긴다 (스펙 §2.1).
      payload:
        fixture.flow === 'sampled'
          ? { signals: [], r: 0, confirmedHits: 0, sampled: true }
          : { signals: detected.signals, r: detected.r, confirmedHits: detected.confirmedHits },
    });

    if (fixture.flow === 'pending' || fixture.flow === 'sampled') {
      log(`  ${fixture.caseId}  R=${detected.r}  → ${fixture.flow === 'sampled' ? '표본 검토' : '검토 대기'}`);
      continue;
    }

    startReview(fixture.caseId, tsFor(fixture, OFFSET.reviewStarted));

    if (fixture.flow === 'in_review') {
      log(`  ${fixture.caseId}  R=${detected.r}  → 검토 중`);
      continue;
    }

    // 시드로 채우는 과거 케이스는 감지된 구절을 모두 "유지"로 판정한 것으로 둔다.
    for (const signal of detected.signals) {
      keepSentence(fixture.caseId, signal.sentenceIdx, tsFor(fixture, OFFSET.verdict));
    }

    const approved = approveCase(fixture.caseId, tsFor(fixture, OFFSET.approved));
    if (!approved.ok) {
      throw new Error(`${fixture.caseId}: 승인 실패 — ${approved.blockers.join(' / ')}`);
    }

    if (fixture.flow === 'approved') {
      log(`  ${fixture.caseId}  R=${detected.r}  → 검토 완료 (봉인 ${approved.approval.versionId})`);
      continue;
    }

    const contentToSend =
      fixture.flow === 'blocked'
        ? (fixture.tamperedContent ?? '')
        : replay(fixture.caseId).currentContent;

    const result = dispatchContent(
      fixture.caseId,
      contentToSend,
      fixture.flow === 'blocked' ? 'api' : 'ui',
      tsFor(fixture, OFFSET.dispatch),
    );

    if (fixture.flow === 'blocked') {
      if (result.ok) {
        throw new Error(`${fixture.caseId}: 변조 문안이 차단되지 않았습니다.`);
      }
      blockedCases.push(fixture.caseId);
      log(`  ${fixture.caseId}  R=${detected.r}  → 차단 (${result.reason})`);
      continue;
    }

    if (!result.ok) {
      throw new Error(`${fixture.caseId}: 발송이 차단되었습니다 — ${result.reason}`);
    }
    log(`  ${fixture.caseId}  R=${detected.r}  → 발행 완료`);
  }

  const events = readAllEvents();
  const eventsByType: Record<string, number> = {};
  for (const event of events) {
    eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
  }

  return {
    dbFile,
    caseCount: fixtures.length,
    eventCount: events.length,
    eventsByType,
    blockedCases,
  };
}
