/**
 * AI Hub 「금융분야 고객상담 데이터」 은행 분야 로더 (WORKPLAN T8).
 *
 *   npm run aihub:load          # 요약 출력
 *   npm run aihub:load -- --limit 20 --print
 *
 * 원본은 재배포 금지라 `data/aihub/` 는 .gitignore 에 들어 있다. repo 에 남는 것은
 * 파생 수치(docs/eval-results-aihub.json, docs/aihub-stats.json)뿐이다.
 *
 * 데이터가 없어도 실패하지 않는다. 안내만 출력하고 정상 종료한다 —
 * 기본 데모(합성 20건)는 이 파일과 무관하게 항상 동작해야 하기 때문이다.
 *
 * ── 실물 스키마 (정찰 결과와 다른 부분이 있어 실물 기준으로 구현) ──────────────
 *   source.consulting_content    TX/RX 상담 전문
 *   source.source_institution    예: 하나은행
 *   consulting.consulting_topic  예: 대출문의(만기/연장/조회등)
 *   consulting.consulting_summary
 *   qa_data[] {
 *     qa_id, task_category, consulting_situation, qa_topic, consulting_purpose,
 *     core_financial_terms, instruction,
 *     input { question, answer, follow_up_question },   ← input.answer 가 "있다"
 *     output                                            ← 모범답변(정본)
 *   }
 * 표본 400건에서 instruction·output·input.question·input.answer·
 * input.follow_up_question 는 100%, core_financial_terms 만 85.5% 였고
 * 파일당 qa_data 는 항상 1건이었다.
 */

import fs from 'node:fs';
import path from 'node:path';

export const AIHUB_DIR = path.resolve('data/aihub');

/** 내부 스키마. 이후 단계(eval·stats)는 이 모양만 안다. */
export interface AihubCase {
  /** 고객의 최초 질문. */
  question: string;
  /** output 이 직접 답하는 추가 질문(있을 때). */
  followUpQuestion: string;
  /** 모범답변 — 오류 주입의 정본이자 팩트 대조 레퍼런스. */
  canonicalAnswer: string;
  topic: { consulting: string; qa: string };
  meta: {
    sourceId: string;
    qaId: string;
    institution: string;
    sourceDate: string;
    taskCategory: string;
    consultingSituation: string;
    coreFinancialTerms: string;
    instruction: string;
    summary: string;
    file: string;
  };
}

interface RawFile {
  source?: Record<string, unknown>;
  consulting?: Record<string, unknown>;
  qa_data?: Array<Record<string, unknown>>;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** 시드 고정 PRNG (표본 추출 재현용). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** data/aihub/ 아래 은행 데이터 json 경로. 정렬해서 돌려주므로 순서가 고정이다. */
export function listAihubFiles(): string[] {
  if (!fs.existsSync(AIHUB_DIR)) return [];
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) found.push(full);
    }
  };

  // 은행 분야만 쓴다. 보험·증권 폴더가 섞여 있어도 집지 않는다.
  for (const entry of fs.readdirSync(AIHUB_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    if (!/_은행$/.test(entry.name)) continue;
    walk(path.join(AIHUB_DIR, entry.name));
  }

  return found;
}

export function parseAihubFile(file: string): AihubCase[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawFile;
  const source = raw.source ?? {};
  const consulting = raw.consulting ?? {};

  return (raw.qa_data ?? []).flatMap((item) => {
    const input = (item.input ?? {}) as Record<string, unknown>;
    const canonicalAnswer = str(item.output).trim();
    if (!canonicalAnswer) return [];

    return [
      {
        question: str(input.question).trim(),
        followUpQuestion: str(input.follow_up_question).trim(),
        canonicalAnswer,
        topic: {
          consulting: str(consulting.consulting_topic),
          qa: str(item.qa_topic),
        },
        meta: {
          sourceId: str(source.source_id),
          qaId: str(item.qa_id),
          institution: str(source.source_institution),
          sourceDate: str(source.source_date),
          taskCategory: str(item.task_category),
          consultingSituation: str(item.consulting_situation),
          coreFinancialTerms: str(item.core_financial_terms),
          instruction: str(item.instruction),
          summary: str(consulting.consulting_summary),
          file: path.relative(AIHUB_DIR, file),
        },
      },
    ];
  });
}

export interface LoadOptions {
  /** 파싱할 파일 수 상한. 없으면 전부. */
  limit?: number;
  /** 표본 추출 시드. limit 이 있을 때만 쓴다. */
  seed?: number;
}

export function loadAihubCases(options: LoadOptions = {}): AihubCase[] {
  const files = listAihubFiles();
  if (files.length === 0) return [];

  let picked = files;
  if (options.limit !== undefined && options.limit < files.length) {
    // 파일 목록은 정렬돼 있고 셔플은 시드 고정이라 매번 같은 표본이 나온다.
    const rand = mulberry32(options.seed ?? 20260723);
    const order = files.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    picked = order.slice(0, options.limit).map((i) => files[i]);
  }

  return picked.flatMap(parseAihubFile);
}

export const MISSING_DATA_NOTICE = [
  'AI Hub 은행 상담 데이터가 없습니다. 기본 데모(합성 20건)는 이것 없이도 그대로 동작합니다.',
  '',
  '실데이터 트랙을 쓰려면:',
  '  1. AI Hub 「금융분야 고객상담 데이터」(dataSetSn=71926) 를 발급받습니다.',
  '  2. 은행 분야 라벨링 데이터를 조립·해제합니다 (보험·증권은 쓰지 않습니다).',
  '       cat TL_은행.zip.part* > TL_은행.zip && unzip TL_은행.zip -d data/aihub/TL_은행',
  '       cat VL_은행.zip.part* > VL_은행.zip && unzip VL_은행.zip -d data/aihub/VL_은행',
  '  3. 다시 실행합니다.',
  '',
  '원본은 재배포 금지라 data/aihub/ 는 .gitignore 에 있습니다. repo 에는 파생 수치만 남습니다.',
].join('\n');

function main(): void {
  const argv = process.argv.slice(2);
  const limitAt = argv.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(argv[limitAt + 1]) : undefined;

  const files = listAihubFiles();
  if (files.length === 0) {
    console.log(MISSING_DATA_NOTICE);
    return;
  }

  const cases = loadAihubCases({ limit });
  const topics = new Map<string, number>();
  for (const item of cases) {
    topics.set(item.topic.consulting, (topics.get(item.topic.consulting) ?? 0) + 1);
  }

  console.log('AI Hub 은행 상담 데이터 로더');
  console.log(`  파일        ${files.length.toLocaleString()}건`);
  console.log(`  파싱        ${cases.length.toLocaleString()}건${limit ? ` (--limit ${limit})` : ''}`);
  console.log(`  기관        ${[...new Set(cases.map((c) => c.meta.institution))].join(' · ')}`);
  console.log('\n  상담 주제 분포 (상위 10)');
  for (const [topic, count] of [...topics].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${String(count).padStart(5)}  ${topic}`);
  }

  if (argv.includes('--print')) {
    console.log('\n  표본 1건');
    const one = cases[0];
    console.log(`    주제        ${one.topic.consulting} / ${one.topic.qa}`);
    console.log(`    질문        ${one.question.slice(0, 80)}`);
    console.log(`    추가 질문   ${one.followUpQuestion.slice(0, 80)}`);
    console.log(`    모범답변    ${one.canonicalAnswer.slice(0, 120)}`);
  }
}

// 다른 스크립트가 import 할 때는 main 을 돌리지 않는다.
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('load-aihub.ts')) {
  main();
}
