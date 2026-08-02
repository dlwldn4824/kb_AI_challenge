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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadAihubCases, listAihubFiles, splitSentences, MISSING_DATA_NOTICE } from './load-aihub';
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
function basicReference(canonical: string): ProductFacts {
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
// rule-v2.1 — 보강 레퍼런스 (T16 3차 실험, 평가 트랙 전용)
//
// v2 는 수치 슬롯과 "정본에 있던 신호 유형" 두 가지만 레퍼런스로 썼고 conditions 는
// 비워 두었다. v2.1 은 모범답변에서 조건절·기한을 규칙으로 더 뽑아 conditions 에 넣는다.
// 제품 감지기(src/lib/scoring.ts)와 DETECTOR_VERSION 은 건드리지 않는다 — 판정 로직은
// 그대로 두고 "무엇을 정본으로 주느냐"만 바꾸는 실험이다.
// ─────────────────────────────────────────────────────────────────────────────

/** 조건절 표지. 이 구절이 사라지면 조건 없이 단정한 문장이 된다. */
const CONDITION_MARKERS = [
  /[^,.]{2,20}?(?:하시는|하신|하는|이신|인)\s*경우/,
  /[^,.]{2,20}?의\s*경우/,
  /[^,.]{2,20}?에\s*한하[여어]/,
  /[^,.]{2,20}?에\s*한해/,
  /단,\s*/,
];

/** 기한 표지. 언제까지·언제부터가 빠지면 안내가 무기한이 된다. */
const DEADLINE_MARKERS = [
  /[0-9][0-9,]*\s*(?:영업일|일|개월|년|주|시간)\s*이내/,
  /[0-9][0-9,]*\s*(?:영업일|일|개월|년|주|시간)\s*이후/,
  /[0-9]{1,2}\s*월\s*[0-9]{1,2}\s*일부터/,
  /[가-힣]{2,10}일?부터/,
  /[가-힣]{2,10}까지/,
];

/**
 * 표지 뒤에 남는 본문에서 앵커를 뽑는다.
 *
 * 앵커는 "조건절을 지워도 살아남는 부분"이어야 한다. 문장 끝(어미)은 무해 변주의
 * 어미 치환에 걸릴 수 있으므로 표지 직후 앞쪽에서 가져온다.
 */
function anchorAfter(sentence: string, markerEnd: number): string | null {
  const rest = sentence.slice(markerEnd).replace(/^[\s,.]+/, '');
  const anchor = rest.slice(0, 12).trim();
  return anchor.length >= 6 ? anchor : null;
}

function enrichedReference(canonical: string): ProductFacts {
  const base = basicReference(canonical);
  const conditions: ProductFacts['conditions'] = [];
  const seen = new Set<string>();

  const collect = (markers: RegExp[], type: SignalType, label: string) => {
    for (const sentence of splitSentences(canonical)) {
      for (const marker of markers) {
        const match = marker.exec(sentence);
        if (!match) continue;
        const anchor = anchorAfter(sentence, match.index + match[0].length);
        if (!anchor) continue;
        const key = `${type}|${anchor}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conditions.push({
          key: `cond_${conditions.length}`,
          label: `${label} — "${match[0].trim()}"`,
          // 본문은 남아 있는데 표지가 사라졌으면 조건이 빠진 것이다.
          claim: new RegExp(escapeRe(anchor)),
          qualifier: new RegExp(escapeRe(match[0].trim())),
          type,
        });
        break; // 한 문장당 한 표지만 잡는다
      }
    }
  };

  collect(CONDITION_MARKERS, 'exemption_condition', '조건절');
  collect(DEADLINE_MARKERS, 'deadline_eligibility', '기한');

  return { ...base, conditions };
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
  /** 이 건이 나온 모범답변. 레퍼런스는 여기서만 만든다. */
  canonical: string;
  editDistance: number;
  receivedAt: string;
}

/** 레퍼런스를 갈아 끼우며 같은 시험지를 다시 채점한 결과. */
interface Scored extends Item {
  r: number;
  confirmedHits: number;
}

interface Metrics {
  hits: number;
  recall: number;
  precision: number;
}

function evaluate(items: Array<{ positive: boolean }>, order: number[], positives: number): Metrics {
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

      const source = entry.sentences.join('\n');
      const topic = entry.item.topic.consulting;

      const push = (sentences: string[], positive: boolean, suffix: string) => {
        items.push({
          id: `${entry.item.meta.qaId}-${type}-${suffix}`,
          errorType: type,
          positive,
          topic,
          sentences,
          canonical: entry.item.canonicalAnswer,
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

  // ── 같은 시험지를 레퍼런스만 갈아 끼워 두 번 채점한다 ─────────────────────
  // items 는 한 번만 만들어졌으므로 두 실행이 문자 그대로 같은 문장을 본다.
  // 시험지 지문(아래 corpusDigest)을 결과에 실어 그 사실을 남긴다.
  const corpusDigest = crypto
    .createHash('sha256')
    .update(items.map((item) => `${item.id}\u0000${item.sentences.join('\n')}`).join('\u0001'))
    .digest('hex')
    .slice(0, 16);

  const scoreWith = (build: (canonical: string) => ProductFacts): Scored[] => {
    const cache = new Map<string, ProductFacts>();
    return items.map((item) => {
      let facts = cache.get(item.canonical);
      if (!facts) {
        facts = build(item.canonical);
        cache.set(item.canonical, facts);
      }
      const detected = detectDraftWithFacts(item.sentences, facts);
      return { ...item, r: detected.r, confirmedHits: detected.confirmedHits };
    });
  };

  const hitsByType = (scored: Scored[], order: number[]) => {
    const top = new Set(order.slice(0, K));
    const counts: Record<string, number> = {};
    for (const type of ERROR_TYPES) counts[ERROR_TYPE_KEY[type]] = 0;
    scored.forEach((item, index) => {
      if (item.positive && top.has(index)) counts[ERROR_TYPE_KEY[item.errorType]] += 1;
    });
    return counts;
  };

  interface Analysis {
    label: string;
    rMetrics: Metrics;
    pureRMetrics: Metrics;
    rByType: Record<string, number>;
    pureByType: Record<string, number>;
    confirmedPositives: number;
    confirmedNegatives: number;
    /** 오류 유형별로 확증이 붙은 양성 수. 랭킹과 별개로 "감지 자체"를 본다. */
    confirmedByType: Record<string, number>;
  }

  const analyse = (label: string, scored: Scored[]): Analysis => {
    const rOrder = scored.map((_, i) => i).sort((a, b) => compareRank(scored[a], scored[b]));
    const pureROrder = scored
      .map((_, i) => i)
      .sort((a, b) => compareRank({ ...scored[a], confirmedHits: 0 }, { ...scored[b], confirmedHits: 0 }));
    return {
      label,
      rMetrics: evaluate(scored, rOrder, positives),
      pureRMetrics: evaluate(scored, pureROrder, positives),
      rByType: hitsByType(scored, rOrder),
      pureByType: hitsByType(scored, pureROrder),
      confirmedPositives: scored.filter((item) => item.positive && item.confirmedHits > 0).length,
      confirmedNegatives: scored.filter((item) => !item.positive && item.confirmedHits > 0).length,
      confirmedByType: Object.fromEntries(
        ERROR_TYPES.map((type) => [
          ERROR_TYPE_KEY[type],
          scored.filter((item) => item.positive && item.errorType === type && item.confirmedHits > 0).length,
        ]),
      ),
    };
  };

  const v2 = analyse('rule-v2 (basic reference)', scoreWith(basicReference));
  const v21 = analyse('rule-v2.1 (enriched reference)', scoreWith(enrichedReference));

  // 보강 레퍼런스가 실제로 몇 개나 뽑혔는지. 0 에 가까우면 규칙이 안 걸린 것이고,
  // 많은데도 적중이 안 늘면 구조적 한계다 — 둘을 구분해야 해석이 된다.
  const canonicals = [...new Set(items.map((item) => item.canonical))];
  const conditionCounts = canonicals.map((text) => enrichedReference(text).conditions.length);
  const numberCounts = canonicals.map((text) => basicReference(text).numbers.length);
  const referenceScale = {
    canonicals: canonicals.length,
    number_slots_total: numberCounts.reduce((sum, n) => sum + n, 0),
    condition_slots_total: conditionCounts.reduce((sum, n) => sum + n, 0),
    canonicals_with_condition_slot: conditionCounts.filter((n) => n > 0).length,
  };

  // 편집거리·무작위는 레퍼런스와 무관하다 (문장과 양성 위치만 본다).
  const editOrder = items
    .map((_, i) => i)
    .sort((a, b) => items[b].editDistance - items[a].editDistance || tieKey[a] - tieKey[b]);
  const editMetrics = evaluate(items, editOrder, positives);
  const editByType = hitsByType(items as Scored[], editOrder);

  const randomRand = mulberry32(SEED + 2);
  let randomHits = 0;
  for (let trial = 0; trial < RANDOM_TRIALS; trial += 1) {
    const order = shuffled(items.length, randomRand);
    randomHits += order.slice(0, K).filter((index) => items[index].positive).length;
  }
  randomHits /= RANDOM_TRIALS;

  const maxRecall = Math.min(K, positives) / positives;

  // ── 출력 ──────────────────────────────────────────────────────────────────
  console.log('답변등기 — 실상담 기반 정량 평가 (AI Hub 은행)');
  console.log('원본 재배포 금지 · repo 에는 파생 수치만 남는다\n');
  console.log(`설계   원본 파일 표본 ${SAMPLE_FILES.toLocaleString()}건 → 사용 가능 답변 ${usable.length.toLocaleString()}건`);
  console.log(`       평가셋 ${items.length}건 (양성 ${positives} · 음성 ${items.length - positives}) · K = ${K} · seed ${SEED}`);
  console.log(`       정본 = qa_data[].output · 오류 유형 ${ERROR_TYPES.length}종 × ${POSITIVES_PER_TYPE}건`);
  if (shortage.length > 0) console.log(`       주입기 미달: ${shortage.join(' · ')}`);
  console.log();

  console.log(`       시험지 지문 sha256:${corpusDigest} — 아래 두 run 은 이 시험지를 공유한다\n`);

  console.log('| 방법 | Recall@39 | Precision@39 | 적중 |');
  console.log('| --- | ---: | ---: | ---: |');
  console.log(
    `| R 랭킹 (v2.1 보강 레퍼런스 + 확증) | ${pct(v21.rMetrics.recall)} | ${pct(v21.rMetrics.precision)} | ${v21.rMetrics.hits}/${positives} |`,
  );
  console.log(
    `| R 랭킹 (v2 기본 레퍼런스 + 확증) | ${pct(v2.rMetrics.recall)} | ${pct(v2.rMetrics.precision)} | ${v2.rMetrics.hits}/${positives} |`,
  );
  console.log(
    `| R 랭킹 (순수 R · 레퍼런스 무관) | ${pct(v2.pureRMetrics.recall)} | ${pct(v2.pureRMetrics.precision)} | ${v2.pureRMetrics.hits}/${positives} |`,
  );
  console.log(`| 편집거리 baseline | ${pct(editMetrics.recall)} | ${pct(editMetrics.precision)} | ${editMetrics.hits}/${positives} |`);
  console.log(
    `| 무작위 (${RANDOM_TRIALS}회 평균) | ${pct(randomHits / positives)} | ${pct(randomHits / K)} | ${randomHits.toFixed(2)}/${positives} |`,
  );

  console.log(`\n| 오류 유형 | v2.1 | v2 | 순수 R | 편집거리 |`);
  console.log('| --- | ---: | ---: | ---: | ---: |');
  for (const type of ERROR_TYPES) {
    const key = ERROR_TYPE_KEY[type];
    console.log(
      `| ${ERROR_TYPE_LABEL[type]} | ${v21.rByType[key]} | ${v2.rByType[key]} | ${v2.pureByType[key]} | ${editByType[key]} |`,
    );
  }

  console.log(`\n| 오류 유형 | v2.1 확증 | v2 확증 |`);
  console.log('| --- | ---: | ---: |');
  for (const type of ERROR_TYPES) {
    const key = ERROR_TYPE_KEY[type];
    console.log(
      `| ${ERROR_TYPE_LABEL[type]} | ${v21.confirmedByType[key]}/${POSITIVES_PER_TYPE} | ${v2.confirmedByType[key]}/${POSITIVES_PER_TYPE} |`,
    );
  }

  console.log(
    `\n확증이 붙은 건  v2.1: 양성 ${v21.confirmedPositives}/${positives} · 음성 ${v21.confirmedNegatives}/${items.length - positives}`,
  );
  console.log(
    `                v2  : 양성 ${v2.confirmedPositives}/${positives} · 음성 ${v2.confirmedNegatives}/${items.length - positives}`,
  );
  console.log(
    `보강 레퍼런스 규모  정본 ${referenceScale.canonicals}건 · 수치 슬롯 ${referenceScale.number_slots_total}개 · ` +
      `조건 슬롯 ${referenceScale.condition_slots_total}개 (조건 슬롯이 하나라도 있는 정본 ${referenceScale.canonicals_with_condition_slot}건)`,
  );
  const delta = v21.rMetrics.hits - v2.rMetrics.hits;
  console.log(
    `\n해석   보강 레퍼런스(v2.1)는 조건 슬롯 ${referenceScale.condition_slots_total}개를 더 넣었지만 상위 ${K} 적중은 ` +
      `${delta >= 0 ? '+' : ''}${delta}건(${v2.rMetrics.hits} → ${v21.rMetrics.hits})이다. ` +
      `확증은 ${v2.confirmedPositives} → ${v21.confirmedPositives}건으로 늘었으나 랭킹까지 가지 못했다.`,
  );
  console.log(
    `       삭제형 오류(자격 요건·불이익 문구)는 문장이 통째로 사라져 claim 앵커와 조건 표지가 함께 없어진다. ` +
      `문장 단위 조건 대조로는 구조적으로 잡을 수 없고, 남은 경로는 신호 "유형"이 통째로 사라졌는지 보는 것뿐이다.`,
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
      conditions_v2: '비움 — 조건절 claim/qualifier 짝을 일반화하지 않았다',
      conditions_v2_1: '모범답변의 조건절 표지(~의 경우 / 단, / ~에 한하여)와 기한 표지(~이내 / ~부터 / ~까지)를 규칙으로 뽑아 claim=표지 뒤 본문 앵커, qualifier=표지 자체로 편입',
      caveat:
        '오류 주입기와 감지기가 같은 문서(모범답변)를 레퍼런스로 공유한다. 따라서 이 수치는 성능이 아니라 상한으로 읽어야 한다. 합성 평가(docs/eval-results.json)와 같은 한계다.',
    },
    /** 같은 시험지(corpus_digest)를 레퍼런스만 바꿔 채점한 결과. 기존 run 은 그대로 둔다. */
    corpus_digest: corpusDigest,
    runs: [
      {
        detector: 'v2',
        reference: 'basic (numbers + canonical signal types)',
        ranking: 'R+confirmedHits',
        recall_at_39: round(v2.rMetrics.recall),
        precision_at_39: round(v2.rMetrics.precision),
        hits: v2.rMetrics.hits,
        by_error_type: v2.rByType,
      },
      {
        detector: 'v2.1 enriched-reference',
        reference: 'enriched (basic + 조건절·기한 표지를 conditions 로)',
        ranking: 'R+confirmedHits',
        recall_at_39: round(v21.rMetrics.recall),
        precision_at_39: round(v21.rMetrics.precision),
        hits: v21.rMetrics.hits,
        by_error_type: v21.rByType,
        note: '제품 감지기(DETECTOR_VERSION rule-v2)는 불변. 레퍼런스만 바꾼 3차 실험(T16).',
      },
      {
        detector: 'v2',
        reference: 'basic',
        ranking: 'R',
        recall_at_39: round(v2.pureRMetrics.recall),
        precision_at_39: round(v2.pureRMetrics.precision),
        hits: v2.pureRMetrics.hits,
        by_error_type: v2.pureByType,
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
    reference_scale: referenceScale,
    confirmed_hits_by_type: { v2: v2.confirmedByType, 'v2.1': v21.confirmedByType },
    confirmed_hits: {
      v2: {
        positives_with_confirmation: v2.confirmedPositives,
        negatives_with_confirmation: v2.confirmedNegatives,
      },
      'v2.1': {
        positives_with_confirmation: v21.confirmedPositives,
        negatives_with_confirmation: v21.confirmedNegatives,
      },
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
