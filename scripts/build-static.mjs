/**
 * 정적 데모(GitHub Pages) 빌드.
 *
 * output: 'export' 는 API 라우트(POST 핸들러)와 공존할 수 없다. 정적 모드에서는
 * 그 경로가 아예 필요 없으므로(브라우저 스토어가 대신한다), 빌드 동안만 옆으로
 * 치웠다가 끝나면 반드시 되돌린다. tests/ 와 tamper-demo 는 그 라우트를 import 하므로 함께 비운다.
 * 서버 모드 빌드(`npm run build`)는 이 스크립트를 지나지 않으므로 영향이 없다.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HELD = [
  { from: 'src/app/api', to: '.hold-api-during-export' },
  { from: 'tests', to: '.hold-tests-during-export' },
  // tamper-demo 도 dispatch 라우트를 직접 import 한다 (서버 모드 전용 데모).
  { from: 'scripts/tamper-demo.ts', to: '.hold-tamper-during-export.ts' },
].map((entry) => ({ from: path.resolve(entry.from), to: path.resolve(entry.to) }));

function restore() {
  for (const entry of HELD) {
    if (fs.existsSync(entry.to)) {
      fs.rmSync(entry.from, { recursive: true, force: true });
      fs.renameSync(entry.to, entry.from);
    }
  }
}



/**
 * segment config 는 리터럴만 허용해 `STATIC_DEMO ? ... : ...` 로 쓸 수 없다.
 * 정적 export 동안에만 force-dynamic → force-static 으로 바꾸고 끝나면 되돌린다.
 */
const PAGES = [
  'src/app/page.tsx',
  'src/app/review/[caseId]/page.tsx',
  'src/app/done/[caseId]/page.tsx',
].map((file) => path.resolve(file));

const originals = new Map();


function patchSegmentConfig() {
  for (const file of PAGES) {
    const source = fs.readFileSync(file, 'utf8');
    originals.set(file, source);
    fs.writeFileSync(
      file,
      source.replace("export const dynamic = 'force-dynamic';", "export const dynamic = 'force-static';"),
      'utf8',
    );
  }
}

function restoreSegmentConfig() {
  for (const [file, source] of originals) fs.writeFileSync(file, source, 'utf8');
  originals.clear();
}

const restoreAll = () => {
  restoreSegmentConfig();
  restore();
};

process.on('exit', restoreAll);
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

try {
  for (const entry of HELD) {
    if (fs.existsSync(entry.from)) fs.renameSync(entry.from, entry.to);
  }
  patchSegmentConfig();

  execSync('npx next build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_DEMO: '1',
      NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? '/kb_AI_challenge',
    },
  });
} finally {
  restoreAll();
}
