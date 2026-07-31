/**
 * DB 초기화 + 이벤트 시드 (스펙 §8).
 *   npm run seed
 *   npm run seed -- --aihub   # 실상담 재구성 케이스로 큐를 채운다 (WORKPLAN T10)
 *
 * 기본 동작은 합성 20건이고 --aihub 는 전적으로 선택이다. 데이터가 없으면 안내만
 * 하고 합성 시드로 돌아간다 — 클린 재현이 데이터 발급에 매이면 안 된다.
 */

import type { CaseFixture } from '../src/fixtures/cases';
import { PRIMARY_CASE_ID } from '../src/lib/constants';
import { closeDb } from '../src/lib/db';
import { detectDraft } from '../src/lib/scoring';
import { seedDatabase } from '../src/lib/seed-runner';
import { buildQueue } from '../src/lib/views';
import { listAihubFiles, loadAihubCases, splitSentences, MISSING_DATA_NOTICE } from './load-aihub';

/** 실상담 재구성 케이스 20건. R 상위 18건 + 저위험 표본 2건. */
function aihubFixtures(): CaseFixture[] {
  const scored = loadAihubCases({ limit: 400, seed: 20260723 })
    .map((item) => {
      const sentences = splitSentences(item.canonicalAnswer);
      const product = `하나은행 · ${item.topic.consulting}`;
      return { item, sentences, product, r: detectDraft(sentences, product).r };
    })
    .filter((entry) => entry.sentences.length >= 3)
    .sort((a, b) => b.r - a.r || a.item.meta.qaId.localeCompare(b.item.meta.qaId));

  const picked = [...scored.slice(0, 18), ...scored.filter((entry) => entry.r === 0).slice(0, 2)];

  return picked.map((entry, index) => {
    const detected = detectDraft(entry.sentences, entry.product);
    const minutes = 9 * 60 + index * 11;
    const receivedAt = `2026-07-23T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
      minutes % 60,
    ).padStart(2, '0')}:00+09:00`;

    return {
      caseId: `RG-2026-081-A${String(index + 1).padStart(3, '0')}`,
      product: entry.product,
      inquiry: entry.item.question.slice(0, 40) || entry.item.topic.qa,
      receivedAt,
      confidence: 0.6,
      sentences: entry.sentences,
      // 전부 검토 대기로 둔다. 이 트랙의 목적은 큐 구성과 배지 확인이다.
      flow: entry.r === 0 ? 'sampled' : 'pending',
      // 기대값은 감지기 결과 그대로다 — 실상담에는 정답 라벨이 없다.
      expected: { r: detected.r, tiers: detected.tiers },
    };
  });
}

function main(): void {
  const useAihub = process.argv.slice(2).includes('--aihub');
  const aihubReady = useAihub && listAihubFiles().length > 0;

  if (useAihub && !aihubReady) {
    console.log(MISSING_DATA_NOTICE);
    console.log('\n합성 시드로 진행합니다.\n');
  }

  const cases = aihubReady ? aihubFixtures() : undefined;

  console.log(aihubReady ? '답변등기 — AI Hub 실상담 재구성 시드' : '답변등기 — 합성 상담 시드');
  console.log(
    aihubReady
      ? 'SYNTHETIC DEMO · AI Hub 실상담 기반 재구성 (원본 문안이 아니라 변환 결과)\n'
      : 'SYNTHETIC DEMO · 합성 예시 데이터 (실제 고객 데이터 아님)\n',
  );

  const summary = seedDatabase({ verbose: true, cases, dataset: aihubReady ? 'aihub' : undefined });

  console.log(`\nDB              ${summary.dbFile}`);
  console.log(`케이스          ${summary.caseCount}건`);
  console.log(`이벤트          ${summary.eventCount}건 (INSERT 만 수행, UPDATE/DELETE 없음)`);
  console.log('\n이벤트 타입별 건수');
  for (const [type, count] of Object.entries(summary.eventsByType).sort()) {
    console.log(`  ${type.padEnd(22)} ${String(count).padStart(3)}`);
  }

  const queue = buildQueue();
  console.log('\n발행 대기 큐 (R 내림차순)');
  console.log('  R   신호        등기번호            접수    상태        상품');
  for (const item of queue.queue) {
    console.log(
      `  ${String(item.r).padStart(2)}  ${(item.tiers.join('·') || '-').padEnd(10)}  ${item.caseId}   ${item.receivedAtLabel}   ${item.status.padEnd(8)}  ${item.product}`,
    );
  }

  console.log('\n저위험 무작위 표본');
  for (const item of queue.samples) {
    console.log(`   0  표본        ${item.caseId}   ${item.receivedAtLabel}   ${item.status}      ${item.product}`);
  }

  if (summary.blockedCases.length > 0) {
    console.log(`\n발송 차단 이력  ${summary.blockedCases.join(', ')}`);
  }

  if (aihubReady) {
    console.log('\n실상담 재구성 케이스로 큐를 채웠습니다. 화면 배지가 "AI Hub 실상담 기반 재구성" 으로 바뀝니다.');
    console.log('정본 데모(합성 20건)로 돌아가려면 npm run seed 를 인자 없이 실행하십시오.');
  } else {
    console.log(`\n정본 데모 케이스 ${PRIMARY_CASE_ID} 는 "검토 대기" 상태로 두었습니다.`);
    console.log('npm run dev 로 띄운 뒤 화면에서 직접 검토·승인·발송하십시오.');
  }

  closeDb();
}

main();
