# 답변등기 (Answer Registry) — BUILD SPEC v1.0

> KB AI Challenge 2026 제출용 프로토타입. 팀 삼삼오오.
> 한 줄: AI 상담 초안을 위험 순으로 골라주고, 상담직원이 문장 단위로 판단하면, **승인한 문장 그대로만** 발송되는 은행 내부 검토 콘솔.
> 이 문서가 구현의 단일 정본(single source of truth)이다. 브리프·Figma·PDF 간 충돌은 이 문서의 결정을 따른다.

---

## 0. 정본 결정 사항 (충돌 해소)

| 항목 | Figma | 브리프 | **결정** |
|---|---|---|---|
| 정본 케이스 구절 수 | 7건 (감지 7 · 유지 6 · 수정 1) | 5건, 신호 S·S·A·A·B, R=11 | **5건** (브리프 "숫자 불변" 우선). UI 문구도 "감지 5 · 유지 4 · 수정 1", "5개 구절 중 1개 수정" |
| 큐 정렬 (R 4가 5 위에 있음) | 오정렬 | R 내림차순 | **R 내림차순 엄격 정렬** (5가 4 위) |
| sha256 표시값 | `4f8b2c…9ae13` (장식) | — | **실제 계산된 해시**를 `앞6…뒤5` 형태로 표시 |
| 신뢰도 0.6 표기 (화면2 헤더) | 있음 | — | 유지 (fixture 값) |

R 산식 정의(확정): **R = Σ(발화한 "신호 유형"별 티어 점수)**. 신호 유형(PDF 슬라이드 9 기준):

| 유형 키 | 티어 | 점수 | 이름 |
|---|---|---|---|
| `numeric_change` | S | 3 | 금액·금리·수수료 수치 오류/변경 |
| `exemption_condition` | S | 3 | 면제·부과 조건 누락/변경 |
| `overcertainty` | S | 3 | 확정성 과장 (조건부→단정) |
| `deadline_eligibility` | A | 2 | 기한·계약기간·자격 요건 |
| `disadvantage_omission` | A | 2 | 불이익 사항 누락 (연체·해지 불이익) |
| `procedure_document` | B | 1 | 절차·서류 안내 오류 |

징후 없으면 R=0. R=0 중 일부는 무작위 표본 검토 큐(seed에서 `sampled` 플래그가 아니라 **이벤트로** 표시 — 아래 참조).

---

## 1. 스택 (고정 — 변경 금지)

- Next.js 최신 stable (App Router) + TypeScript + Tailwind CSS
- SQLite via **better-sqlite3** (route handler는 `export const runtime = 'nodejs'`)
- 테스트: **vitest** (`tests/invariants.test.ts`), 스크립트 실행: **tsx**
- 외부 API 키·외부 LLM 호출 **금지**. 네트워크 호출 없음. 모든 데이터 합성(fixture).
- 파일명 영문. UI 텍스트는 한국어. 모든 화면 상단에 배지 상시 노출: **"SYNTHETIC DEMO · 합성 예시 데이터"**
- HMAC 시크릿: `.env.local`의 `SEAL_SECRET` (기본값 fallback `dev-seal-secret-synthetic-demo` — 외부 키 아님, 로컬 상수)

디렉터리:

```
answer-registry/
  src/app/                  # 화면 3 + 차단 배너
  src/app/api/              # route handlers
  src/lib/                  # db, events, digest, seal, scoring, coherence, projection
  src/fixtures/             # 합성 상담 20건 원천 데이터 (ts 모듈)
  scripts/seed.ts           # DB 초기화 + 이벤트 시드
  scripts/tamper-demo.ts    # 차단 시연
  tests/invariants.test.ts  # 불변조건 4
  design-refs/*.png         # Figma 픽셀 레퍼런스 (이미 존재)
  data/demo.db              # 생성물 (gitignore)
```

---

## 2. 핵심 아키텍처

### 2.1 Append-only 이벤트 로그 = 유일한 진실

```sql
CREATE TABLE events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    TEXT NOT NULL,          -- 등기번호 RG-...
  type       TEXT NOT NULL,
  actor      TEXT NOT NULL,          -- 'system' | 'EMP-4471' 등
  ts         TEXT NOT NULL,          -- ISO8601 KST
  payload    TEXT NOT NULL           -- JSON
);
CREATE INDEX idx_events_case ON events(case_id, seq);
```

- **UPDATE/DELETE 금지. 가변 boolean 컬럼 금지.** 다른 테이블 없음(뷰/파생 캐시 없이 재생으로 도출).
- 이벤트 타입(정확히 이 12개): `draft_created` / `signals_detected` / `review_started` / `sentence_kept` / `sentence_edited` / `reason_selected` / `coherence_checked` / `approved` / `approval_invalidated` / `dispatch_attempted` / `dispatch_blocked` / `dispatched`
- payload 예:
  - `draft_created`: `{ product, inquiry, receivedAt, model: "KB-FAQ-2026-06", modelVersion: "v3.4.2", confidence, sentences: [{ idx, text, flagStart, flagEnd }] }` (flagStart/End = 하이라이트 구간 오프셋, 신호 없으면 null)
  - `signals_detected`: `{ signals: [{ sentenceIdx, type, tier, score, label, evidence }], r }`
  - `signals_detected` (표본): `{ signals: [], r: 0, sampled: true }` — R=0 표본 선정도 이벤트로 기록
  - `sentence_kept`: `{ sentenceIdx }`
  - `sentence_edited`: `{ sentenceIdx, newText }`
  - `reason_selected`: `{ sentenceIdx, reason }`  — reason ∈ 아래 6종
  - `coherence_checked`: `{ sentenceIdx, reason, diffKind, result: "pass" | "mismatch", detail }`
  - `approved`: `{ versionId, contentDigest, approver, team, reason, modelVersion, sealedAt, seal }` (seal = HMAC hex)
  - `approval_invalidated`: `{ invalidatedApprovalSeq, cause: "content_changed" }`
  - `dispatch_attempted`: `{ contentDigest, via: "ui" | "api" }`
  - `dispatch_blocked`: `{ reason: "no_valid_approval" | "digest_mismatch" | "seal_invalid", expectedDigest?, actualDigest? }`
  - `dispatched`: `{ contentDigest, versionId, dispatchedAt }`

### 2.2 상태 도출 (projection) — `src/lib/projection.ts`

`replay(caseId)` → 이벤트 순차 적용으로 파생:
- 각 구절의 현재 텍스트/판정(미판정 | 유지 | 수정)/사유/정합성 결과
- 케이스 상태: `검토 대기 | 검토 중 | 검토 완료 | 표본 검토 | 발행 완료 | 차단`
- **유효 승인**: 마지막 `approved` 이후에 `sentence_kept/sentence_edited/approval_invalidated`가 없어야 유효
- 승인문(approved content) = 승인 시점 기준 각 구절의 최종 텍스트를 `"\n"`으로 join

**승인 이후 내용 변경 API가 호출되면**: `sentence_edited`(또는 `sentence_kept` 변경) 이벤트 append 직후 서버가 `approval_invalidated` 이벤트를 append. (불변조건 2)

### 2.3 digest & HMAC 봉인 — `src/lib/digest.ts`, `src/lib/seal.ts`

```
contentDigest = sha256hex( NFC(content).replaceAll("\r\n", "\n") )
seal = HMAC_SHA256( SEAL_SECRET,
        caseId + "‖" + versionId + "‖" + contentDigest + "‖"
        + approver + "‖" + reason + "‖" + modelVersion + "‖" + ts )
versionId = contentDigest 앞 12 hex  (내용 주소 기반)
```
- reason = 수정 구절 사유들을 `,` join (수정 0건이면 `"none"`)
- 승인 조건(서버 강제): 모든 감지 구절 판정 완료 **AND** 수정 구절 전부 사유 선택 + 정합성 pass. 하나라도 미충족 → 422, `approved` 이벤트 없음. **무응답 타임아웃 자동 승인 로직은 어떤 형태로도 두지 않는다.**

### 2.4 발송 API 검증 (불변조건 1·3)

`POST /api/dispatch` body: `{ caseId, content }` — UI든 curl이든 동일 경로.
1. `dispatch_attempted` append
2. replay로 유효 승인 조회 → 없으면 **409** + `dispatch_blocked{reason:"no_valid_approval"}`
3. 서버에서 `digest(content)` 재계산 → 봉인의 contentDigest와 불일치 → **409** + `dispatch_blocked{reason:"digest_mismatch"}`
4. 봉인 HMAC 재계산·비교 → 불일치 → **409** + `dispatch_blocked{reason:"seal_invalid"}`
5. 통과 시 `dispatched` append, 200

### 2.5 사유↔수정 정합성 — `src/lib/coherence.ts` (규칙 기반, LLM 아님)

사유 6종(원탭): `조건 누락` `수치 오류` `확정성 과장` `자격 미확인` `불이익 누락` `절차·서류 오류`

diff 분류(`classifyDiff(oldText, newText)` → diffKind 집합):
- `number_changed`: 숫자 토큰(정규식 `[0-9][0-9,.]*`) 집합이 달라짐
- `condition_added`: 조건 표지가 추가됨 (`단,` / `경우` / `조건` / `~만` / `한하여` / `이내` / `이후` / `전에` 등 신규 등장)
- `assertion_softened`: 단정 표현 완화 (`입니다/됩니다/합니다` → `일 수 있습니다/될 수 있습니다/확인 후 안내` 또는 `반드시/즉시/무조건` 삭제)
- `verification_added`: 확인 안내 추가 (`확인이 필요` / `확인해 주시기` / `확인 후` / `문의` 신규 등장)
- `benefit_risk_added` / `procedure_fixed`: 불이익 문구 추가 / 절차·서류 표현 변경

매칭 테이블 (불일치 시 승인·발송 불가):

| 사유 | 요구 diffKind |
|---|---|
| 수치 오류 | number_changed |
| 조건 누락 | condition_added |
| 확정성 과장 | assertion_softened |
| 자격 미확인 | verification_added |
| 불이익 누락 | benefit_risk_added 또는 condition_added |
| 절차·서류 오류 | procedure_fixed 또는 number_changed |

`coherence_checked` 이벤트로 결과 기록. mismatch면 UI에 "불일치 · 사유 재선택" 표시(화면2 우측 하단 카드와 동일).

### 2.6 위험 신호 감지 — `src/lib/scoring.ts` (규칙 기반)

fixture 문장에 신호를 미리 주석하지 말고, **감지기가 규칙(키워드/정규식)으로 찾는 구조**로: 예) 숫자+단위(`만원|%|회|개월`) → numeric 계열, `한하여|면제|비과세` → exemption, `불가|불이익|해지` → disadvantage, `서류|발급분|제출` → procedure, `전에 가입|대상|자격` → eligibility, `반드시|무조건|즉시.*됩니다` → overcertainty. 감지 결과가 정본 케이스에서 정확히 S·S·A·A·B, R=11이 나오도록 규칙과 문장을 함께 튜닝한다(테스트로 고정). seed는 감지기 실행 결과를 `signals_detected`로 기록.

---

## 3. API 라우트

| 메서드/경로 | 역할 |
|---|---|
| `GET /api/cases` | 큐: R 내림차순 + 저위험 표본 목록 + KPI |
| `GET /api/cases/[caseId]` | 구절·신호·판정 현황·이벤트 (replay 결과) |
| `POST /api/cases/[caseId]/review-start` | `review_started` |
| `POST /api/cases/[caseId]/sentences/[idx]/keep` | `sentence_kept` (+승인 후면 invalidate) |
| `POST /api/cases/[caseId]/sentences/[idx]/edit` | body `{newText}` → `sentence_edited` (+invalidate) |
| `POST /api/cases/[caseId]/sentences/[idx]/reason` | body `{reason}` → `reason_selected` + 즉시 `coherence_checked` |
| `POST /api/cases/[caseId]/approve` | 검증 후 `approved` (봉인 생성). 미충족 422 |
| `POST /api/dispatch` | §2.4 |
| `GET /api/registry/[caseId]` | 이벤트 재생 → 원문·수정·사유·승인자·봉인 복원 (불변조건 4의 API) |

actor는 로그인 없이 상수 `EMP-4471 / 고객센터 1팀` 사용.

---

## 4. 화면 (design-refs/*.png 픽셀 기준)

공통: 1920 데스크톱 기준. 상단 chrome 바(타이틀 `답변등기 · <화면명>`, 우측 `2026-07-23 14:32 | 상담원 EMP-4471` + **SYNTHETIC DEMO · 합성 예시 데이터** 배지). 색은 PNG에서 샘플링(KB 옐로 계열 포인트, 티어 칩: S=적색계, A=황색계, B=녹색계 — screen-01 참조).

### 4.1 `/` 발행 대기 (screen-01-queue.png)
- KPI 4: `오늘 AI 초안 1,248건` `개입 필요 27건 (2.2%)` `저위험 무작위 표본 12건` `검토 대기 39건` + 우측 R 산식 카드("R = Σ(영향 티어 점수 × 의심 신호 발화 여부) · 징후 없으면 0점")
- 큐 테이블: R | 감지 신호(티어 칩 나열) | 등기번호 | 접수 | 상품 | 문의 요지 | 상태. R 내림차순, 1위 행(정본 케이스) 좌측 강조 바.
- 하단 "저위험 무작위 표본" 섹션: R=0 행들, 상태 `표본 검토`.
- 행 클릭 → 신호 분해 패널(유형·티어·점수·근거 구절) 노출 후 `/review/[caseId]` 이동.

### 4.2 `/review/[caseId]` 검토 (screen-02-review.png)
- 헤더 아래: `AI 초안 — 감지된 구절 5건` / `KB-FAQ-2026-06 · 신뢰도 0.6`
- 좌측(≈1000px): 구절 리스트 — 티어 칩 + 문장(신호 구간 하이라이트 칩) + 우측 `유지`/`수정` 토글. 수정 선택 시 인라인 textarea.
- 카운터 줄: `감지 5 · 유지 n · 수정 m` + 우측 경고문 `미판정이 남아 있으면 발송할 수 없습니다`
- `수정 문안` diff 블록: − 원문 / + 수정문
- `발송 문안` 미리보기(최종 join 결과) + `승인 대기` 라벨
- 우측 패널 `판단하기`: 선택 구절 신호 분해(`A × 2` 등) → `수정 사유 설명` 원탭 6버튼(2열) → `사유 ↔ 실제 수정 적합성 검사` 결과 카드(적합 ✓ / 불일치 ! "문구 추가만 있고 수치 변경 없음" 류 상세) → 하단 `승인하고 발송`(모든 판정 완료+정합성 pass 전까지 disabled) / `보류`
- `승인하고 발송` = approve API → 성공 시 dispatch API(승인문 그대로) → `/done/[caseId]`

### 4.3 `/done/[caseId]` 발행 완료 (screen-03-verify.png)
- 좌측: `문장 대조 — 발송 직후 자동 실행`: ① 승인문 박스+`sha256 xxxxxx…xxxxx` ② 실제 발송문 박스+해시 → `✓ 일치` 카드(비교 소요 `00:00.4` 우측) → `불일치 시 발송 차단` 안내 카드(`오늘 차단 1건` 우측) → `봉인 정보` 카드(봉인 시각 / 승인자 EMP-4471 · 고객센터 1팀 / 수정 사유 `자격 미확인 (원탭)` / 적합성 검사 `적합 · 통과`) + 하단 캡션 `봉인 대상 = 승인문 + 수정 사유 + 승인자 + 모델 버전` → `오늘 발행 결과` KPI 4(발행 1,248 / 사람 개입 27 / 무작위 표본 12 / 발송 차단 1)
- 우측: `고객 수신 화면` — KB 앱 목업(고객 말풍선 "제가 1월 31일 전역인데 한도 늘리고 바로 입금하면 되나요?", 상담원 답변 = 발송문, `등기` 카드: 등기번호 + "답변등기로 발행되었습니다" + `등기 확인` 버튼) + 등기 조회 패널(`발행 등기 RG-2026-081-0142`, 모델·버전 `KB-FAQ-2026-06 / v3.4.2`, 개입 필요도 `R 11`, 판단 `5개 구절 중 1개 수정`, 검토 소요 `02:41`, 조회 이력 `0회`)

### 4.4 차단 상태 (409 배너)
- `/done/[caseId]`에서 해시 불일치·차단 발생 시(= tamper 이후 재방문 또는 dispatch 409 응답): 상단 전폭 적색 배너 `409 DISPATCH BLOCKED — 발송문이 승인문과 다릅니다. 발송이 차단되었습니다.` + 기대/실제 digest 대조 + `dispatch_blocked` 이벤트 표시. tamper-demo 실행으로 재현 가능해야 함.

---

## 5. 데모 정본 케이스 (숫자 불변)

`RG-2026-081-0142` · KB장병내일준비적금 · 접수 12:51 · 문의 요지 "비과세 저축한도 20→30만원 변경 · 급여공제" · confidence 0.6

구절 5건 (신호 S·S·A·A·B, R = 3+3+2+2+1 = 11):

| # | 티어 | 신호 유형 | 문장 (— 하이라이트 구간 —) |
|---|---|---|---|
| 1 | S | numeric_change | 한 은행의 월 저축한도는 최고 30만원이며, —매월 30만원 이하— 금액을 만기일 전일까지 저축 가능합니다. |
| 2 | S | exemption_condition | 위 계좌는 —1회에 한하여— 비과세저축 한도 변경이 가능합니다. |
| 3 | A | deadline_eligibility | —25년 1월 1일 전에 가입한 계좌—만 변경이 가능합니다. |
| 4 | A | disadvantage_omission | —조기전역 · 신분전환 · 금융소득종합과세 대상—의 경우 비대면 해지가 불가합니다. |
| 5 | B | procedure_document | 해지 시 제출 서류는 —3개월 이내 발급분—이어야 합니다. |

데모 판정: 1·2·3·5 유지, **4 수정** (사유: `자격 미확인`) →
수정문: `조기전역 · 신분전환 · 금융소득종합과세 대상의 경우 비대면 해지가 불가합니다. 고객님이 해당 대상인지는 확인이 필요하니, 전역 예정일과 신분 전환 여부를 먼저 확인해 주시기 바랍니다.` (diffKind: verification_added → 적합)

타임라인(seed 고정): draft_created 12:49:00 → signals_detected 12:49:00 → review_started **12:51:31** → 판정 이벤트들 → approved(봉인) **12:54:12** (검토 소요 **02:41**) → dispatched 12:54:12. KST 2026-07-23.

KPI fixture: 초안 1,248 / 개입 필요 27 (2.2%) / 표본 12 / 검토 대기 39 / 차단 1. 모델 `KB-FAQ-2026-06 / v3.4.2`. (1,248 등 큐 밖 총량은 `src/fixtures/stats.ts` 상수 — 20건 seed에서 파생 불가한 수치임을 주석으로 명시)

---

## 6. 합성 상담 20건 seed (`src/fixtures/cases.ts` + `scripts/seed.ts`)

Figma 큐 행 그대로 포함(정렬은 R 내림차순으로 교정):

| R | 신호 | 등기번호 | 접수 | 상품 | 문의 요지 | 상태 |
|---|---|---|---|---|---|---|
| 11 | S·S·A·A·B | RG-2026-081-0142 | 12:51 | KB장병내일준비적금 | 비과세 저축한도 20→30만원 변경 · 급여공제 | 검토 대기(데모에서 진행) |
| 8 | S·S·A | RG-2026-081-0139 | 14:05 | KB장병내일준비적금 | 만기 비대면 해지 조건 · 자격 제외 대상 | 검토 대기 |
| 7 | S·A·A | RG-2026-081-0128 | 13:41 | 주택청약종합저축 | 연간 소득공제 한도 · 무주택 요건 | 검토 대기 |
| 6 | S·S | RG-2026-081-0121 | 13:20 | ELS 제12,340회차 | 조기상환 평가일 · 낙인 조건 | 검토 중 |
| 5 | A·A·B | RG-2026-081-0104 | 12:38 | KB국민카드 프리미엄 | 연회비 면제 조건 | 검토 대기 |
| 4 | S·B | RG-2026-081-0117 | 13:02 | KB더블모아예금 | 중도해지 이율 · 만기 후 이율 | 검토 대기 |
| 3 | A·B | RG-2026-081-0098 | 12:11 | KB주택담보대출 | 중도상환수수료 면제 조건 | 검토 완료 |
| 2 | B·B | RG-2026-081-0091 | 11:54 | 청년희망적금 | 우대금리 적용 요건 | 검토 완료 |
| 0 | 표본 | RG-2026-081-0083 | 11:30 | KB Star 정기예금 | 금리 조회 | 표본 검토 |
| 0 | 표본 | RG-2026-081-0077 | 11:02 | 입출금통장 | 이체한도 변경 절차 | 표본 검토 |

- +1건: `RG-2026-081-0135` — approved 후 변조 시도 이력(dispatch_attempted → dispatch_blocked{digest_mismatch}) 보유 → 상태 `차단`, KPI 차단 1의 근거.
- 나머지 9건: R=0 일반(발행 완료 또는 대기) 케이스로 채워 총 20건. 문장은 각 상품에 맞는 합성 한국어 2~5문장(장병내일준비적금 수치는 실제 제도와 일치: 은행별 월 30만원 · 개인 합산 55만원 · 비과세 · 1인 2계좌).
- 각 케이스의 신호는 §2.6 감지기 실행 결과로 기록하며, 위 표의 R·신호 조합이 정확히 재현되도록 문장을 작성한다. 신호 조합은 서로 다른 유형이어야 함(같은 유형 2회는 R에 1회만 가산됨에 주의 — 예: R=6 케이스는 numeric_change + overcertainty).
- seed 실행: DB 파일 삭제 후 재생성 → 이벤트만 INSERT. `npm run seed`.

---

## 7. 테스트 — `tests/invariants.test.ts` (전부 green이어야 완료)

vitest + 임시 DB(테스트별 격리). route handler 함수를 직접 import해 `Request`를 만들어 호출(“API 직접 호출” = UI 미경유 검증).

1. **유효한 승인 없이 발송 불가**: 승인 이벤트 없는 케이스에 dispatch → 409, `dispatch_blocked{no_valid_approval}` 기록 확인
2. **승인 후 내용 변경 시 승인 즉시 무효**: approve → sentence edit API → `approval_invalidated` 존재 + 이후 dispatch 409
3. **발송문 ≠ 승인문이면 409 (API 직접 호출 포함)**: approve → 원문에서 1글자(또는 `30만원`→`50만원`) 바꾼 content로 dispatch → 409 + `dispatch_blocked{digest_mismatch}`; 동일 content NFC/CRLF 변형은 정규화로 **통과**해야 함(정규화 검증)
4. **등기번호 하나로 이벤트 재생 → 복원 일치**: 정본 케이스 전체 플로우 실행 후 `GET /api/registry/RG-2026-081-0142` 결과의 원문 5문장·수정문·사유(자격 미확인)·승인자(EMP-4471)가 fixture와 일치

추가(보너스, 시간 되면): 정합성 mismatch 시 approve 422, 미판정 존재 시 approve 422.

## 8. `scripts/tamper-demo.ts`

콘솔 데모: ① seed 확인 ② 정본 케이스 승인 상태 출력(봉인 정보) ③ 변조 content로 `/api/dispatch` 호출(실행 중인 dev 서버에 fetch, 없으면 handler 직접 호출) → **409 응답과 dispatch_blocked 이벤트를 그대로 출력** ④ "UI를 거치지 않은 curl도 동일 차단" 안내와 함께 예시 curl 명령 출력.

## 9. README.md

설치 3줄 / 실행 1줄(`npm run dev` — 필요 시 predev로 seed 자동) / 테스트 1줄 / 데모 시나리오 6스텝:
1. `npm run seed` → `npm run dev` 접속
2. 발행 대기: R=11 정본 케이스 확인(신호 분해)
3. 검토: 4번 구절 수정 + 사유 `자격 미확인` 원탭 → 정합성 `적합`
4. 승인하고 발송 → 발행 완료 화면(해시 일치·봉인 정보)
5. `npx tsx scripts/tamper-demo.ts` → 409 차단 재현
6. 등기 조회(`/api/registry/RG-2026-081-0142`)로 이벤트 재생 복원 확인

## 10. 만들지 않는 것

로그인/권한, 실제 LLM 연동, 실채널 발송, 딥러닝·RAG, 관리자 설정 화면, 타임아웃 자동 승인(어떤 형태로도 금지).
