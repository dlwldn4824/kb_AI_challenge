/**
 * 학습 신호 payload 조립 (스펙 §2.1).
 *
 * 승인이 끝나면 "사람이 무엇을 유지하고 무엇을 고쳤는가"가 확정된다. 그 판정을
 * 감지기 개선용 레이블로 한 줄 남긴다. 기록만 하고 아무것도 되돌리지 않는다 —
 * 승인·발송 게이트는 이 이벤트를 읽지 않는다.
 *
 * 서버(actions.ts)와 정적 데모(static-demo/store.ts)가 같은 payload 를 만들어야
 * 두 모드의 이벤트 로그가 같아지므로, 조립은 이 순수 함수 하나로 모은다.
 */

import type { Reason } from './constants';
import type { LearningSignalSavedPayload } from './events';
import type { CaseState } from './projection-core';
import type { Tier } from './scoring';

export function learningSignalOf(state: CaseState): LearningSignalSavedPayload {
  const ordered = [...state.sentences].sort((a, b) => a.idx - b.idx);
  const edited = ordered.filter((sentence) => sentence.verdict === 'edited');

  const tierCounts: Record<Tier, number> = { S: 0, A: 0, B: 0 };
  for (const tier of state.tiers) tierCounts[tier] += 1;

  return {
    caseId: state.caseId,
    sentenceCount: ordered.length,
    editCount: edited.length,
    reasons: edited
      .map((sentence) => sentence.reason)
      .filter((reason): reason is Reason => reason !== null),
    tierCounts,
  };
}
