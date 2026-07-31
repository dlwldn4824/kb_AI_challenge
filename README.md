# 답변등기 (Answer Registry)

KB AI Challenge 2026 제출용 프로토타입 · 팀 삼삼오오

AI 상담 초안을 위험 순으로 골라주고, 상담직원이 문장 단위로 판단하면,
**승인한 문장 그대로만** 발송되는 은행 내부 검토 콘솔입니다.

> **SYNTHETIC DEMO · 합성 예시 데이터** — 실제 고객 데이터가 아닙니다.
> 외부 API·LLM 호출이 없고, 네트워크 없이 로컬에서만 동작합니다.

**AI 배치 원칙**: 되돌릴 수 있는 곳(감지·선별·설명)엔 AI를, 되돌릴 수 없는 곳(승인·발송)엔 결정론을.
감지기는 규칙 기반이고 틀려도 사람이 덮어쓸 수 있지만, 승인·발송 게이트에는 확률적 판단이 없습니다.

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
npx vitest run  # 57건 — 불변조건 4 · 승인 게이트 2 · 판정 경합 2 · 사유 재선택 4
                #        학습 신호 5 · 감지기 회귀 36 · 해시 동등성 4
```

## 데모 6막

`npm run seed && npm run dev` 로 시작합니다. 정본 케이스는 `RG-2026-081-0142` 입니다.

**1막 — 큐가 순서를 정한다.** 맨 위가 `R=11 · S·S·A·A·B`. 행을 고르면 우측 패널이
그 11점이 어느 신호에서 몇 점씩 나왔는지 분해합니다. 목록 맨 아래에는 신호가 하나도
발화하지 않은 무작위 표본 레인이 따로 있습니다.

**2막 — 문장 단위로 판정한다.** 검토 화면에서 1·2·3·5번은 유지, 4번만 수정합니다.
우측 `정본 대조` 가 선택한 구절을 상품 정본 팩트와 나란히 놓고 어긋난 수치를 짚어 줍니다.

**3막 — 틀린 사유는 승인을 막는다.** 4번 구절에 사유 `수치 오류` 를 고르면
"문구 추가만 있고 수치 변경 없음"으로 **불일치** 가 뜨고 승인 버튼이 잠깁니다.
`자격 미확인` 으로 바꿔 골라야 `적합` 이 됩니다. **틀린 시도는 지워지지 않고 로그에 남습니다.**

**4막 — 승인문 그대로만 나간다.** `승인하고 발송` 을 누르면 발행 완료 화면에서
승인문과 발송문의 sha256 두 줄이 같은 값으로 찍히고, 봉인 정보(승인자·수정 사유·모델 버전)가
함께 남습니다. 고객 화면에는 승인한 문장이 그대로 도착합니다.

**5막 — 한 글자만 바꿔도 차단된다.** `npm run tamper` 는 승인문의 `30만원` 을 `50만원` 으로
바꾼 문안을 발송 경로에 밀어 넣습니다. 결과는 **409 + `dispatch_blocked{digest_mismatch}`**.
UI 를 거치지 않은 `curl` 도 같은 응답을 받습니다 — 검증이 화면이 아니라 발송 경로에 있기 때문입니다.

**6막 — 등기번호 하나로 전 과정을 되돌린다.** 고객 화면의 `등기 확인` 을 누르면
접수부터 발송까지의 타임라인이 열립니다. 3막의 오선택과 재판단(`12:53:12` 불일치 →
`12:53:29` 통과)까지 그대로 들어 있습니다. 같은 내용을 API 로 보려면
`curl localhost:3000/api/registry/RG-2026-081-0142`.

## 이 프로토타입이 실제로 보장하는 것

| 불변조건 | 어디서 강제하나 |
|---|---|
| 유효한 승인 없이는 발송 불가 | `POST /api/dispatch` — 409 + `dispatch_blocked{no_valid_approval}` |
| 승인 후 내용이 바뀌면 승인 즉시 무효 | 구절 변경 이벤트 직후 서버가 `approval_invalidated` 를 append |
| 발송문 ≠ 승인문이면 차단 (curl 포함) | 서버가 digest 를 재계산 — 409 + `dispatch_blocked{digest_mismatch}` |
| 등기번호 하나로 전 과정 복원 | `GET /api/registry/[caseId]` — 이벤트 재생 |

전부 `tests/invariants.test.ts` 에서 route handler 를 직접 호출해 검증합니다.
UI 를 거치지 않아도 같은 결과가 나온다는 것이 요점입니다.

실행 결과 그대로 남긴 기록:

| 무엇 | 파일 |
|---|---|
| 불변조건 4 + 승인 게이트 2 + 사유 재선택 4 개별 통과, 전체 57건 통과 | [`docs/evidence-invariants-green.png`](docs/evidence-invariants-green.png) |
| `npm run tamper` — 변조 문안이 409 로 차단되는 전 과정 | [`docs/evidence-tamper-demo.gif`](docs/evidence-tamper-demo.gif) |
| 합성 벤치마크 240건으로 잰 랭킹 성능 (v1/v2 나란히) | [`docs/eval-results.json`](docs/eval-results.json) |
| 실상담 3,000건 표본으로 다시 잰 같은 지표 | [`docs/eval-results-aihub.json`](docs/eval-results-aihub.json) |
| 6막 화면 캡처 5장 + 조작 녹화 2편 | [`verify-shots/`](verify-shots) (`deck-01`~`deck-05`, `gif-01`·`gif-02`) |

`npm run eval` 로 잰 결과에서 한 가지가 분명해졌습니다. **자격 요건이나 불이익 문구를
통째로 지운 초안은 위험 구절이 사라지므로 R 이 오히려 내려갑니다** — R 내림차순 큐만
보면 가장 위험한 누락이 맨 뒤로 밀립니다. 저위험 무작위 표본 레인을 따로 둔 이유가
이것이고, 우리 평가가 우리 설계(표본)의 존재 이유를 실증한 셈입니다.

## 실상담 데이터 트랙 (선택)

합성 20건만으로는 "실제 상담에서도 되나"에 답할 수 없어, AI Hub
「금융분야 고객상담 데이터」(은행 45,000건)로 같은 지표를 다시 잽니다.
**원본은 재배포가 금지되어 저장소에 없습니다** — `data/aihub/` 는 `.gitignore` 이고,
파생 수치만 `docs/` 에 남습니다. 데이터가 없어도 위 6막 데모는 그대로 동작합니다.

```bash
# AI Hub 에서 발급받아 압축을 푼 뒤 data/aihub/ 에 배치하고
npm run aihub:load -- --limit 200 --print   # 파싱 확인
npm run eval -- --aihub                     # → docs/eval-results-aihub.json
npm run aihub:stats                         # 주제별 S/A 티어 비중
npm run seed -- --aihub                     # 실상담 재구성 케이스로 큐 채우기 (배지 전환)
```

실상담 기준 Recall@39 는 25.0% 로 합성 벤치마크(81.3%)보다 훨씬 낮습니다. 낮은 대로
적어 둡니다 — 자동으로 만들 수 있는 레퍼런스는 수치까지이고 조건·누락 판정에는 상품 지식이
필요하다는 뜻이며, 합성 벤치마크가 왜 낙관적이었는지에 대한 직접 증거입니다.

## 구조

```
src/app/                화면 3 + 차단 배너 + 발행 완료 재열람 잠금(sealed-lock.tsx)
src/app/api/            route handlers (전부 runtime = 'nodejs')
src/lib/                db · digest · seal · scoring · coherence · projection
src/lib/static-demo/    브라우저 단독 모드 (WebCrypto + 인메모리 이벤트 로그)
src/fixtures/           합성 상담 20건 + 상품 정본 팩트 + 총량 지표 상수
scripts/seed.ts         DB 초기화 + 이벤트 시드
scripts/tamper-demo.ts  변조 발송 차단 시연
scripts/eval.ts         감지기 랭킹 성능 측정 (--aihub 로 실상담 모드)
scripts/load-aihub.ts   AI Hub 상담 데이터 파서
scripts/aihub-stats.ts  실상담 주제별 티어 비중
tests/                  불변조건 · 사유 재선택 · 학습 신호 · 감지기 회귀 · 해시 동등성
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
캡처 기준 뷰포트는 16:10(1920×1200)이다. 화면은 1920×1200 캔버스에 고정되어 있어
브라우저 창이 그보다 작으면 축소되어 가운데 앉는다 — 캔버스 비율은 창 크기와 무관하다.

`verify-shots/` 의 덱용 캡처는 파일명이 6막 순서와 같다.

```
deck-01-queue.png              1막 · 큐와 R 분해
deck-02-review-mismatch.png    3막 · 사유 불일치로 승인이 잠긴 상태
deck-03-blocked-diff.png       5막 · 차단된 발송 시도문의 붉은 diff
deck-04-registry-timeline.png  6막 · 오선택까지 남은 전체 타임라인
deck-05-dispatched.png         4막 · 해시 2줄 일치 + 고객 수신 화면
gif-01-coherence.gif           3~4막 조작 녹화 (불일치 → 재선택 → 승인)
gif-02-tamper.gif              5막 · npm run tamper 실행 출력
```
