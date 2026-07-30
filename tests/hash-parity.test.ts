/**
 * Node 구현과 WebCrypto 구현이 같은 해시를 내는지 고정한다.
 *
 * 정적 데모 모드는 서버가 하던 계산을 브라우저에서 다시 한다. 두 구현이 갈라지면
 * "승인문 = 발송문" 증명이 모드마다 달라지므로, 그 지점을 테스트로 못 박는다.
 */

import { describe, expect, it } from 'vitest';
import { digest } from '@/lib/digest';
import { createSeal, verifySeal, type SealInput } from '@/lib/seal';
import { createSealWeb, digestWeb, verifySealWeb } from '@/lib/webcrypto';

const SAMPLES = [
  '한 은행의 월 저축한도는 최고 30만원이며, 매월 30만원 이하 금액을 만기일 전일까지 저축 가능합니다.',
  '조기전역 · 신분전환 · 금융소득종합과세 대상의 경우 비대면 해지가 불가합니다.',
  'line one\nline two\nline three',
  'CRLF 도 같은 값이어야 한다\r\n둘째 줄',
  '',
];

const SEAL: SealInput = {
  caseId: 'RG-2026-081-0142',
  versionId: '2f3ce6da13e4',
  contentDigest: 'f'.repeat(64),
  approver: 'EMP-4471',
  reason: '자격 미확인',
  modelVersion: 'v3.4.2',
  ts: '2026-07-23T12:54:12+09:00',
};

describe('Node ↔ WebCrypto 해시 동등성', () => {
  it('같은 문안이면 sha256 이 같다', async () => {
    for (const sample of SAMPLES) {
      expect(await digestWeb(sample)).toBe(digest(sample));
    }
  });

  it('CRLF 정규화 결과도 두 구현이 같다', async () => {
    const crlf = '가나다\r\n라마바';
    const lf = '가나다\n라마바';
    expect(await digestWeb(crlf)).toBe(await digestWeb(lf));
    expect(digest(crlf)).toBe(await digestWeb(lf));
  });

  it('NFD 로 입력해도 두 구현 모두 NFC 로 정규화한다', async () => {
    const nfc = '가나다';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(await digestWeb(nfd)).toBe(await digestWeb(nfc));
    expect(digest(nfd)).toBe(await digestWeb(nfc));
  });

  it('봉인 HMAC 과 검증 결과가 같다', async () => {
    expect(await createSealWeb(SEAL)).toBe(createSeal(SEAL));

    const seal = createSeal(SEAL);
    expect(await verifySealWeb(SEAL, seal)).toBe(true);
    expect(verifySeal(SEAL, seal)).toBe(true);

    const tampered = { ...SEAL, reason: '수치 오류' };
    expect(await verifySealWeb(tampered, seal)).toBe(false);
    expect(verifySeal(tampered, seal)).toBe(false);
  });
});
