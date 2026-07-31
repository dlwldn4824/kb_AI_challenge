/**
 * R 랭킹 정량 평가 — 합성 벤치마크 240건 (제출 덱 "정량 1장" 원자료).
 *
 *   npm run eval
 *
 * 감지기는 src/lib/scoring.ts 를 그대로 import 한다. 규칙을 여기서 다시 쓰지 않으므로
 * 이 스크립트가 재는 것은 화면에서 돌아가는 것과 같은 감지기다.
 *
 * 설계: 정상(정답) 답변 템플릿 4종 × 오류 유형 6종 × 변주 10건 = 240건.
 * 셀마다 오류 주입 2건(양성) + 무해 변주 8건(음성) → 양성 48 / 음성 192.
 * 240건 전부가 무해 변주(인사말·어순·조사 등)를 함께 맞으므로, 양성이 표면적으로
 * 티가 나서 잡히는 일이 없다.
 *
 * K=39 는 덱 KPI "검토 대기 39건" — 상담원이 하루에 실제로 열어보는 분량이다.
 *
 * 모든 난수는 시드 고정 mulberry32 에서 나온다. 두 번 돌리면 같은 결과가 나온다.
 */

import fs from 'node:fs';
import path from 'node:path';

import { compareRank } from '../src/lib/ranking';
import { detectDraft, TIER_SCORE } from '../src/lib/scoring';
import type { SignalType, Tier } from '../src/lib/scoring';

const SEED = 20260723;
const K = 39;
const RANDOM_TRIALS = 1000;
const VARIANTS_PER_CELL = 10;
/** 합성 접수 시각의 기준점. 내용과 무관한 도착 순서를 만들기 위한 고정값이다. */
const ARRIVAL_BASE_MS = Date.parse('2026-07-23T00:00:00.000Z');
const POSITIVES_PER_CELL = 2;

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
  procedure_document: '서류 기한 왜곡',
};

// ─────────────────────────────────────────────────────────────────────────────
// 시드 고정 PRNG · 편집거리
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

/** 두 문자열의 Levenshtein 거리. 두 행만 들고 도는 표준 DP. */
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
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    [previous, current] = [current, previous];
  }
  return previous[right.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// 오류 주입기 — 템플릿 문장을 손대는 최소 도구
// ─────────────────────────────────────────────────────────────────────────────

/** 지정 문장의 구절을 바꾼다. 대상 구절이 없으면 즉시 실패한다(템플릿 오타 방지). */
function rewrite(sentences: string[], idx: number, from: string, to: string): string[] {
  const target = sentences[idx];
  if (target === undefined || !target.includes(from)) {
    throw new Error(`오류 주입 실패: ${idx}번 문장에서 "${from}" 를 찾지 못했습니다.`);
  }
  const next = [...sentences];
  next[idx] = target.split(from).join(to);
  return next;
}

/** 문장 하나를 통째로 뺀다 (요건·불이익 누락). */
function drop(sentences: string[], idx: number): string[] {
  if (sentences[idx] === undefined) throw new Error(`오류 주입 실패: ${idx}번 문장이 없습니다.`);
  return sentences.filter((_, i) => i !== idx);
}

/** 과장 단정을 맺음말로 덧붙인다. */
function append(sentences: string[], text: string): string[] {
  return [...sentences, text];
}

// ─────────────────────────────────────────────────────────────────────────────
// 템플릿 4종 — 문장 1개당 신호 유형 1개씩(감지기는 문장당 규칙 하나만 귀속시킨다)
// ─────────────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  title: string;
  /**
   * 감지기에 넘기는 상품명. 팩트 테이블 조회 키다.
   * 감지기가 받는 입력은 이 상품명과 문장뿐 — 어느 건이 오류인지는 넘기지 않는다.
   */
  product: string;
  sentences: string[];
  inject: Record<SignalType, (sentences: string[]) => string[]>;
}

const TEMPLATES: Template[] = [
  {
    id: 'T1',
    title: '적금 한도 변경 안내',
    product: 'KB장병내일준비적금',
    // 스펙 §5 정본 케이스 문장 그대로.
    sentences: [
      '한 은행의 월 저축한도는 최고 30만원이며, 매월 30만원 이하 금액을 만기일 전일까지 저축 가능합니다.',
      '위 계좌는 1회에 한하여 비과세저축 한도 변경이 가능합니다.',
      '25년 1월 1일 전에 가입한 계좌만 변경이 가능합니다.',
      '조기전역 · 신분전환 · 금융소득종합과세 대상의 경우 비대면 해지가 불가합니다.',
      '해지 시 제출 서류는 3개월 이내 발급분이어야 합니다.',
    ],
    inject: {
      numeric_change: (s) => rewrite(s, 0, '30만원', '50만원'),
      exemption_condition: (s) => rewrite(s, 1, '1회에 한하여 ', ''),
      overcertainty: (s) => append(s, '신청하신 한도 변경은 접수 즉시 무조건 처리됩니다.'),
      deadline_eligibility: (s) => drop(s, 2),
      disadvantage_omission: (s) => drop(s, 3),
      procedure_document: (s) => rewrite(s, 4, '3개월 이내 발급분이어야 합니다', '발급일과 관계없이 인정됩니다'),
    },
  },
  {
    id: 'T2',
    title: '대출 중도상환수수료 안내',
    product: 'KB주택담보대출',
    sentences: [
      '중도상환수수료는 상환 원금의 1.4%가 부과되며, 대출 실행일부터 3년 이내 상환하시는 경우에 적용됩니다.',
      '대출 실행일부터 3년이 지난 뒤 상환하시는 경우에는 수수료가 면제됩니다.',
      '중도상환 신청 자격은 대출 종류와 약정 내용에 따라 다르게 적용됩니다.',
      '약정 기간 내 중도 해지 시에는 우대금리 적용분이 회수될 수 있습니다.',
      '상환 예정일 전에 증빙 서류를 제출해 주셔야 합니다.',
    ],
    inject: {
      numeric_change: (s) => rewrite(s, 0, '1.4%', '0.5%'),
      exemption_condition: (s) => rewrite(s, 1, '대출 실행일부터 3년이 지난 뒤 상환하시는', '상환하시는'),
      overcertainty: (s) => append(s, '수수료는 신청만 하시면 무조건 면제됩니다.'),
      deadline_eligibility: (s) => drop(s, 2),
      disadvantage_omission: (s) => drop(s, 3),
      procedure_document: (s) => rewrite(s, 4, '상환 예정일 전에 증빙 서류를 제출해 주셔야 합니다', '증빙 서류는 상환일 이후에 제출하셔도 무방합니다'),
    },
  },
  {
    id: 'T3',
    title: '예금 만기 해지 안내',
    product: 'KB더블모아예금',
    sentences: [
      '만기일 이후에는 약정이율이 아닌 만기 후 이율이 적용되며, 만기 후 이율은 기본이율의 50%입니다.',
      '만기 전에 찾으시면 중도해지이율이 적용되어 이자가 크게 줄어듭니다.',
      '이자소득세는 비과세종합저축으로 가입하신 경우에 한하여 면제됩니다.',
      '만기 해지 시 제출하시는 실명확인 증표는 3개월 이내 발급분이어야 합니다.',
      '우대이율 적용 대상은 급여이체 실적 요건을 충족한 계좌입니다.',
    ],
    inject: {
      numeric_change: (s) => rewrite(s, 0, '기본이율의 50%', '기본이율의 80%'),
      exemption_condition: (s) => rewrite(s, 2, '비과세종합저축으로 가입하신 경우에 한하여 ', ''),
      overcertainty: (s) => append(s, '만기 후에는 별도 신청 없이 반드시 자동 재예치됩니다.'),
      deadline_eligibility: (s) => drop(s, 4),
      disadvantage_omission: (s) => drop(s, 1),
      procedure_document: (s) => rewrite(s, 3, '3개월 이내 발급분이어야 합니다', '발급일과 관계없이 인정됩니다'),
    },
  },
  {
    id: 'T4',
    title: '카드 연회비 안내',
    product: 'KB국민카드 프리미엄',
    sentences: [
      '연회비는 카드 발급일이 속한 달의 결제일에 15,000원이 청구됩니다.',
      '직전 1년간 이용실적이 300만원 이상이면 다음 해 연회비가 면제됩니다.',
      '실적 산정 대상 기간은 매년 카드 발급월을 기준으로 합니다.',
      '연회비 청구 후 카드를 해지하셔도 이미 청구된 연회비는 환급되지 않습니다.',
      '청구 내역 확인이 필요하시면 별도 신청서를 제출해 주시기 바랍니다.',
    ],
    inject: {
      numeric_change: (s) => rewrite(s, 0, '15,000원', '9,000원'),
      exemption_condition: (s) => rewrite(s, 1, '직전 1년간 이용실적이 300만원 이상이면', '이용실적이 있으시면'),
      overcertainty: (s) => append(s, '실적만 채우시면 연회비는 무조건 면제됩니다.'),
      deadline_eligibility: (s) => drop(s, 2),
      disadvantage_omission: (s) => drop(s, 3),
      procedure_document: (s) => rewrite(s, 4, '별도 신청서를 제출해 주시기 바랍니다', '신청서는 청구일부터 5년 이내 아무 때나 제출하시면 됩니다'),
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 무해 변주 — 뜻은 그대로 두고 표면만 바꾸는 패러프레이즈
//
// `확인 요청 맺음말` 은 실무에서 흔한 상투구지만 "반드시" 때문에 overcertainty 규칙이
// 발화한다. 감지기의 실제 오탐 경로이므로 빼지 않고 남겨 두고, 발생률(0.10)을
// 설계 파라미터로 명시해 결과 JSON 에 그대로 싣는다.
// ─────────────────────────────────────────────────────────────────────────────

interface Variation {
  id: string;
  label: string;
  rate: number;
  apply: (sentences: string[], rand: () => number) => string[];
}

function swapAll(sentences: string[], from: string, to: string): string[] {
  return sentences.map((sentence) => sentence.split(from).join(to));
}

const VARIATIONS: Variation[] = [
  {
    id: 'greeting',
    label: '인사말 추가',
    rate: 0.35,
    apply: (s) => ['안녕하세요, 고객님. 문의해 주셔서 감사합니다.', ...s],
  },
  {
    id: 'closing',
    label: '맺음말 추가',
    rate: 0.35,
    apply: (s) => [...s, '추가로 궁금하신 점이 있으시면 언제든 문의해 주시기 바랍니다.'],
  },
  {
    id: 'branch_note',
    label: '영업점 안내 추가',
    rate: 0.2,
    apply: (s) => [...s, '자세한 내용은 가까운 영업점에서도 안내받으실 수 있습니다.'],
  },
  {
    id: 'connective',
    label: '접속 부사 삽입',
    rate: 0.25,
    apply: (s, rand) => {
      if (s.length < 2) return s;
      const idx = 1 + Math.floor(rand() * (s.length - 1));
      const next = [...s];
      next[idx] = `또한 ${next[idx]}`;
      return next;
    },
  },
  {
    id: 'ending_a',
    label: '어미 변형 (해 주셔야 합니다 → 해 주시기 바랍니다)',
    rate: 0.3,
    apply: (s) => swapAll(s, '해 주셔야 합니다', '해 주시기 바랍니다'),
  },
  {
    id: 'ending_b',
    label: '어미 변형 (하실 수 있습니다 → 가능하십니다)',
    rate: 0.3,
    apply: (s) => swapAll(s, '하실 수 있습니다', '가능하십니다'),
  },
  {
    id: 'reorder',
    label: '문장 순서 교환',
    rate: 0.25,
    apply: (s, rand) => {
      if (s.length < 2) return s;
      const i = Math.floor(rand() * (s.length - 1));
      const next = [...s];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    },
  },
  {
    id: 'punctuation',
    label: '구두점 정규화',
    rate: 0.3,
    apply: (s) => swapAll(s, ' · ', '·'),
  },
  {
    id: 'confirm_note',
    label: '확인 요청 맺음말 (상투구 · overcertainty 오탐 경로)',
    rate: 0.1,
    apply: (s) => [...s, '변경 후에는 반드시 내용을 확인해 주시기 바랍니다.'],
  },
];

const CONFIRM_NOTE_RATE = VARIATIONS.find((v) => v.id === 'confirm_note')!.rate;

// ─────────────────────────────────────────────────────────────────────────────
// 벤치마크 생성
// ─────────────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  templateId: string;
  errorType: SignalType;
  variantIdx: number;
  positive: boolean;
  variations: string[];
  sentences: string[];
  r: number;
  /** 오류도 변주도 없는 정답 템플릿의 R. 기준선 대비 오르내림을 보기 위한 값. */
  baseR: number;
  /** 보강 경로가 발화했는가 — 팩트 대조 / 누락. */
  factMismatch: boolean;
  omission: boolean;
  /** 레퍼런스 확증 건수. 정렬 2차 키(ranking.ts)가 쓴다. */
  confirmedHits: number;
  /** 합성 접수 시각. 시드 셔플 순서를 그대로 도착 순서로 쓴다(내용과 무관). */
  receivedAt: string;
  types: SignalType[];
  tiers: Tier[];
  editDistance: number;
}

function buildCorpus(): Item[] {
  const rand = mulberry32(SEED);
  const items: Item[] = [];

  for (const template of TEMPLATES) {
    const source = template.sentences.join('\n');
    const baseR = detectDraft(template.sentences, template.product).r;

    for (const errorType of ERROR_TYPES) {
      // 셀 안에서 어느 변주가 오류를 맞을지 시드로 뽑는다.
      const positiveSlots = new Set(
        shuffled(VARIANTS_PER_CELL, rand).slice(0, POSITIVES_PER_CELL),
      );

      for (let variantIdx = 0; variantIdx < VARIANTS_PER_CELL; variantIdx += 1) {
        const positive = positiveSlots.has(variantIdx);
        let sentences = positive ? template.inject[errorType](template.sentences) : [...template.sentences];

        // 양성·음성 가릴 것 없이 표면 변주를 입힌다.
        const applied: string[] = [];
        for (const variation of VARIATIONS) {
          if (rand() >= variation.rate) continue;
          sentences = variation.apply(sentences, rand);
          applied.push(variation.id);
        }
        if (applied.length === 0) {
          sentences = VARIATIONS[0].apply(sentences, rand);
          applied.push(VARIATIONS[0].id);
        }

        // 감지기 입력은 상품명과 문장뿐이다. 어느 건이 양성인지는 넘기지 않는다.
        const detected = detectDraft(sentences, template.product);
        const types = [
          ...new Set([
            ...detected.signals.map((signal) => signal.type),
            ...detected.derived.map((signal) => signal.type),
          ]),
        ];

        items.push({
          id: `${template.id}-${errorType}-${String(variantIdx).padStart(2, '0')}`,
          templateId: template.id,
          errorType,
          variantIdx,
          positive,
          variations: applied,
          sentences,
          r: detected.r,
          baseR,
          types,
          factMismatch: detected.derived.some((signal) => signal.origin === 'fact_mismatch'),
          omission: detected.derived.some((signal) => signal.origin === 'omission'),
          confirmedHits: detected.confirmedHits,
          receivedAt: '',
          tiers: types.map(
            (type) =>
              (detected.signals.find((s) => s.type === type) ??
                detected.derived.find((s) => s.type === type))!.tier,
          ),
          editDistance: levenshtein(source, sentences.join('\n')),
        });
      }
    }
  }

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// 랭킹 · 지표
// ─────────────────────────────────────────────────────────────────────────────

interface Metrics {
  hits: number;
  recall: number;
  precision: number;
  tierCounts: Record<Tier, number>;
  meanR: number;
}

function rank(items: Item[], score: (item: Item) => number, tieKey: number[]): number[] {
  return items
    .map((_, index) => index)
    .sort((a, b) => {
      const diff = score(items[b]) - score(items[a]);
      if (diff !== 0) return diff;
      return tieKey[a] - tieKey[b];
    });
}

function evaluate(items: Item[], order: number[]): Metrics {
  const top = order.slice(0, K).map((index) => items[index]);
  const hits = top.filter((item) => item.positive).length;
  const tierCounts: Record<Tier, number> = { S: 0, A: 0, B: 0 };
  let totalR = 0;

  for (const item of top) {
    totalR += item.r;
    for (const tier of item.tiers) tierCounts[tier] += 1;
  }

  return {
    hits,
    recall: hits / items.filter((item) => item.positive).length,
    precision: hits / K,
    tierCounts,
    meanR: totalR / K,
  };
}

function evaluateRandom(items: Item[]): Metrics & { trials: number } {
  const rand = mulberry32(SEED + 2);
  const positives = items.filter((item) => item.positive).length;
  let hitSum = 0;
  const tierSum: Record<Tier, number> = { S: 0, A: 0, B: 0 };
  let rSum = 0;

  for (let trial = 0; trial < RANDOM_TRIALS; trial += 1) {
    const order = shuffled(items.length, rand);
    for (let i = 0; i < K; i += 1) {
      const item = items[order[i]];
      if (item.positive) hitSum += 1;
      rSum += item.r;
      for (const tier of item.tiers) tierSum[tier] += 1;
    }
  }

  const hits = hitSum / RANDOM_TRIALS;
  return {
    trials: RANDOM_TRIALS,
    hits,
    recall: hits / positives,
    precision: hits / K,
    tierCounts: {
      S: tierSum.S / RANDOM_TRIALS,
      A: tierSum.A / RANDOM_TRIALS,
      B: tierSum.B / RANDOM_TRIALS,
    },
    meanR: rSum / RANDOM_TRIALS / K,
  };
}

/** 오류 유형별로 상위 K 안에 몇 건이 들어왔는지 (유형당 양성 8건). */
function hitsByErrorType(items: Item[], order: number[]): Record<string, number> {
  const found = new Set(order.slice(0, K));
  const counts: Record<string, number> = {};
  for (const type of ERROR_TYPES) counts[type] = 0;
  items.forEach((item, index) => {
    if (item.positive && found.has(index)) counts[item.errorType] += 1;
  });
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// 콘솔 표
// ─────────────────────────────────────────────────────────────────────────────

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

function width(text: string): number {
  let total = 0;
  for (const ch of text) total += WIDE.test(ch) ? 2 : 1;
  return total;
}

function pad(text: string, size: number, align: 'left' | 'right' = 'left'): string {
  const fill = ' '.repeat(Math.max(0, size - width(text)));
  return align === 'left' ? text + fill : fill + text;
}

function table(headers: string[], rows: string[][], aligns: Array<'left' | 'right'>): void {
  const sizes = headers.map((header, col) =>
    Math.max(width(header), ...rows.map((row) => width(row[col] ?? ''))),
  );
  const line = (char: string) => sizes.map((size) => char.repeat(size)).join('─┼─');

  console.log(headers.map((header, col) => pad(header, sizes[col], aligns[col])).join(' │ '));
  console.log(`─${line('─')}─`.slice(1));
  for (const row of rows) {
    console.log(row.map((cell, col) => pad(cell, sizes[col], aligns[col])).join(' │ '));
  }
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const items = buildCorpus();
  const positives = items.filter((item) => item.positive).length;
  const tieKey = (() => {
    const rand = mulberry32(SEED + 1);
    return items.map(() => rand());
  })();

  // 접수 시각은 초안 내용과 무관해야 한다. 시드 셔플 순서를 그대로 도착 순서로 쓴다.
  // 덕분에 동점 구간의 순서는 예전과 똑같이 "시드 고정 셔플"로 결정된다.
  const arrival = items.map((_, index) => index).sort((a, b) => tieKey[a] - tieKey[b]);
  arrival.forEach((itemIndex, position) => {
    items[itemIndex].receivedAt = new Date(ARRIVAL_BASE_MS + position * 60_000).toISOString();
  });

  // 제품 코드의 정렬 키를 그대로 가져다 쓴다. 평가 전용 비교기는 만들지 않는다.
  const rOrder = items
    .map((_, index) => index)
    .sort((a, b) => compareRank(items[a], items[b]));

  // 비교용: confirmedHits 를 무시한 예전 방식(순수 R 내림차순).
  const pureROrder = items
    .map((_, index) => index)
    .sort((a, b) =>
      compareRank(
        { ...items[a], confirmedHits: 0 },
        { ...items[b], confirmedHits: 0 },
      ),
    );

  const editOrder = rank(items, (item) => item.editDistance, tieKey);

  const rMetrics = evaluate(items, rOrder);
  const pureRMetrics = evaluate(items, pureROrder);
  const editMetrics = evaluate(items, editOrder);
  const randomMetrics = evaluateRandom(items);

  const rByType = hitsByErrorType(items, rOrder);
  const pureRByType = hitsByErrorType(items, pureROrder);
  const editByType = hitsByErrorType(items, editOrder);

  const negatives = items.filter((item) => !item.positive);
  const falsePositiveOvercertainty = negatives.filter((item) =>
    item.types.includes('overcertainty'),
  ).length;

  console.log('답변등기 — R 랭킹 정량 평가');
  console.log('SYNTHETIC DEMO · 합성 벤치마크\n');
  console.log(
    `설계   템플릿 ${TEMPLATES.length} × 오류 유형 ${ERROR_TYPES.length} × 변주 ${VARIANTS_PER_CELL} = ${items.length}건`,
  );
  console.log(
    `       양성 ${positives}건 (셀당 ${POSITIVES_PER_CELL}) · 음성 ${items.length - positives}건 · K = ${K} · seed ${SEED}`,
  );
  console.log(`       감지기 src/lib/scoring.ts (티어 S=${TIER_SCORE.S} A=${TIER_SCORE.A} B=${TIER_SCORE.B})\n`);

  table(
    ['방법', `Recall@${K}`, `Precision@${K}`, '적중', 'S', 'A', 'B', '평균 R'],
    [
      [
        'R 랭킹 (R + 확증)',
        pct(rMetrics.recall),
        pct(rMetrics.precision),
        `${rMetrics.hits}/${positives}`,
        String(rMetrics.tierCounts.S),
        String(rMetrics.tierCounts.A),
        String(rMetrics.tierCounts.B),
        rMetrics.meanR.toFixed(2),
      ],
      [
        'R 랭킹 (순수 R · 이전)',
        pct(pureRMetrics.recall),
        pct(pureRMetrics.precision),
        `${pureRMetrics.hits}/${positives}`,
        String(pureRMetrics.tierCounts.S),
        String(pureRMetrics.tierCounts.A),
        String(pureRMetrics.tierCounts.B),
        pureRMetrics.meanR.toFixed(2),
      ],
      [
        '편집거리 baseline',
        pct(editMetrics.recall),
        pct(editMetrics.precision),
        `${editMetrics.hits}/${positives}`,
        String(editMetrics.tierCounts.S),
        String(editMetrics.tierCounts.A),
        String(editMetrics.tierCounts.B),
        editMetrics.meanR.toFixed(2),
      ],
      [
        `무작위 (${RANDOM_TRIALS}회 평균)`,
        pct(randomMetrics.recall),
        pct(randomMetrics.precision),
        `${randomMetrics.hits.toFixed(2)}/${positives}`,
        randomMetrics.tierCounts.S.toFixed(1),
        randomMetrics.tierCounts.A.toFixed(1),
        randomMetrics.tierCounts.B.toFixed(1),
        randomMetrics.meanR.toFixed(2),
      ],
    ],
    ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
  );

  console.log(`\n오류 유형별 상위 ${K} 적중 (유형당 양성 ${positives / ERROR_TYPES.length}건)`);
  table(
    ['오류 유형', 'R + 확증', '순수 R', '편집거리'],
    ERROR_TYPES.map((type) => [
      `${ERROR_TYPE_LABEL[type]} (${type})`,
      String(rByType[type]),
      String(pureRByType[type]),
      String(editByType[type]),
    ]),
    ['left', 'right', 'right', 'right'],
  );

  console.log('\n보강 경로가 양성을 문 비율 (랭킹 반영과 무관하게 감지 자체)');
  table(
    ['오류 유형', '팩트 대조', '누락'],
    ERROR_TYPES.map((type) => {
      const cell = items.filter((item) => item.positive && item.errorType === type);
      return [
        `${ERROR_TYPE_LABEL[type]} (${type})`,
        `${cell.filter((item) => item.factMismatch).length}/${cell.length}`,
        `${cell.filter((item) => item.omission).length}/${cell.length}`,
      ];
    }),
    ['left', 'right', 'right'],
  );

  const theoretical = (K / items.length) * positives;
  console.log(
    `\n무작위 이론값 ${theoretical.toFixed(2)}건 · 실측 ${randomMetrics.hits.toFixed(2)}건 (${RANDOM_TRIALS}회 평균)`,
  );
  console.log(
    `무해 변주 ${items.length - positives}건 중 overcertainty 오탐 ${falsePositiveOvercertainty}건 ` +
      `(상투구 "반드시 확인해 주시기 바랍니다" 발생률 ${CONFIRM_NOTE_RATE})`,
  );

  // 정답 템플릿의 R 을 기준선으로 두고, 그 아래로 떨어진 초안을 따로 센다.
  // 삭제형 오류는 위험 구절을 지우므로 R 이 내려간다 — 내림차순 랭킹의 사각지대다.
  const belowBaseline = items.filter((item) => item.r < item.baseR);
  const belowBaselinePositives = belowBaseline.filter((item) => item.positive).length;

  const perType = ERROR_TYPES.map((type) => ({ type, hits: rByType[type] }));
  const best = perType.reduce((a, b) => (b.hits > a.hits ? b : a));
  const worst = perType.reduce((a, b) => (b.hits < a.hits ? b : a));
  const perTypePositives = positives / ERROR_TYPES.length;

  const scoreboard = [
    { name: 'R 랭킹', recall: rMetrics.recall },
    { name: '편집거리 baseline', recall: editMetrics.recall },
    { name: '무작위', recall: randomMetrics.recall },
  ]
    .sort((a, b) => b.recall - a.recall)
    .map((entry) => `${entry.name} ${pct(entry.recall)}`)
    .join(' · ');

  const factCaught = items.filter((item) => item.positive && item.factMismatch).length;
  const omissionCaught = items.filter((item) => item.positive && item.omission).length;

  const confirmedPositives = items.filter((item) => item.positive && item.confirmedHits > 0).length;
  const confirmedNegatives = negatives.filter((item) => item.confirmedHits > 0).length;
  const maxRecall = Math.min(K, positives) / positives;

  console.log(`\n해석   상위 ${K}건 Recall — ${scoreboard}`);
  console.log(
    `       확증 신호를 2차 키로 쓰자 ${pct(pureRMetrics.recall)} → ${pct(rMetrics.recall)} 로 올랐다. ` +
      `R 값과 표시는 그대로고 동점 안의 순서만 바뀐 결과다 ` +
      `(팩트 대조 ${factCaught}건 · 누락 ${omissionCaught}건, 합쳐 양성 ${confirmedPositives}/${positives}건에 확증이 붙었다).`,
  );
  console.log(
    `       다만 확증이 붙은 음성은 ${confirmedNegatives}/${items.length - positives}건뿐이라 상위 ${K}칸이 전부 양성으로 채워졌다. ` +
      `Precision@${K} ${pct(rMetrics.precision)} 와 Recall@${K} 은 K=${K} 가 만드는 천장(${pct(maxRecall)}) 에 붙어 있어, ` +
      `이 벤치마크로는 여기서 더 구분되지 않는다.`,
  );
  console.log(
    `       팩트 테이블과 오류 주입기를 같은 템플릿 4종 위에서 함께 설계했으므로 이 수치는 상한으로 읽어야 한다 — ` +
      `실제 초안은 팩트 테이블이 예상하지 못한 방식으로도 틀린다.`,
  );

  const output = {
    design: {
      templates: TEMPLATES.map((template) => ({ id: template.id, title: template.title })),
      errorTypes: ERROR_TYPES.map((type) => ({ type, label: ERROR_TYPE_LABEL[type] })),
      variantsPerCell: VARIANTS_PER_CELL,
      positivesPerCell: POSITIVES_PER_CELL,
      total: items.length,
      positives,
      negatives: items.length - positives,
      k: K,
      seed: SEED,
      randomTrials: RANDOM_TRIALS,
      /** K 가 양성보다 작아서 생기는 Recall@K 의 천장. */
      maxRecallAtK: round(Math.min(K, 48) / 48),
      detector: 'v2',
      ranking: 'R+confirmedHits',
      rankKey:
        '(R desc, confirmedHits desc, receivedAt asc) — src/lib/ranking.ts 의 compareRank 를 큐와 공유',
      detectorNote:
        'src/lib/scoring.ts — 패턴 규칙 + 정본 팩트 대조 + 필수 조항 누락(부재 감지). 전부 규칙 기반.',
      tierScore: TIER_SCORE,
      confirmNoteRate: CONFIRM_NOTE_RATE,
    },
    methods: [
      {
        key: 'r_ranking',
        label: 'R 랭킹 (R + 확증)',
        recallAtK: round(rMetrics.recall),
        precisionAtK: round(rMetrics.precision),
        hits: rMetrics.hits,
        meanR: round(rMetrics.meanR),
        tierCounts: rMetrics.tierCounts,
        hitsByErrorType: rByType,
      },
      {
        key: 'r_ranking_pure',
        label: 'R 랭킹 (순수 R · 이전 방식, 비교용)',
        recallAtK: round(pureRMetrics.recall),
        precisionAtK: round(pureRMetrics.precision),
        hits: pureRMetrics.hits,
        meanR: round(pureRMetrics.meanR),
        tierCounts: pureRMetrics.tierCounts,
        hitsByErrorType: pureRByType,
      },
      {
        key: 'edit_distance',
        label: '편집거리 baseline',
        recallAtK: round(editMetrics.recall),
        precisionAtK: round(editMetrics.precision),
        hits: editMetrics.hits,
        meanR: round(editMetrics.meanR),
        tierCounts: editMetrics.tierCounts,
        hitsByErrorType: editByType,
      },
      {
        key: 'random',
        label: `무작위 (${RANDOM_TRIALS}회 평균)`,
        recallAtK: round(randomMetrics.recall),
        precisionAtK: round(randomMetrics.precision),
        hits: round(randomMetrics.hits, 2),
        meanR: round(randomMetrics.meanR),
        tierCounts: {
          S: round(randomMetrics.tierCounts.S, 2),
          A: round(randomMetrics.tierCounts.A, 2),
          B: round(randomMetrics.tierCounts.B, 2),
        },
        theoreticalHits: round(theoretical, 2),
      },
    ],
    falsePositives: {
      overcertaintyInNegatives: falsePositiveOvercertainty,
      confirmedHitsInNegatives: negatives.filter((item) => item.confirmedHits > 0).length,
      negatives: items.length - positives,
    },
    confirmedHits: {
      positivesWithConfirmation: items.filter((item) => item.positive && item.confirmedHits > 0).length,
      positives,
      note:
        '팩트 테이블과 오류 주입기를 같은 템플릿 4종 위에서 설계했으므로 커버리지가 낙관적이다. 상한으로 읽을 것.',
    },
    // 보강 경로가 양성을 물었는지 — 랭킹 반영 여부와 별개로 감지 자체를 본다.
    triggerCoverage: Object.fromEntries(
      ERROR_TYPES.map((type) => {
        const cell = items.filter((item) => item.positive && item.errorType === type);
        return [
          type,
          {
            positives: cell.length,
            factMismatch: cell.filter((item) => item.factMismatch).length,
            omission: cell.filter((item) => item.omission).length,
          },
        ];
      }),
    ),
    // 정답 템플릿 R 이 기준선. 삭제형 오류로 R 이 내려간 초안은 내림차순 랭킹의 사각지대다.
    belowBaseline: {
      baseRByTemplate: Object.fromEntries(
        TEMPLATES.map((template) => [
          template.id,
          detectDraft(template.sentences, template.product).r,
        ]),
      ),
      total: belowBaseline.length,
      positives: belowBaselinePositives,
    },
    rDistribution: Object.fromEntries(
      [...new Set(items.map((item) => item.r))]
        .sort((a, b) => b - a)
        .map((r) => [
          String(r),
          {
            total: items.filter((item) => item.r === r).length,
            positives: items.filter((item) => item.r === r && item.positive).length,
          },
        ]),
    ),
  };

  const outputPath = path.resolve('docs/eval-results.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`\n→ ${path.relative(process.cwd(), outputPath)}`);
}

main();
