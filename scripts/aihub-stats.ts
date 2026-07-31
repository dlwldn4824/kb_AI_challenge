/**
 * 실상담 주제 분포 통계 (WORKPLAN T10).
 *
 *   npm run aihub:stats
 *
 * 덱 한 줄("실제 은행 상담의 N% 가 금소법 민감 영역")의 근거를 만든다.
 * 원본은 repo 에 들어가지 않고 여기서 나온 파생 수치(docs/aihub-stats.json)만 남는다.
 *
 * ── 주제 → 티어 매핑 기준 ────────────────────────────────────────────────────
 * 은행 분야 consulting_topic 은 닫힌 집합 9종(+ qa_topic 의 "기타(은행)")이라
 * 하나씩 손으로 배정했다. 기준은 감지기 티어 정의와 같다:
 *   S = 금액·금리·면제조건처럼 계약의 핵심 수치·조건을 말하는 주제
 *   A = 기한·자격 요건, 해지·연체 같은 불이익 고지가 걸리는 주제
 *   B = 절차·서류 안내
 *   —  = 조회성 안내. 잘못 말해도 계약 조건이 바뀌지 않는다
 *
 * 손으로 배정한 값이므로 그대로 믿지 않는다. 같은 표에 **감지기가 실제로 그 주제의
 * 모범답변에서 S/A 신호를 발화시킨 비율**을 나란히 실어 매핑을 검증할 수 있게 했다.
 * 덱에 쓸 숫자는 손 배정이 아니라 감지기 측정값 쪽이다.
 */

import fs from 'node:fs';
import path from 'node:path';

import { listAihubFiles, loadAihubCases, splitSentences, MISSING_DATA_NOTICE } from './load-aihub';
import { detectDraftWithFacts } from '../src/lib/scoring';
import type { Tier } from '../src/lib/scoring';

type Assigned = Tier | null;

/** 주제별 손 배정. 근거는 각 줄 주석에 남긴다. */
const TOPIC_TIER: Record<string, { tier: Assigned; area: string; why: string }> = {
  '대출문의(만기/연장/조회등)': {
    tier: 'A',
    area: '만기/해지 · 자격',
    why: '만기·연장은 기한과 자격 요건이 걸리고, 조건 안내에 금액·금리가 따라온다',
  },
  '이자/연체금액': {
    tier: 'S',
    area: '수치 · 이자/연체',
    why: '이율·금액이 답변의 핵심이고 연체는 불이익 고지 대상이다',
  },
  '금융거래한도/비대면한도계좌': {
    tier: 'S',
    area: '한도',
    why: '한도 금액이 곧 수치이고 비대면 제한은 자격·불이익에 걸린다',
  },
  '만기,연장/해지,수신': {
    tier: 'A',
    area: '만기/해지',
    why: '중도해지이율·불이익 고지가 따라붙는다',
  },
  부수거래금리감면: {
    tier: 'S',
    area: '수치 · 면제조건',
    why: '감면은 면제 조건이고 금리는 수치다',
  },
  환전문의: {
    tier: null,
    area: '조회성',
    why: '환율·수수료 수치가 나오지만 계약 조건을 바꾸지 않는다. 정본 시드에서도 환율 우대 안내를 R=0 으로 두었다',
  },
  자동이체조회: { tier: null, area: '조회성', why: '조회 안내. 계약 조건 변경 없음' },
  '거래내역/잔액조회': { tier: null, area: '조회성', why: '조회 안내. 계약 조건 변경 없음' },
  '중계요청/착오송금': { tier: 'B', area: '절차·서류', why: '처리 절차 안내라 S/A 가 아니다' },
  '기타(은행)': { tier: null, area: '분류 불가', why: '주제가 특정되지 않는다' },
};

interface TopicRow {
  topic: string;
  count: number;
  share: number;
  assignedTier: Assigned;
  area: string;
  /** 감지기가 그 주제 모범답변에서 S 신호를 발화시킨 비율. */
  measuredS: number;
  measuredA: number;
  measuredSA: number;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const round = (value: number) => Number(value.toFixed(4));

function main(): void {
  if (listAihubFiles().length === 0) {
    console.log(MISSING_DATA_NOTICE);
    return;
  }

  // 분포 통계라 표본이 아니라 전체를 읽는다 (45,000건, 약 2초).
  const cases = loadAihubCases();
  const buckets = new Map<string, { count: number; s: number; a: number; sa: number }>();

  for (const item of cases) {
    const topic = item.topic.consulting || '(미기재)';
    const bucket = buckets.get(topic) ?? { count: 0, s: 0, a: 0, sa: 0 };
    bucket.count += 1;

    // 상품 팩트 없이 패턴 규칙만 돌린다 — 하나은행 상품은 카탈로그에 없다.
    const tiers = new Set(
      detectDraftWithFacts(splitSentences(item.canonicalAnswer)).signals.map((signal) => signal.tier),
    );
    if (tiers.has('S')) bucket.s += 1;
    if (tiers.has('A')) bucket.a += 1;
    if (tiers.has('S') || tiers.has('A')) bucket.sa += 1;

    buckets.set(topic, bucket);
  }

  const total = cases.length;
  const rows: TopicRow[] = [...buckets]
    .map(([topic, bucket]) => {
      const assigned = TOPIC_TIER[topic] ?? { tier: null, area: '(미분류)', why: '매핑 없음' };
      return {
        topic,
        count: bucket.count,
        share: bucket.count / total,
        assignedTier: assigned.tier,
        area: assigned.area,
        measuredS: bucket.s / bucket.count,
        measuredA: bucket.a / bucket.count,
        measuredSA: bucket.sa / bucket.count,
      };
    })
    .sort((a, b) => b.count - a.count);

  const assignedSensitive = rows
    .filter((row) => row.assignedTier === 'S' || row.assignedTier === 'A')
    .reduce((sum, row) => sum + row.count, 0);
  const measuredSensitive = rows.reduce((sum, row) => sum + row.measuredSA * row.count, 0);

  const width = Math.max(...rows.map((row) => [...row.topic].length * 2)) + 2;
  const pad = (text: string, size: number) => {
    let w = 0;
    for (const ch of text) w += /[가-힣]/.test(ch) ? 2 : 1;
    return text + ' '.repeat(Math.max(0, size - w));
  };

  console.log('AI Hub 은행 상담 — 주제 분포와 티어 민감도');
  console.log('원본 재배포 금지 · 파생 수치만 기록\n');
  console.log(`총 ${total.toLocaleString()}건 · 주제 ${rows.length}종\n`);
  console.log(
    `${pad('주제', width)}${'건수'.padStart(8)}${'비중'.padStart(9)}${'배정'.padStart(6)}${'감지 S'.padStart(9)}${'감지 A'.padStart(9)}${'감지 S/A'.padStart(11)}`,
  );
  console.log('─'.repeat(width + 52));
  for (const row of rows) {
    console.log(
      pad(row.topic, width) +
        row.count.toLocaleString().padStart(8) +
        pct(row.share).padStart(9) +
        (row.assignedTier ?? '—').padStart(6) +
        pct(row.measuredS).padStart(9) +
        pct(row.measuredA).padStart(9) +
        pct(row.measuredSA).padStart(11),
    );
  }

  console.log(
    `\n손 배정 기준 S/A 주제 비중      ${pct(assignedSensitive / total)}  (${assignedSensitive.toLocaleString()}/${total.toLocaleString()}건)`,
  );
  console.log(
    `감지기 실측 S/A 신호 발화 비중  ${pct(measuredSensitive / total)}  ← 덱에 쓸 숫자`,
  );
  console.log(
    '\n손 배정은 주제 이름만 보고 나눈 것이고, 실측은 그 주제의 모범답변을 감지기에 실제로 통과시킨 결과다.',
  );

  const output = {
    dataset: {
      name: 'AI Hub 금융분야 고객상담 데이터 (dataSetSn=71926)',
      domain: '은행',
      files: listAihubFiles().length,
      cases: total,
      institution: [...new Set(cases.map((item) => item.meta.institution))],
      redistribution: '원본 재배포 금지 — repo 에는 파생 수치만 포함',
    },
    mapping_basis: {
      S: '금액·금리·면제조건처럼 계약의 핵심 수치·조건을 말하는 주제',
      A: '기한·자격 요건, 해지·연체 같은 불이익 고지가 걸리는 주제',
      B: '절차·서류 안내',
      none: '조회성 안내 — 잘못 말해도 계약 조건이 바뀌지 않는다',
      note: '손 배정 값과 별개로 감지기 실측 비율을 함께 싣는다. 덱 숫자는 실측 쪽을 쓴다.',
      per_topic_reason: Object.fromEntries(
        Object.entries(TOPIC_TIER).map(([topic, value]) => [topic, `${value.tier ?? '—'} · ${value.area} — ${value.why}`]),
      ),
    },
    sensitive_share: {
      assigned: round(assignedSensitive / total),
      measured_detector: round(measuredSensitive / total),
    },
    by_topic: rows.map((row) => ({
      topic: row.topic,
      count: row.count,
      share: round(row.share),
      assigned_tier: row.assignedTier,
      area: row.area,
      measured_s: round(row.measuredS),
      measured_a: round(row.measuredA),
      measured_sa: round(row.measuredSA),
    })),
  };

  const outputPath = path.resolve('docs/aihub-stats.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`\n→ ${path.relative(process.cwd(), outputPath)}`);
}

main();
