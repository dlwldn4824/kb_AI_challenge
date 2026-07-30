/**
 * 승인 봉인 HMAC — Node 구현 (스펙 §2.3).
 * preimage 조립과 시크릿은 seal-core.ts 에 있고 브라우저 구현과 공유한다.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sealPreimage, sealSecret, type SealInput } from './seal-core';

export { sealPreimage, sealSecret, type SealInput } from './seal-core';

export function createSeal(input: SealInput): string {
  return createHmac('sha256', sealSecret()).update(sealPreimage(input), 'utf8').digest('hex');
}

export function verifySeal(input: SealInput, seal: string): boolean {
  const expected = Buffer.from(createSeal(input), 'utf8');
  const actual = Buffer.from(seal, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
