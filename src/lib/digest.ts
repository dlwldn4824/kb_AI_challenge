/**
 * 내용 주소 다이제스트 (스펙 §2.3).
 *
 *   contentDigest = sha256hex( NFC(content).replaceAll("\r\n", "\n") )
 *   versionId     = contentDigest 앞 12 hex
 *
 * 정규화 덕분에 CRLF/NFD 변형은 같은 다이제스트가 되고,
 * 한 글자라도 실제로 달라지면 다른 다이제스트가 된다.
 */

import { createHash } from 'node:crypto';

export function normalizeContent(content: string): string {
  return content.normalize('NFC').replaceAll('\r\n', '\n');
}

export function digest(content: string): string {
  return createHash('sha256').update(normalizeContent(content), 'utf8').digest('hex');
}

export function versionIdOf(contentDigest: string): string {
  return contentDigest.slice(0, 12);
}

/** 화면 표시용 `앞6…뒤5` (스펙 §0). */
export function shortDigest(contentDigest: string): string {
  return `${contentDigest.slice(0, 6)}…${contentDigest.slice(-5)}`;
}
