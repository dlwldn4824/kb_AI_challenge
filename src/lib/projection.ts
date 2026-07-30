/**
 * 서버 모드용 이벤트 재생 어댑터.
 * 재생 규칙은 projection-core.ts 에 있고, 여기서는 DB 와 Node 해시만 끼워 넣는다.
 */

import { readEvents } from './db';
import { digest } from './digest';
import {
  replayEvents as replayEventsCore,
  type CaseState,
  type DigestFn,
} from './projection-core';

export * from './projection-core';

export function replayEvents(caseId: string, events: Parameters<typeof replayEventsCore>[1]): CaseState {
  return replayEventsCore(caseId, events, digest as DigestFn);
}

export function replay(caseId: string): CaseState {
  return replayEvents(caseId, readEvents(caseId));
}
