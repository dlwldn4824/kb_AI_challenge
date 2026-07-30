/**
 * 정적 데모 번들에 넣을 seed 이벤트를 JSON 으로 뽑는다.
 *
 * 화면에 보일 값을 손으로 적지 않는다. 서버 모드와 똑같이 seed 를 돌린 뒤
 * 그 결과 이벤트 로그를 그대로 내보내므로, 두 모드의 출발점이 같다.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUTPUT = path.resolve('src/lib/static-demo/seed-events.json');

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-registry-export-'));
  process.env.ANSWER_REGISTRY_DB = path.join(tempDir, 'export.db');

  const { seedDatabase } = await import('../src/lib/seed-runner');
  const { readAllEvents, closeDb } = await import('../src/lib/db');

  const summary = seedDatabase();
  const events = readAllEvents();
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(events, null, 2)}\n`, 'utf8');

  console.log(`seed 이벤트 ${events.length}건 · 케이스 ${summary.caseCount}건`);
  console.log(`→ ${path.relative(process.cwd(), OUTPUT)}`);
}

void main();
