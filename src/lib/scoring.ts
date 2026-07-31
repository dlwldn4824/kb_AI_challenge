/**
 * 위험 신호 감지 + 개입 필요도 R 산출 (스펙 §0, §2.6).
 *
 * LLM 을 쓰지 않는다. 문장을 키워드/정규식 규칙에 통과시켜 신호를 찾는다.
 * fixture 문장에는 신호를 주석하지 않고, 이 감지기가 매번 다시 찾는다.
 *
 * 규칙은 우선순위 순서대로 평가하고, 한 문장은 가장 먼저 발화한 규칙 하나에만
 * 귀속된다. 예를 들어 "해지 시 제출 서류는 3개월 이내 발급분이어야 합니다."는
 * 절차·서류 규칙이 불이익 규칙(해지)보다 앞서므로 procedure_document 로 잡힌다.
 *
 * 하이라이트 구간은 규칙의 여러 패턴 중 "가장 길게" 잡힌 매치를 쓴다.
 * 짧은 키워드(30만원)보다 문맥을 포함한 구절(매월 30만원 이하)이 근거로 유용하다.
 *
 * R = Σ(발화한 신호 "유형"별 티어 점수). 같은 유형이 여러 문장에서 잡혀도 1회만 가산한다.
 *
 * 규칙은 세 경로로 발화한다. 셋 다 정규식이고 LLM 은 어디에도 없다.
 *   1. 패턴      — 위험한 구절이 있는가 (아래 SIGNAL_RULES)
 *   2. 팩트 대조 — 수치·조건이 상품 정본과 다른가 (product-facts.ts)
 *   3. 누락      — 있어야 할 조항이 아예 없는가 (부재 감지)
 * 같은 유형이 여러 경로에서 발화해도 R 에는 1회만 들어간다.
 */

import {
  findProductFacts,
  normalizeNumber,
  type ProductFacts,
} from '@/fixtures/product-facts';

export type Tier = 'S' | 'A' | 'B';

export type SignalType =
  | 'numeric_change'
  | 'exemption_condition'
  | 'overcertainty'
  | 'deadline_eligibility'
  | 'disadvantage_omission'
  | 'procedure_document';

export const TIER_SCORE: Record<Tier, number> = { S: 3, A: 2, B: 1 };

export interface SignalRule {
  type: SignalType;
  tier: Tier;
  score: number;
  label: string;
  patterns: RegExp[];
  /** 이 구간 안에서 잡힌 매치는 버린다. 상투구를 규칙에서 빼기 위한 장치다. */
  exclude?: RegExp[];
}

/**
 * 우선순위 순서(위에서부터 먼저 평가). 순서를 바꾸면 정본 케이스의 S·S·A·A·B 가 깨진다.
 * - overcertainty 의 표지(반드시/무조건)는 다른 유형과 겹치지 않아 맨 앞에 둔다.
 * - exemption 은 "1회에 한하여"처럼 수치를 품기 때문에 numeric 보다 앞에 둔다.
 * - procedure 는 "해지 시 제출 서류"처럼 불이익 표지를 품기 때문에 disadvantage 보다 앞에 둔다.
 * - disadvantage 는 "…대상의 경우 … 불가"처럼 자격 표지를 품기 때문에 eligibility 보다 앞에 둔다.
 */
export const SIGNAL_RULES: SignalRule[] = [
  {
    type: 'overcertainty',
    tier: 'S',
    score: TIER_SCORE.S,
    label: '확정성 과장',
    patterns: [
      /반드시[^.]*?됩니다/g,
      /무조건[^.]*?됩니다/g,
      /즉시[^.]*?됩니다/g,
      /100%\s*보장/g,
      /확정적으로/g,
      /반드시/g,
      /무조건/g,
    ],
    // "반드시 확인해 주시기 바랍니다"는 고객에게 하는 확인 요청이지 결과 단정이 아니다.
    // 안내 상투구까지 확정성 과장으로 세면 오탐만 늘고 큐 상단이 상투구로 채워진다.
    exclude: [
      /(?:반드시|즉시|꼭)[^.]*?(?:확인|문의|제출|접수|지참|준비)[^.]*?(?:주시기\s*바랍니다|주십시오|주세요|바랍니다)/g,
    ],
  },
  {
    type: 'exemption_condition',
    tier: 'S',
    score: TIER_SCORE.S,
    label: '면제·부과 조건',
    patterns: [
      /[0-9][0-9,.]*\s*회에\s*한하[여어]/g,
      /한하[여어]/g,
      /비과세/g,
      /면제/g,
      /감면/g,
      /부과되지\s*않습니다/g,
    ],
  },
  {
    type: 'procedure_document',
    tier: 'B',
    score: TIER_SCORE.B,
    label: '절차·서류 안내',
    patterns: [
      /[0-9][0-9,.]*\s*(?:개월|일|년)\s*이내\s*발급분/g,
      /발급분/g,
      /제출\s*서류/g,
      /증빙\s*서류/g,
      /서류/g,
      /신청서/g,
      /제출/g,
      /증빙/g,
    ],
  },
  {
    type: 'disadvantage_omission',
    tier: 'A',
    score: TIER_SCORE.A,
    label: '불이익 사항 누락',
    patterns: [
      // "조기전역 · 신분전환 · 금융소득종합과세 대상"처럼 불이익이 걸리는 주체 구절 전체를 잡는다.
      /[^\s,.][^,.]*?(?=의?\s*경우[^,.]*(?:불가|불이익|해지|연체|손실|추징))/g,
      /비대면\s*해지가?\s*불가[가-힣]*/g,
      /중도\s*해지/g,
      /원금\s*손실/g,
      /불이익/g,
      /불가[가-힣]*/g,
      /연체/g,
      /손실/g,
      /추징/g,
      /해지/g,
    ],
  },
  {
    type: 'deadline_eligibility',
    tier: 'A',
    score: TIER_SCORE.A,
    label: '기한·자격 요건',
    patterns: [
      /[0-9][0-9,.]*\s*년\s*[0-9]+\s*월\s*[0-9]+\s*일\s*전에\s*가입한?\s*계좌/g,
      /[^\s,.][^,.]*?전에\s*가입한?\s*계좌/g,
      /무주택\s*세대주\s*요건/g,
      /전에\s*가입/g,
      /[가-힣]+\s*요건/g,
      /무주택/g,
      /계약기간/g,
      /자격/g,
      /대상/g,
    ],
  },
  {
    type: 'numeric_change',
    tier: 'S',
    score: TIER_SCORE.S,
    label: '금액·금리 수치',
    patterns: [
      /(?:매월|매년|매일|연간|월|일)\s*[0-9][0-9,.]*\s*(?:만원|원|%|회|개월|년|배|건)\s*(?:이하|이상|이내|초과|미만|까지)/g,
      /[0-9][0-9,.]*\s*(?:만원|원|%|회|개월|년|배|건)\s*(?:이하|이상|이내|초과|미만|까지)/g,
      /(?:최고|최대|최저|최소)\s*[0-9][0-9,.]*\s*(?:만원|원|%|회|개월|년|배|건)/g,
      /[0-9][0-9,.]*\s*(?:만원|원|%|회|개월|년|배|건)/g,
    ],
  },
];

export interface SentenceSignal {
  type: SignalType;
  tier: Tier;
  score: number;
  label: string;
  evidence: string;
  start: number;
  end: number;
}

interface Span {
  text: string;
  start: number;
  end: number;
}

/** 제외 패턴이 잡은 구간들. 이 안에서 발화한 매치는 근거로 쓰지 않는다. */
function excludedSpans(rule: SignalRule, text: string): Array<[number, number]> {
  if (!rule.exclude) return [];
  const spans: Array<[number, number]> = [];
  for (const pattern of rule.exclude) {
    for (const match of text.matchAll(pattern)) {
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  return spans;
}

/** 한 규칙의 패턴들 중 가장 긴 매치를 고른다. 길이가 같으면 앞선 위치를 쓴다. */
function longestMatch(rule: SignalRule, text: string): Span | null {
  let best: Span | null = null;
  const excluded = excludedSpans(rule, text);
  for (const pattern of rule.patterns) {
    for (const match of text.matchAll(pattern)) {
      const matched = match[0];
      if (!matched) continue;
      if (excluded.some(([start, end]) => match.index >= start && match.index < end)) continue;
      const span: Span = {
        text: matched,
        start: match.index,
        end: match.index + matched.length,
      };
      if (
        best === null ||
        matched.length > best.text.length ||
        (matched.length === best.text.length && span.start < best.start)
      ) {
        best = span;
      }
    }
  }
  return best;
}

/** 문장 1개를 감지한다. 우선순위상 가장 먼저 발화한 규칙 하나만 반환한다. */
export function detectSentenceSignal(text: string): SentenceSignal | null {
  for (const rule of SIGNAL_RULES) {
    const span = longestMatch(rule, text);
    if (!span) continue;
    return {
      type: rule.type,
      tier: rule.tier,
      score: rule.score,
      label: rule.label,
      evidence: span.text,
      start: span.start,
      end: span.end,
    };
  }
  return null;
}

/** R = Σ(발화한 신호 유형별 티어 점수). 같은 유형 중복은 1회만 가산. */
export function computeR(signals: Array<{ type: SignalType; score: number }>): number {
  const seen = new Map<SignalType, number>();
  for (const signal of signals) {
    if (!seen.has(signal.type)) seen.set(signal.type, signal.score);
  }
  let total = 0;
  for (const score of seen.values()) total += score;
  return total;
}

/**
 * 정본 팩트 대조로 얻는 신호 (스펙 §2.6 보강).
 *
 * 위의 패턴 규칙은 "위험한 구절이 있다"만 본다. 수치가 틀렸는지, 있어야 할 조항이
 * 빠졌는지는 상품별 정본 팩트와 대조해야 알 수 있다. 두 경로는 병존하고,
 * R 은 유형 단위로 1회만 가산하므로 같은 유형이 양쪽에서 발화해도 중복되지 않는다.
 */
export type DerivedOrigin = 'fact_mismatch' | 'omission';

export interface DerivedSignal {
  type: SignalType;
  tier: Tier;
  score: number;
  label: string;
  origin: DerivedOrigin;
  /** 무엇이 어긋났는지 사람이 읽는 근거. */
  detail: string;
  /** 팩트 불일치는 문장을 특정할 수 있고, 누락은 부재라서 특정할 수 없다. */
  sentenceIdx: number | null;
}

const RULE_BY_TYPE = new Map(SIGNAL_RULES.map((rule) => [rule.type, rule]));

function ruleFor(type: SignalType): SignalRule {
  const rule = RULE_BY_TYPE.get(type);
  if (!rule) throw new Error(`신호 유형에 대응하는 규칙이 없습니다: ${type}`);
  return rule;
}

function derived(type: SignalType, origin: DerivedOrigin, detail: string, sentenceIdx: number | null): DerivedSignal {
  const rule = ruleFor(type);
  return { type, tier: rule.tier, score: rule.score, label: rule.label, origin, detail, sentenceIdx };
}

/** 수치 슬롯이 정본과 다른가 · 주장 문장에 한정 조건이 붙어 있는가. */
export function detectFactMismatches(sentences: string[], facts: ProductFacts): DerivedSignal[] {
  const found: DerivedSignal[] = [];

  for (const fact of facts.numbers) {
    sentences.forEach((text, idx) => {
      const match = fact.slot.exec(text);
      if (!match) return;
      if (normalizeNumber(match[1]) === normalizeNumber(fact.canonical)) return;
      found.push(
        derived(
          fact.type,
          'fact_mismatch',
          `${fact.label}: 정본 ${fact.canonical} · 초안 ${match[1]}`,
          idx,
        ),
      );
    });
  }

  for (const fact of facts.conditions) {
    sentences.forEach((text, idx) => {
      if (!fact.claim.test(text)) return;
      if (fact.qualifier.test(text)) return;
      found.push(derived(fact.type, 'fact_mismatch', `${fact.label} — 조건 없이 단정`, idx));
    });
  }

  return found;
}

/**
 * 필수 조항 누락. 초안 전체가 어떤 주장을 하는데 함께 있어야 할 신호 유형이
 * 아예 없으면 발화한다. 존재가 아니라 부재를 근거로 삼는 유일한 경로다.
 */
export function detectOmissions(
  sentences: string[],
  facts: ProductFacts,
  presentTypes: Set<SignalType>,
): DerivedSignal[] {
  const draft = sentences.join('\n');
  const found: DerivedSignal[] = [];
  const seen = new Set<SignalType>();

  for (const element of facts.required) {
    if (!element.claim.test(draft)) continue;
    for (const type of element.requires) {
      if (presentTypes.has(type) || seen.has(type)) continue;
      seen.add(type);
      found.push(derived(type, 'omission', `${element.label}인데 ${ruleFor(type).label} 안내가 없음`, null));
    }
  }

  return found;
}

export interface DetectedDraft {
  sentences: Array<{ idx: number; text: string; flagStart: number | null; flagEnd: number | null }>;
  /** 문장에 귀속되는 패턴 신호. 이벤트 스키마와 UI 하이라이트가 쓰는 배열이다. */
  signals: Array<{
    sentenceIdx: number;
    type: SignalType;
    tier: Tier;
    score: number;
    label: string;
    evidence: string;
  }>;
  /** 팩트 대조·누락으로 얻은 신호. 문장 귀속이 없을 수 있어 따로 둔다. */
  derived: DerivedSignal[];
  /**
   * 레퍼런스 확증 건수 = 팩트 불일치 + 필수 조항 누락 발화 수.
   * 의심 신호의 존재 발화는 세지 않는다 — 정본과 대조해 확인된 근거만 센다.
   * R 에는 영향을 주지 않고, 같은 R 안에서의 정렬 2차 키로만 쓴다(ranking.ts).
   */
  confirmedHits: number;
  r: number;
  tiers: Tier[];
}

/**
 * 초안 전체를 감지한다. seed 와 API 가 공유하는 단일 진입점.
 * 입력은 문장과 상품명뿐이다 — 정답이나 평가용 정보를 받지 않는다.
 */
export function detectDraft(sentences: string[], product?: string): DetectedDraft {
  const detected: DetectedDraft['sentences'] = [];
  const signals: DetectedDraft['signals'] = [];

  sentences.forEach((text, idx) => {
    const signal = detectSentenceSignal(text);
    detected.push({
      idx,
      text,
      flagStart: signal ? signal.start : null,
      flagEnd: signal ? signal.end : null,
    });
    if (signal) {
      signals.push({
        sentenceIdx: idx,
        type: signal.type,
        tier: signal.tier,
        score: signal.score,
        label: signal.label,
        evidence: signal.evidence,
      });
    }
  });

  const facts = findProductFacts(product);
  const mismatches = facts ? detectFactMismatches(sentences, facts) : [];
  const presentTypes = new Set<SignalType>([
    ...signals.map((signal) => signal.type),
    ...mismatches.map((signal) => signal.type),
  ]);
  const omissions = facts ? detectOmissions(sentences, facts, presentTypes) : [];
  const derivedSignals = [...mismatches, ...omissions];

  return {
    sentences: detected,
    signals,
    derived: derivedSignals,
    confirmedHits: derivedSignals.length,
    r: computeR([...signals, ...derivedSignals]),
    // 티어 배열은 문장 귀속 신호만 담는다. 누락은 가리킬 문장이 없기 때문이다.
    tiers: signals.map((signal) => signal.tier),
  };
}
