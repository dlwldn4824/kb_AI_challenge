/**
 * 큐 정렬 키 (스펙 §4.1).
 *
 * R 산식도, 화면에 찍히는 R 숫자도 건드리지 않는다. 같은 R 안에서의 순서만 정한다.
 *
 * 감지기는 정본 팩트와의 불일치·필수 조항 누락을 찾아내지만(scoring.ts 의 derived),
 * R 은 "발화한 신호 유형"의 합이라 이미 발화 중인 유형을 다시 물어도 점수가 오르지
 * 않는다. 그렇게 확보한 근거를 버리지 않으려고 2차 키로 쓴다.
 *
 * 정렬 키 = (R 내림차순, 레퍼런스 확증 건수 내림차순, 접수 시각 오름차순)
 * 마지막 키가 오름차순인 것은 같은 조건이면 먼저 들어온 건을 먼저 본다는 뜻이다.
 *
 * 큐(view-model.ts)와 평가 스크립트(scripts/eval.ts)가 이 함수 하나를 공유한다.
 * 평가가 제품과 다른 비교기를 쓰면 출하하지 않는 시스템을 재는 셈이 된다.
 */

export interface RankInput {
  /** 개입 필요도. 표시값 그대로다. */
  r: number;
  /** 팩트 불일치 + 필수 조항 누락 발화 수. 의심 신호 존재 발화는 세지 않는다. */
  confirmedHits: number;
  /** 접수 시각 (ISO8601). */
  receivedAt: string;
}

export function compareRank(a: RankInput, b: RankInput): number {
  if (b.r !== a.r) return b.r - a.r;
  if (b.confirmedHits !== a.confirmedHits) return b.confirmedHits - a.confirmedHits;
  return a.receivedAt.localeCompare(b.receivedAt);
}
