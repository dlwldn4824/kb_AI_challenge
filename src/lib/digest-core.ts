/**
 * 다이제스트의 순수 부분 (스펙 §2.3).
 *
 * 정규화·표시 규칙은 Node 와 브라우저가 똑같이 써야 하므로 crypto 의존 없이 여기 둔다.
 * 실제 해시 계산은 Node 는 digest.ts, 브라우저는 webcrypto.ts 가 맡는다.
 */

export function normalizeContent(content: string): string {
  return content.normalize('NFC').replaceAll('\r\n', '\n');
}

/** versionId = contentDigest 앞 12 hex (내용 주소 기반). */
export function versionIdOf(contentDigest: string): string {
  return contentDigest.slice(0, 12);
}

/** 화면 표시용 `앞6…뒤5` (스펙 §0). */
export function shortDigest(contentDigest: string): string {
  return `${contentDigest.slice(0, 6)}…${contentDigest.slice(-5)}`;
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
