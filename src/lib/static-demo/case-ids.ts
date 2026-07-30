/**
 * 정적 export 가 생성해야 할 케이스 목록.
 * seed 이벤트 JSON 에서 뽑으므로 케이스가 늘면 자동으로 따라온다.
 */

import seedEvents from './seed-events.json';

export function staticCaseIds(): string[] {
  const ids: string[] = [];
  for (const event of seedEvents as Array<{ caseId: string }>) {
    if (!ids.includes(event.caseId)) ids.push(event.caseId);
  }
  return ids;
}
