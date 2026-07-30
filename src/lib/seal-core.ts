/**
 * 봉인의 순수 부분 (스펙 §2.3).
 *
 *   seal = HMAC_SHA256( SEAL_SECRET,
 *            caseId ‖ versionId ‖ contentDigest ‖ approver ‖ reason ‖ modelVersion ‖ ts )
 *
 * 봉인 대상 = 승인문 + 수정 사유 + 승인자 + 모델 버전. 하나라도 달라지면 봉인이 깨진다.
 * 서버와 브라우저가 같은 preimage 를 쓰도록 문자열 조립을 여기 한 곳에 둔다.
 */

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

/** 브라우저 번들에는 process 가 없을 수 있으므로 존재 여부를 확인한다. */
export function sealSecret(): string {
  if (typeof process !== 'undefined' && process.env?.SEAL_SECRET) {
    return process.env.SEAL_SECRET;
  }
  return FALLBACK_SECRET;
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
