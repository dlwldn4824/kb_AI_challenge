/**
 * 브라우저(WebCrypto) 구현 — 정적 데모 모드용.
 *
 * 서버가 하던 계산을 mock 으로 대체하지 않고 브라우저에서 실제로 다시 한다.
 * 정규화 규칙(digest-core)과 봉인 preimage(seal-core)를 Node 구현과 공유하므로
 * 같은 입력이면 같은 해시가 나온다 — tests/hash-parity.test.ts 가 이를 고정한다.
 */

import { normalizeContent, toHex } from './digest-core';
import { sealPreimage, sealSecret, type SealInput } from './seal-core';

const encoder = new TextEncoder();

export async function digestWeb(content: string): Promise<string> {
  const bytes = encoder.encode(normalizeContent(content));
  return toHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(sealSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function createSealWeb(input: SealInput): Promise<string> {
  const key = await hmacKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sealPreimage(input)));
  return toHex(signature);
}

export async function verifySealWeb(input: SealInput, seal: string): Promise<boolean> {
  const expected = await createSealWeb(input);
  if (expected.length !== seal.length) return false;
  // 길이가 같을 때만 비교한다. 브라우저에는 timingSafeEqual 이 없어 상수시간 비교를 흉내 낸다.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ seal.charCodeAt(i);
  }
  return diff === 0;
}
