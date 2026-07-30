/**
 * 승인 봉인 HMAC (스펙 §2.3).
 *
 *   seal = HMAC_SHA256( SEAL_SECRET,
 *            caseId ‖ versionId ‖ contentDigest ‖ approver ‖ reason ‖ modelVersion ‖ ts )
 *
 * 봉인 대상 = 승인문 + 수정 사유 + 승인자 + 모델 버전. 하나라도 달라지면 봉인이 깨진다.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** 외부 서비스 키가 아니라 로컬 데모 상수다 (스펙 §1). */
const FALLBACK_SECRET = 'dev-seal-secret-synthetic-demo';

const SEPARATOR = '‖';

export interface SealInput {
  caseId: string;
  versionId: string;
  contentDigest: string;
  approver: string;
  reason: string;
  modelVersion: string;
  ts: string;
}

export function sealSecret(): string {
  return process.env.SEAL_SECRET || FALLBACK_SECRET;
}

export function sealPreimage(input: SealInput): string {
  return [
    input.caseId,
    input.versionId,
    input.contentDigest,
    input.approver,
    input.reason,
    input.modelVersion,
    input.ts,
  ].join(SEPARATOR);
}

export function createSeal(input: SealInput): string {
  return createHmac('sha256', sealSecret()).update(sealPreimage(input), 'utf8').digest('hex');
}

export function verifySeal(input: SealInput, seal: string): boolean {
  const expected = Buffer.from(createSeal(input), 'utf8');
  const actual = Buffer.from(seal, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
