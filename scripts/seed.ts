/**
 * DB 초기화 + 이벤트 시드 (스펙 §8).
 *   npm run seed
 */

import { PRIMARY_CASE_ID } from '../src/lib/constants';
import { closeDb } from '../src/lib/db';
import { seedDatabase } from '../src/lib/seed-runner';
import { buildQueue } from '../src/lib/views';

function main(): void {
  console.log('답변등기 — 합성 상담 시드');
  console.log('SYNTHETIC DEMO · 합성 예시 데이터 (실제 고객 데이터 아님)\n');

  const summary = seedDatabase({ verbose: true });

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

  console.log(`\n정본 데모 케이스 ${PRIMARY_CASE_ID} 는 "검토 대기" 상태로 두었습니다.`);
  console.log('npm run dev 로 띄운 뒤 화면에서 직접 검토·승인·발송하십시오.');

  closeDb();
}

main();
