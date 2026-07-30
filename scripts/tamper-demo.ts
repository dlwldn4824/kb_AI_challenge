/**
 * 변조 발송 차단 시연 (스펙 §8).
 *   npx tsx scripts/tamper-demo.ts
 *
 * dev 서버가 떠 있으면 HTTP 로 /api/dispatch 를 때리고, 없으면 같은 라우트 핸들러를
 * 직접 호출한다. 어느 쪽이든 결과는 같다 — 검증은 서버에 있지 UI 에 있지 않다.
 */

import { approveCase, keepSentence, editSentence, selectReason, startReview } from '../src/lib/actions';
import { PRIMARY_CASE_ID } from '../src/lib/constants';
import { closeDb, readEvents } from '../src/lib/db';
import { shortDigest } from '../src/lib/digest';
import { PRIMARY_DEMO } from '../src/fixtures/cases';
import { replay } from '../src/lib/projection';

const DEV_SERVER = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:3000';

function line(char = '─'): void {
  console.log(char.repeat(78));
}

function requireSeed(): void {
  const events = readEvents(PRIMARY_CASE_ID);
  if (events.length === 0) {
    console.error(`시드가 없습니다. 먼저 실행하십시오:  npm run seed`);
    process.exit(1);
  }
  console.log(`① 시드 확인          ${PRIMARY_CASE_ID} · 이벤트 ${events.length}건`);
}

/** 정본 케이스가 아직 승인 전이면 스펙 §5 의 데모 판정을 그대로 재현한다. */
function ensureApproved(): void {
  let state = replay(PRIMARY_CASE_ID);
  if (state.approval) return;

  console.log('   (승인 전 상태여서 스펙 §5 데모 판정을 먼저 재현합니다)');
  if (!state.reviewStartedAt) startReview(PRIMARY_CASE_ID);
  for (const idx of PRIMARY_DEMO.keptIdx) keepSentence(PRIMARY_CASE_ID, idx);
  editSentence(PRIMARY_CASE_ID, PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.newText);
  selectReason(PRIMARY_CASE_ID, PRIMARY_DEMO.editedIdx, PRIMARY_DEMO.reason);

  const result = approveCase(PRIMARY_CASE_ID);
  if (!result.ok) {
    console.error(`승인 실패: ${result.blockers.join(' / ')}`);
    process.exit(1);
  }
  state = replay(PRIMARY_CASE_ID);
}

interface DispatchOutcome {
  transport: string;
  status: number;
  body: Record<string, unknown>;
}

async function tryHttpDispatch(
  caseId: string,
  content: string,
): Promise<DispatchOutcome | null> {
  try {
    const response = await fetch(`${DEV_SERVER}/api/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId, content, via: 'api' }),
      signal: AbortSignal.timeout(1500),
    });
    return {
      transport: `HTTP ${DEV_SERVER}/api/dispatch`,
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

async function directDispatch(caseId: string, content: string): Promise<DispatchOutcome> {
  const { POST } = await import('../src/app/api/dispatch/route');
  const response = await POST(
    new Request('http://localhost/api/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ caseId, content, via: 'api' }),
    }),
  );
  return {
    transport: 'route handler 직접 호출 (dev 서버 미기동)',
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function main(): Promise<void> {
  console.log('답변등기 — 변조 발송 차단 시연');
  console.log('SYNTHETIC DEMO · 합성 예시 데이터\n');
  line();

  requireSeed();
  ensureApproved();

  const state = replay(PRIMARY_CASE_ID);
  const approval = state.approval;
  if (!approval) throw new Error('승인 정보를 찾을 수 없습니다.');

  console.log('\n② 승인 상태 · 봉인 정보');
  console.log(`   등기번호          ${PRIMARY_CASE_ID}`);
  console.log(`   상태              ${state.status}`);
  console.log(`   버전              ${approval.versionId}`);
  console.log(`   승인문 digest     ${shortDigest(approval.contentDigest)}`);
  console.log(`   봉인 시각         ${approval.sealedAt}`);
  console.log(`   승인자            ${approval.approver} · ${approval.team}`);
  console.log(`   수정 사유         ${approval.reason}`);
  console.log(`   모델 버전         ${approval.modelVersion}`);
  console.log(`   봉인 HMAC         ${shortDigest(approval.seal)}`);
  console.log('\n   승인문');
  for (const sentence of approval.content.split('\n')) {
    console.log(`     │ ${sentence}`);
  }

  // 승인문에서 딱 한 군데, "30만원"을 "50만원"으로 바꾼다.
  const tampered = approval.content.replace('매월 30만원 이하', '매월 50만원 이하');
  if (tampered === approval.content) {
    throw new Error('변조 대상 문구를 찾지 못했습니다.');
  }

  console.log('\n③ 변조 문안으로 발송 시도  (승인문에서 30만원 → 50만원 한 곳만 변경)');
  const outcome = (await tryHttpDispatch(PRIMARY_CASE_ID, tampered)) ??
    (await directDispatch(PRIMARY_CASE_ID, tampered));

  console.log(`   경로              ${outcome.transport}`);
  line();
  console.log(`   HTTP ${outcome.status}`);
  console.log(JSON.stringify(
    {
      error: outcome.body.error,
      reason: outcome.body.reason,
      message: outcome.body.message,
      expectedDigest: outcome.body.expectedDigest,
      actualDigest: outcome.body.actualDigest,
    },
    null,
    2,
  ).split('\n').map((row) => `   ${row}`).join('\n'));
  line();

  const blocked = readEvents(PRIMARY_CASE_ID).findLast(
    (event) => event.type === 'dispatch_blocked',
  );
  console.log('\n   기록된 dispatch_blocked 이벤트');
  console.log(`     seq ${blocked?.seq}  ${blocked?.ts}  actor=${blocked?.actor}`);
  console.log(`     payload ${JSON.stringify(blocked?.payload)}`);

  if (outcome.status !== 409) {
    console.error('\n예상과 다릅니다: 409 가 아닙니다.');
    process.exit(1);
  }

  console.log('\n④ UI 를 거치지 않은 curl 도 동일하게 차단됩니다.');
  console.log('   dev 서버를 띄운 뒤(npm run dev) 아래를 그대로 실행해 보십시오:\n');
  console.log(`   curl -i -X POST ${DEV_SERVER}/api/dispatch \\`);
  console.log(`     -H 'content-type: application/json' \\`);
  console.log(
    `     -d '${JSON.stringify({ caseId: PRIMARY_CASE_ID, content: tampered.split('\n')[0] + ' …' })}'`,
  );
  console.log('\n   검증은 화면이 아니라 발송 경로 자체에 있습니다.');

  closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
