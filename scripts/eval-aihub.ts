/**
 * 실상담 기반 정량 평가 (WORKPLAN T9).
 *
 *   npm run eval -- --aihub
 *
 * AI Hub 은행 상담의 모범답변(qa_data[].output)을 정본으로 삼고, 합성 평가와 같은
 * 6가지 오류를 주입해 만든 평가셋으로 v2 감지기 + 확증 정렬을 잰다.
 *
 * ── 레퍼런스에 대한 주의 (결과 해석에 필수) ────────────────────────────────────
 * 하나은행 상품은 product-facts.ts 에 없다. 그래서 **그 건의 모범답변 자체를 정본
 * 레퍼런스로 삼는다** — 은행이 FAQ 정본을 보유한다는 제품 전제와 같은 구조다.
 * 다만 그 결과 오류 주입기와 감지기가 같은 문서를 참조하게 되므로, 여기서 나오는
 * 수치는 성능이 아니라 **상한**이다. 실제 초안은 정본이 예상하지 못한 방식으로도
 * 틀린다. 합성 평가(docs/eval-results.json)와 같은 한계다.
 *
 * 합성 평가와 파일·수치를 섞지 않는다. 결과는 docs/eval-results-aihub.json 이다.
 *
 * 지표 정의는 합성 평가와 같다: Recall@K = 상위 K 안의 양성 / 전체 양성,
 * Precision@K = 상위 K 안의 양성 / K. 두 스크립트를 각각 읽어도 되도록
 * 계산은 일부러 각자 갖고 있다.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadAihubCases, listAihubFiles, MISSING_DATA_NOTICE, type AihubCase } from './load-aihub';
import type { ProductFacts } from '../src/fixtures/product-facts';
import { compareRank } from '../src/lib/ranking';
import { detectDraftWithFacts } from '../src/lib/scoring';
import type { SignalType } from '../src/lib/scoring';

const SEED = 20260723;
const K = 39;
const RANDOM_TRIALS = 1000;
/** 파싱할 원본 파일 수. 45,000건 전부 읽지 않고 시드 고정 표본만 쓴다. */
const SAMPLE_FILES = 3000;
const POSITIVES_PER_TYPE = 8;
const NEGATIVES_PER_SOURCE = 4;
const ARRIVAL_BASE_MS = Date.parse('2026-07-23T00:00:00.000Z');

const ERROR_TYPES: SignalType[] = [
  'numeric_change',
  'exemption_condition',
  'overcertainty',
  'deadline_eligibility',
  'disadvantage_omission',
  'procedure_document',
];

const ERROR_TYPE_LABEL: Record<SignalType, string> = {
  numeric_change: '수치 바꿔치기',
  exemption_condition: '조건절 삭제',
  overcertainty: '단정 표현 삽입',
  deadline_eligibility: '자격 요건 삭제',
  disadvantage_omission: '불이익 문구 삭제',
  procedure_document: '서류 절차 왜곡',
};

const ERROR_TYPE_KEY: Record<SignalType, string> = {
  numeric_change: '수치바꿔치기',
  exemption_condition: '조건삭제',
  overcertainty: '단정삽입',
  deadline_eligibility: '자격요건삭제',
  disadvantage_omission: '불이익누락',
  procedure_document: '서류절차왜곡',
};

// ─────────────────────────────────────────────────────────────────────────────

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

function shuffled(count: number, rand: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function levenshtein(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  let current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const sub = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, sub);
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length];
}

/** 한국어 종결어미 뒤에서 끊는다. 모범답변은 대체로 3~5문장이다. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 케이스별 정본 레퍼런스
// ─────────────────────────────────────────────────────────────────────────────

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NUMBER_TOKEN_SOURCE =
  '([가-힣A-Za-z][가-힣A-Za-z ]{1,9})\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(만원|원|%|퍼센트|회|개월|년|일|배|건|시간|분)';

/**
 * 매번 새로 만든다. /g 정규식을 공유하면 exec 이 남긴 lastIndex 를 matchAll 이
 * 그대로 물려받아 문자열 앞부분을 통째로 건너뛴다(실제로 이 버그로 레퍼런스에서
 * 앞쪽 수치가 빠져 확증이 6/48 로 낮게 나왔다).
 */
const numberToken = () => new RegExp(NUMBER_TOKEN_SOURCE, 'g');

/**
 * 모범답변에서 정본 레퍼런스를 만든다.
 *
 *  - numbers : 앞 문맥을 붙여 슬롯을 특정한 수치들. 맨 숫자만 잡으면 다른 뜻의
 *              숫자까지 물어 오탐이 되므로 앞 어절을 반드시 포함시킨다.
 *  - required: 정본 답변이 실제로 담고 있던 신호 유형들. 초안에서 그 유형이 통째로
 *              사라지면 "있어야 할 안내가 빠졌다"로 본다.
 *  - conditions: 비워 둔다. 조건절의 claim/qualifier 짝은 상품 지식이 있어야
 *              만들 수 있어서 일반화된 규칙으로 뽑지 않았다(한계로 기록).
 */
function referenceFor(canonical: string): ProductFacts {
  const numbers: ProductFacts['numbers'] = [];
  const seen = new Set<string>();

  for (const match of canonical.matchAll(numberToken())) {
    const [, context, value, unit] = match;
    const anchor = context.trim();
    if (anchor.length < 2) continue;
    const key = `${anchor}|${unit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    numbers.push({
      key: `num_${numbers.length}`,
      label: `${anchor} ${unit}`,
      slot: new RegExp(`${escapeRe(anchor)}\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*${escapeRe(unit)}`),
      canonical: value,
      type: 'numeric_change',
    });
  }

  const canonicalTypes = [
    ...new Set(detectDraftWithFacts(splitSentences(canonical)).signals.map((signal) => signal.type)),
  ];

  return {
    product: 'aihub-canonical',
    numbers,
    conditions: [],
    required:
      canonicalTypes.length > 0
        ? [
            {
              key: 'canonical_coverage',
              label: '정본 답변에 있던 안내',
              claim: /[\s\S]/,
              requires: canonicalTypes,
            },
          ]
        : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 오류 주입기 — 임의의 한국어 상담 답변에 적용되는 일반형
// ─────────────────────────────────────────────────────────────────────────────

interface Injector {
  type: SignalType;
  apply: (sentences: string[]) => string[] | null;
}

/** 수치를 다른 값으로 바꾼다. 자릿수 형식은 유지한다. */
function bumpNumber(raw: string): string {
  const hasComma = raw.includes(',');
  const numeric = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(numeric) || numeric === 0) return raw;
  const bumped = Number.isInteger(numeric) ? numeric * 2 : Number((numeric * 2).toFixed(2));
  const text = String(bumped);
  return hasComma ? Number(bumped).toLocaleString('en-US') : text;
}

const CONDITION_CLAUSE =
  /[^.,]*?(?:하시는 경우|하신 경우|인 경우|이신 경우|하는 경우|에 한하여|에 한해|하시면|이시면)(?:에는|에|,)?\s*/;

const INJECTORS: Injector[] = [
  {
    type: 'numeric_change',
    apply: (sentences) => {
      for (let i = 0; i < sentences.length; i += 1) {
        const match = numberToken().exec(sentences[i]);
        if (!match) continue;
        const changed = bumpNumber(match[2]);
        if (changed === match[2]) continue;
        const swapped = match[0].replace(match[2], changed);
        const next = [...sentences];
        next[i] =
          sentences[i].slice(0, match.index) + swapped + sentences[i].slice(match.index + match[0].length);
        return next;
      }
      return null;
    },
  },
  {
    type: 'exemption_condition',
    apply: (sentences) => {
      for (let i = 0; i < sentences.length; i += 1) {
        if (!CONDITION_CLAUSE.test(sentences[i])) continue;
        const stripped = sentences[i].replace(CONDITION_CLAUSE, '').trim();
        if (stripped.length < 10) continue;
        const next = [...sentences];
        next[i] = stripped;
        return next;
      }
      return null;
    },
  },
  {
    type: 'overcertainty',
    // 과장 단정은 기존 문장을 대체하기보다 확언을 덧붙이는 형태로 나타난다.
    apply: (sentences) => [...sentences, '해당 건은 별도 확인 없이 무조건 처리됩니다.'],
  },
  {
    type: 'deadline_eligibility',
    apply: (sentences) => dropSentenceMatching(sentences, /기한|이내|까지|자격|요건|대상|만기|기간/),
  },
  {
    type: 'disadvantage_omission',
    apply: (sentences) =>
      dropSentenceMatching(sentences, /해지|연체|불가|손실|추징|제한|불이익|수수료|미납/),
  },
  {
    type: 'procedure_document',
    apply: (sentences) => {
      for (let i = 0; i < sentences.length; i += 1) {
        if (!/서류|신청서|증빙|신분증/.test(sentences[i])) continue;
        const rewritten = sentences[i]
          .replace(/제출해\s*주셔야\s*합니다/, '제출하지 않으셔도 됩니다')
          .replace(/제출하시면\s*됩니다/, '제출하지 않으셔도 됩니다')
          .replace(/필요합니다/, '필요하지 않습니다')
          .replace(/제출해\s*주시기\s*바랍니다/, '제출하지 않으셔도 됩니다');
        if (rewritten === sentences[i]) continue;
        const next = [...sentences];
        next[i] = rewritten;
        return next;
      }
      return null;
    },
  },
];

function dropSentenceMatching(sentences: string[], pattern: RegExp): string[] | null {
  if (sentences.length < 2) return null;
  const idx = sentences.findIndex((sentence) => pattern.test(sentence));
  if (idx < 0) return null;
  return sentences.filter((_, i) => i !== idx);
}

// ─────────────────────────────────────────────────────────────────────────────
// 무해 변주 — 뜻은 그대로 두고 표면만 바꾼다
// ─────────────────────────────────────────────────────────────────────────────

interface Variation {
  id: string;
  rate: number;
  apply: (sentences: string[], rand: () => number) => string[];
}

const VARIATIONS: Variation[] = [
  { id: 'greeting', rate: 0.35, apply: (s) => ['안녕하세요, 고객님. 문의해 주셔서 감사합니다.', ...s] },
  { id: 'closing', rate: 0.35, apply: (s) => [...s, '추가로 궁금하신 점이 있으시면 언제든 문의해 주시기 바랍니다.'] },
  { id: 'branch', rate: 0.2, apply: (s) => [...s, '자세한 내용은 가까운 영업점에서도 안내받으실 수 있습니다.'] },
  {
    id: 'connective',
    rate: 0.25,
    apply: (s, rand) => {
      if (s.length < 2) return s;
      const idx = 1 + Math.floor(rand() * (s.length - 1));
      const next = [...s];
      next[idx] = `또한 ${next[idx]}`;
      return next;
    },
  },
  { id: 'ending', rate: 0.3, apply: (s) => s.map((t) => t.split('해 주셔야 합니다').join('해 주시기 바랍니다')) },
  {
    id: 'reorder',
    rate: 0.25,
    apply: (s, rand) => {
      if (s.length < 2) return s;
      const i = Math.floor(rand() * (s.length - 1));
      const next = [...s];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  errorType: SignalType;
  positive: boolean;
  topic: string;
  sentences: string[];
  r: number;
  confirmedHits: number;
  editDistance: number;
  receivedAt: string;
}

interface Metrics {
  hits: number;
  recall: number;
  precision: number;
}

function evaluate(items: Item[], order: number[], positives: number): Metrics {
  const hits = order.slice(0, K).filter((index) => items[index].positive).length;
  return { hits, recall: hits / positives, precision: hits / K };
}

const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function runAihubEval(): void {
  if (listAihubFiles().length === 0) {
    console.log(MISSING_DATA_NOTICE);
    return;
  }

  const rand = mulberry32(SEED);
  const cases = loadAihubCases({ limit: SAMPLE_FILES, seed: SEED });

  // 문장이 2개 이상인 답변만 쓴다. 한 문장짜리는 삭제형 오류를 만들 수 없다.
  const usable = cases
    .map((item) => ({ item, sentences: splitSentences(item.canonicalAnswer) }))
    .filter((entry) => entry.sentences.length >= 3);

  const items: Item[] = [];
  const used = new Set<string>();
  const shortage: string[] = [];

  for (const type of ERROR_TYPES) {
    const injector = INJECTORS.find((candidate) => candidate.type === type)!;
    let picked = 0;

    for (const entry of usable) {
      if (picked >= POSITIVES_PER_TYPE) break;
      if (used.has(entry.item.meta.qaId)) continue;

      const injected = injector.apply(entry.sentences);
      if (!injected) continue;

      used.add(entry.item.meta.qaId);
      picked += 1;

      const facts = referenceFor(entry.item.canonicalAnswer);
      const source = entry.sentences.join('\n');
      const topic = entry.item.topic.consulting;

      const push = (sentences: string[], positive: boolean, suffix: string) => {
        const detected = detectDraftWithFacts(sentences, facts);
        items.push({
          id: `${entry.item.meta.qaId}-${type}-${suffix}`,
          errorType: type,
          positive,
          topic,
          sentences,
          r: detected.r,
          confirmedHits: detected.confirmedHits,
          editDistance: levenshtein(source, sentences.join('\n')),
          receivedAt: '',
        });
      };

      // 양성 1건 + 같은 정본에서 나온 무해 변주 4건.
      // 짝을 맞춰야 "답변마다 원래 위험도가 다르다"는 교란이 끼지 않는다.
      push(vary(injected, rand), true, 'pos');
      for (let n = 0; n < NEGATIVES_PER_SOURCE; n += 1) {
        push(vary(entry.sentences, rand), false, `neg${n}`);
      }
    }

    if (picked < POSITIVES_PER_TYPE) shortage.push(`${type} ${picked}/${POSITIVES_PER_TYPE}`);
  }

  const positives = items.filter((item) => item.positive).length;

  // 접수 시각은 내용과 무관해야 한다. 시드 셔플 순서를 그대로 도착 순서로 쓴다.
  const tieRand = mulberry32(SEED + 1);
  const tieKey = items.map(() => tieRand());
  const arrival = items.map((_, i) => i).sort((a, b) => tieKey[a] - tieKey[b]);
  arrival.forEach((itemIndex, position) => {
    items[itemIndex].receivedAt = new Date(ARRIVAL_BASE_MS + position * 60_000).toISOString();
  });

  const rOrder = items.map((_, i) => i).sort((a, b) => compareRank(items[a], items[b]));
  const pureROrder = items
    .map((_, i) => i)
    .sort((a, b) => compareRank({ ...items[a], confirmedHits: 0 }, { ...items[b], confirmedHits: 0 }));
  const editOrder = items
    .map((_, i) => i)
    .sort((a, b) => items[b].editDistance - items[a].editDistance || tieKey[a] - tieKey[b]);

  const rMetrics = evaluate(items, rOrder, positives);
  const pureRMetrics = evaluate(items, pureROrder, positives);
  const editMetrics = evaluate(items, editOrder, positives);

  const randomRand = mulberry32(SEED + 2);
  let randomHits = 0;
  for (let trial = 0; trial < RANDOM_TRIALS; trial += 1) {
    const order = shuffled(items.length, randomRand);
    randomHits += order.slice(0, K).filter((index) => items[index].positive).length;
  }
  randomHits /= RANDOM_TRIALS;

  const hitsByType = (order: number[]) => {
    const top = new Set(order.slice(0, K));
    const counts: Record<string, number> = {};
    for (const type of ERROR_TYPES) counts[ERROR_TYPE_KEY[type]] = 0;
    items.forEach((item, index) => {
      if (item.positive && top.has(index)) counts[ERROR_TYPE_KEY[item.errorType]] += 1;
    });
    return counts;
  };

  const confirmedPositives = items.filter((item) => item.positive && item.confirmedHits > 0).length;
  const confirmedNegatives = items.filter((item) => !item.positive && item.confirmedHits > 0).length;
  const maxRecall = Math.min(K, positives) / positives;

  // ── 출력 ──────────────────────────────────────────────────────────────────
  console.log('답변등기 — 실상담 기반 정량 평가 (AI Hub 은행)');
  console.log('원본 재배포 금지 · repo 에는 파생 수치만 남는다\n');
  console.log(`설계   원본 파일 표본 ${SAMPLE_FILES.toLocaleString()}건 → 사용 가능 답변 ${usable.length.toLocaleString()}건`);
  console.log(`       평가셋 ${items.length}건 (양성 ${positives} · 음성 ${items.length - positives}) · K = ${K} · seed ${SEED}`);
  console.log(`       정본 = qa_data[].output · 오류 유형 ${ERROR_TYPES.length}종 × ${POSITIVES_PER_TYPE}건`);
  if (shortage.length > 0) console.log(`       주입기 미달: ${shortage.join(' · ')}`);
  console.log();

  console.log('| 방법 | Recall@39 | Precision@39 | 적중 |');
  console.log('| --- | ---: | ---: | ---: |');
  console.log(`| R 랭킹 (v2 + 확증) | ${pct(rMetrics.recall)} | ${pct(rMetrics.precision)} | ${rMetrics.hits}/${positives} |`);
  console.log(`| R 랭킹 (순수 R) | ${pct(pureRMetrics.recall)} | ${pct(pureRMetrics.precision)} | ${pureRMetrics.hits}/${positives} |`);
  console.log(`| 편집거리 baseline | ${pct(editMetrics.recall)} | ${pct(editMetrics.precision)} | ${editMetrics.hits}/${positives} |`);
  console.log(
    `| 무작위 (${RANDOM_TRIALS}회 평균) | ${pct(randomHits / positives)} | ${pct(randomHits / K)} | ${randomHits.toFixed(2)}/${positives} |`,
  );

  console.log(`\n| 오류 유형 | v2 + 확증 | 순수 R | 편집거리 |`);
  console.log('| --- | ---: | ---: | ---: |');
  const rByType = hitsByType(rOrder);
  const pureByType = hitsByType(pureROrder);
  const editByType = hitsByType(editOrder);
  for (const type of ERROR_TYPES) {
    const key = ERROR_TYPE_KEY[type];
    console.log(`| ${ERROR_TYPE_LABEL[type]} | ${rByType[key]} | ${pureByType[key]} | ${editByType[key]} |`);
  }

  console.log(
    `\n확증이 붙은 건: 양성 ${confirmedPositives}/${positives} · 음성 ${confirmedNegatives}/${items.length - positives}`,
  );
  console.log(
    `주의   레퍼런스가 그 건의 모범답변 자체다. 오류 주입기와 감지기가 같은 문서를 참조하므로 이 수치는 성능이 아니라 상한이다.`,
  );
  console.log(
    `       Recall@${K} 의 천장은 ${pct(maxRecall)}(=${Math.min(K, positives)}/${positives}) 이고, 실제 초안은 정본이 예상하지 못한 방식으로도 틀린다.`,
  );

  const output = {
    dataset: {
      name: 'AI Hub 금융분야 고객상담 데이터 (dataSetSn=71926)',
      domain: '은행',
      institution: [...new Set(cases.map((item) => item.meta.institution))],
      canonical_field: 'qa_data[].output',
      total_files_available: listAihubFiles().length,
      sampled_files: SAMPLE_FILES,
      usable_answers: usable.length,
      seed: SEED,
      redistribution: '원본 재배포 금지 — repo 에는 파생 수치만 포함',
    },
    design: {
      total: items.length,
      positives,
      negatives: items.length - positives,
      positives_per_type: POSITIVES_PER_TYPE,
      negatives_per_source: NEGATIVES_PER_SOURCE,
      k: K,
      random_trials: RANDOM_TRIALS,
      detector: 'v2',
      ranking: 'R+confirmedHits',
      max_recall_at_k: round(maxRecall),
      injector_shortage: shortage,
    },
    reference: {
      kind: 'per-case canonical answer',
      numbers: '모범답변의 수치 토큰(앞 문맥 포함)을 슬롯으로',
      required: '모범답변이 담고 있던 신호 유형이 초안에서 사라지면 누락으로',
      conditions: '비움 — 조건절 claim/qualifier 짝은 상품 지식이 필요해 일반화하지 않음',
      caveat:
        '오류 주입기와 감지기가 같은 문서(모범답변)를 레퍼런스로 공유한다. 따라서 이 수치는 성능이 아니라 상한으로 읽어야 한다. 합성 평가(docs/eval-results.json)와 같은 한계다.',
    },
    runs: [
      {
        detector: 'v2',
        ranking: 'R+confirmedHits',
        recall_at_39: round(rMetrics.recall),
        precision_at_39: round(rMetrics.precision),
        hits: rMetrics.hits,
        by_error_type: rByType,
      },
      {
        detector: 'v2',
        ranking: 'R',
        recall_at_39: round(pureRMetrics.recall),
        precision_at_39: round(pureRMetrics.precision),
        hits: pureRMetrics.hits,
        by_error_type: pureByType,
      },
      {
        detector: '—',
        ranking: 'edit_distance',
        recall_at_39: round(editMetrics.recall),
        precision_at_39: round(editMetrics.precision),
        hits: editMetrics.hits,
        by_error_type: editByType,
      },
      {
        detector: '—',
        ranking: `random (${RANDOM_TRIALS}회 평균)`,
        recall_at_39: round(randomHits / positives),
        precision_at_39: round(randomHits / K),
        hits: round(randomHits, 2),
      },
    ],
    confirmed_hits: {
      positives_with_confirmation: confirmedPositives,
      negatives_with_confirmation: confirmedNegatives,
    },
  };

  const outputPath = path.resolve('docs/eval-results-aihub.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`\n→ ${path.relative(process.cwd(), outputPath)}`);
}

function vary(sentences: string[], rand: () => number): string[] {
  let next = [...sentences];
  let applied = 0;
  for (const variation of VARIATIONS) {
    if (rand() >= variation.rate) continue;
    next = variation.apply(next, rand);
    applied += 1;
  }
  if (applied === 0) next = VARIATIONS[0].apply(next, rand);
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('eval-aihub.ts')) {
  runAihubEval();
}
