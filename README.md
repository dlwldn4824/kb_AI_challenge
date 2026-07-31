# 답변등기 (Answer Registry)

KB AI Challenge 2026 제출용 프로토타입 · 팀 삼삼오오

AI 상담 초안을 위험 순으로 골라주고, 상담직원이 문장 단위로 판단하면,
**승인한 문장 그대로만** 발송되는 은행 내부 검토 콘솔입니다.

> **SYNTHETIC DEMO · 합성 예시 데이터** — 실제 고객 데이터가 아닙니다.
> 외부 API·LLM 호출이 없고, 네트워크 없이 로컬에서만 동작합니다.

구현의 정본은 [`docs/BUILD_SPEC.md`](docs/BUILD_SPEC.md) 입니다.

## 설치

```bash
git clone <repo> && cd answer-registry
npm install
cp .env.example .env.local   # 선택. 없으면 로컬 기본 시크릿을 씁니다.
```

## 실행

```bash
npm run dev     # predev 로 seed 가 먼저 돌아갑니다. http://localhost:3000
```

## 테스트

```bash
npx vitest run  # 불변조건 4 + 승인 게이트 2
```

## 데모 시나리오 6스텝

1. `npm run seed` 로 합성 상담 20건을 넣고 `npm run dev` 로 접속합니다.
2. **발행 대기** 화면에서 맨 위 `RG-2026-081-0142` (R=11 · S·S·A·A·B)를 확인합니다.
   행을 열면 어떤 신호가 몇 점을 냈는지 분해해서 보여줍니다.
3. **검토** 화면에서 4번 구절을 수정하고 사유 `자격 미확인` 을 원탭으로 고릅니다.
   사유와 실제 수정이 맞는지 규칙 기반 검사가 즉시 돌아 `적합` 이 뜹니다.
4. `승인하고 발송` → **발행 완료** 화면에서 승인문과 발송문의 sha256 이 일치하는지,
   봉인 정보(승인자·수정 사유·모델 버전)가 무엇인지 확인합니다.
5. `npx tsx scripts/tamper-demo.ts` 를 실행하면 승인문에서 `30만원` 을 `50만원` 으로
   한 글자만 바꾼 문안이 **409 로 차단**되는 것을 그대로 출력합니다.
6. `curl localhost:3000/api/registry/RG-2026-081-0142` — 등기번호 하나로 이벤트를 재생해
   원문·수정문·사유·승인자·봉인을 복원합니다.

## 이 프로토타입이 실제로 보장하는 것

| 불변조건 | 어디서 강제하나 |
|---|---|
| 유효한 승인 없이는 발송 불가 | `POST /api/dispatch` — 409 + `dispatch_blocked{no_valid_approval}` |
| 승인 후 내용이 바뀌면 승인 즉시 무효 | 구절 변경 이벤트 직후 서버가 `approval_invalidated` 를 append |
| 발송문 ≠ 승인문이면 차단 (curl 포함) | 서버가 digest 를 재계산 — 409 + `dispatch_blocked{digest_mismatch}` |
| 등기번호 하나로 전 과정 복원 | `GET /api/registry/[caseId]` — 이벤트 재생 |

전부 `tests/invariants.test.ts` 에서 route handler 를 직접 호출해 검증합니다.
UI 를 거치지 않아도 같은 결과가 나온다는 것이 요점입니다.

## 구조

```
src/app/                화면 3 + 차단 배너 + 발행 완료 재열람 잠금(sealed-lock.tsx)
src/app/api/            route handlers (전부 runtime = 'nodejs')
src/lib/                db · digest · seal · scoring · coherence · projection
src/fixtures/           합성 상담 20건 + 총량 지표 상수
scripts/seed.ts         DB 초기화 + 이벤트 시드
scripts/tamper-demo.ts  변조 발송 차단 시연
tests/invariants.test.ts
data/demo.db            생성물 (gitignore)
```

### 이벤트 로그가 유일한 진실

`events` 테이블 하나뿐입니다. 뷰도, 파생 캐시도, 가변 boolean 컬럼도 없습니다.
`src/lib/db.ts` 는 INSERT 와 SELECT 만 제공하며 UPDATE/DELETE 함수 자체가 없습니다.
"이 케이스가 승인되었는가" 같은 질문의 답은 `src/lib/projection.ts` 가
이벤트를 처음부터 다시 읽어서 만듭니다. 승인 무효화조차 기존 행을 고치는 것이 아니라
`approval_invalidated` 이벤트를 새로 쌓는 방식입니다.

### 봉인

```
contentDigest = sha256( NFC(승인문).replaceAll("\r\n", "\n") )
versionId     = contentDigest 앞 12 hex
seal          = HMAC_SHA256(SEAL_SECRET,
                  caseId ‖ versionId ‖ contentDigest ‖ 승인자 ‖ 사유 ‖ 모델버전 ‖ 봉인시각)
```

정규화 덕분에 줄바꿈(CRLF)이나 유니코드 정규화 형태가 달라도 같은 내용이면 통과하고,
실제로 한 글자가 바뀌면 다이제스트가 달라져 차단됩니다.

### 발행 완료 재열람 잠금

`/review/[caseId]` 를 발행 완료(dispatched) 케이스로 다시 열면 상단에 잠금 배너가 뜨고,
구절 행은 반투명 처리되며 `수정` 버튼을 눌러도 편집 대신 차단 모달(등기번호 · 봉인 시각 ·
봉인 sha256)이 뜹니다. `발송 문안` 카드도 `봉인된 발송문 · 읽기 전용`으로 바뀌어 봉인된
승인문을 그대로 보여줍니다.

UI 전용 변경입니다 — `projection.ts` 가 이미 노출하던 `dispatched` · `approval.sealedAt` ·
`approval.contentDigest` 값을 화면에 얹었을 뿐, 이벤트 스키마나 조회 로직은 그대로입니다.
컴포넌트는 `src/app/review/[caseId]/sealed-lock.tsx`. `새 등기로 재발행` 버튼은 자리만
있고 비활성 상태입니다 — 재발행 기능 자체는 이번 스코프 밖입니다.

### 만들지 않은 것

로그인·권한, 실제 LLM 연동, 실채널 발송, 관리자 설정 화면.
그리고 **무응답 타임아웃 자동 승인은 어떤 형태로도 넣지 않았습니다.**
승인은 사람이 판정을 끝내야만 생깁니다.

## 스펙과 다르게 구현한 한 곳

`RG-2026-081-0091` (청년희망적금) 큐 행은 Figma 에 `R=2 · 신호 B·B` 로 그려져 있지만,
R 은 "신호 유형별" 티어 점수의 합이라 같은 유형이 두 번 잡혀도 1회만 가산됩니다
(스펙 §0 산식, §6 주의사항). B 티어 유형은 `procedure_document` 하나뿐이라
B·B 조합으로는 R=2 가 나올 수 없습니다. R 값이 큐 정렬의 기준이므로
**R=2 를 유지하고 신호를 A 티어 1건으로** 잡았습니다.
`src/fixtures/cases.ts` 의 해당 항목 주석에도 같은 내용을 적어두었습니다.

## 라이브 데모 (GitHub Pages)

https://dlwldn4824.github.io/kb_AI_challenge/

정적 데모는 서버 없이 도는 대신 **검증 로직을 브라우저에서 실제로 실행한다.** 이벤트 로그는
브라우저 메모리(+sessionStorage), sha256·HMAC 봉인은 WebCrypto, 신호 감지·정합성 검사·상태
재생은 `src/lib` 의 같은 순수 함수를 쓴다. 응답을 흉내 낸 mock 은 없다. Node 구현과 같은 해시가
나오는지는 `tests/hash-parity.test.ts` 가 고정한다.

다만 **"UI 를 거치지 않은 curl 도 똑같이 차단된다"는 증명은 정적 데모가 할 수 없다.** 그 증명은
로컬 서버 모드의 불변조건 테스트(`npx vitest run`)와 `npm run tamper` 가 담당한다.

```bash
npm run build:static   # NEXT_PUBLIC_STATIC_DEMO=1 로 out/ 생성
npx serve out          # 로컬 확인 (basePath 없이 보려면 NEXT_PUBLIC_BASE_PATH= 로 빌드)
```

## 캡처 전 준비

제출용 스크린샷을 찍기 전에는 `npm run seed` 로 상태를 되돌린다. 정본 케이스
`RG-2026-081-0142` 가 "검토 대기"여야 화면 1의 큐와 화면 2의 초기 상태가 시연과 같아진다.
캡처 기준 뷰포트는 16:10(1920×1200)이다.
