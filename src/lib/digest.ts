/**
 * 내용 주소 다이제스트 — Node 구현 (스펙 §2.3).
 *
 *   contentDigest = sha256hex( NFC(content).replaceAll("\r\n", "\n") )
 *   versionId     = contentDigest 앞 12 hex
 *
 * 정규화 덕분에 CRLF/NFD 변형은 같은 다이제스트가 되고,
 * 한 글자라도 실제로 달라지면 다른 다이제스트가 된다.
 * 정규화·표시 규칙은 digest-core.ts 에 있고 브라우저 구현과 공유한다.
 */

import { createHash } from 'node:crypto';
import { normalizeContent } from './digest-core';

export { normalizeContent, shortDigest, versionIdOf } from './digest-core';

export function digest(content: string): string {
  return createHash('sha256').update(normalizeContent(content), 'utf8').digest('hex');
}
