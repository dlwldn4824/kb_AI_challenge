# WORKPLAN_FINAL — 제출 전 최종 작업 지시서 (2026-07-31)

> 이 문서는 Claude Code 실행용 정본 지시서다. 위에서 아래 순서로 수행한다.
> 각 태스크 완료 시 반드시 [기록 규칙](#기록-규칙)을 따른다.
> 마감: 8/2(일) 캡처·클린 재현 완료 → 8/3(월) 오전 제출.

## 절대 원칙 (모든 태스크에 우선)

1. 정본 케이스 불변: RG-2026-081-0142 = 구절 5건, 신호 S·S·A·A·B, R=11(3+3+2+2+1),
   수정 1건(사유: 자격 미확인), 검토 소요 02:41. 큐 전체 R 값도 불변.
   `tests/scoring-regression.test.ts` 가 이를 강제한다 — 깨지면 코드가 틀린 것.
2. 결과 조작 금지: eval 수치는 낮으면 낮은 대로 기록한다. 개선 폭 자체가 서사다.
3. 게이트는 결정론 유지: 승인·발송 경로에 모델/확률적 로직 추가 금지.
   무응답 자동 승인(타임아웃 auto-approve) 절대 금지.
4. 외부 API·LLM 호출 금지. 파일명 영문. SYNTHETIC 배지 유지.
5. AI Hub 원본 데이터는 git/zip에 절대 포함하지 않는다 (`data/aihub/` 는 .gitignore).

---

## Phase 1 — P0 문구·논리 수정 (오늘, 즉시)

### T1. 층위 문구 수정 (치명 이슈 해소)
- 대상: 큐 하단 압축 문장 + 우측 분석 패널 하단 (src/app 큐 화면, `src/fixtures/stats.ts` 문구 포함 여부 확인)
- 기존: "1,248건 중 사람이 볼 39건을 시스템이 고릅니다."
- 변경: **"1,248건 전부, 승인 없이는 나가지 않습니다. 시스템은 그중 깊게 볼 39건을 먼저 보여줍니다."**
- 이유(주석으로 남길 것): 전 건 승인 원칙(게이트)과 선별 명제의 충돌 해소 —
  검토의 유무가 아니라 깊이를 배분한다.

### T2. 숫자·라벨 정합 4건
1. 발행 완료·차단 화면 하단 스트립: "오늘 발행 1,248" → "오늘 초안 1,248 · 사람 개입 27 · 무작위 표본 12 · 발송 차단 1"
2. 큐 캡션 "개입 필요 9건 · 표본 2건" → "현재 목록 9건 · 표본 2건"
3. 등기 조회 타임라인: 유지 4건 타임스탬프 분산 (12:52:08 / 12:52:19 / 12:52:26 / 12:52:47)
4. 차단 화면(0135) 헤더 "봉인 유효" → "봉인 유효 · 발송 차단". 해당 화면의
   "등기 조회·이벤트 재생" 버튼이 동작하는지 확인 — 마지막 이벤트가 붉은
   dispatch_blocked 로 끝나는 타임라인이 열려야 한다.

**완료 기준**: `npx vitest run` 전부 green + 위 문구가 렌더링된 스크린샷.

---

## Phase 2 — AI 배치 원칙 구현 (오늘)

> 원칙: "되돌릴 수 있는 곳(감지·선별·설명)엔 AI를, 되돌릴 수 없는 곳(승인·발송)엔 결정론을."
> 이 문구를 README 와 docs/BUILD_SPEC.md 에 추가한다.

### T3. 정본 대조 UI 블록 (XAI 2층 설명)
- 위치: 검토 화면 우측 "판단하기" 패널 아래
- 내용: 선택된 구절 ↔ `src/fixtures/product-facts.ts` 의 정본 팩트를 나란히 표시,
  어긋난 토큰 하이라이트. 새 계산 로직 없음 — 감지기 v2 팩트 대조 결과의 UI 노출.
- 라벨 구조: 위층 "법 근거 (티어 S · 금소법 위계 — 고정)", 아래층 "감지 근거 (정본 대조 — 학습 가능)"

### T4. 학습 신호 이벤트
- `src/lib/events.ts` 에 `learning_signal_saved` 이벤트 추가 — approved 직후 발행.
  payload: { caseId, sentenceCount, editCount, reasons[], tierCounts }
- 등기 조회 타임라인에 한 줄 노출: "판단 레이블 저장 · 감지기 개선 데이터"
- `tests/invariants.test.ts` 재생(replay) 테스트가 이 이벤트 포함해도 green 인지 확인.

### T5. 감지기 버전 라벨
- 검토 화면 헤더의 모델 표기 옆에 감지기 버전 병기: "감지기 rule-v2 (fact·omission)"
- `src/lib/scoring.ts` 상단에 DETECTOR_VERSION 상수로 관리.

---

## Phase 3 — Eval v2 완결 (오늘~내일 오전)

### T6. 감지기 v2 + eval 재실행
- eval-builder 가 진행 중인 v2 (팩트 대조·누락 감지·상투구 오탐 제외)를 머지.
- `npm run eval` 재실행 → `docs/eval-results.json` 에 **v1/v2 나란히** 기록:
  { detector, recall_at_39, precision_at_39, by_error_type: {단정삽입, 수치바꿔치기, 조건삭제, ...} }
- 유형별 분해 필수 (v1: 단정 8/8, 수치 0/8, 삭제형 ~0 이 기록에 남아야 함).
- 삭제형 오류에서 R이 내려가는 현상은 **무작위 표본의 존재 근거**로
  docs/WORKLOG.md 와 README 한 줄에 명시: "우리 평가가 우리 설계(표본)의 존재 이유를 실증했다."

### T7. 덱용 정량 차트 데이터
- `scripts/eval.ts` 출력에 마크다운 표 형태 추가 (덱 12-5 제작용).
- 무작위 baseline 은 1,000회 평균 유지.

---

## Phase 4 — AI Hub 실데이터 트랙 (내일, P0 완료 후에만)

> 데이터셋: AI Hub 「금융분야 고객상담 데이터」(dataSetSn=71926, 305MB, 2025,
> 하나은행·하나손보·하나증권 실상담 기반). 발급은 사람(팀)이 수동으로 진행.
> 라이선스: 원본 재배포 금지 — 파생 수치·차트만 repo 에 포함.

### T8. 이중 트랙 로더
- `scripts/load-aihub.ts` 신규: `data/aihub/` 에 사용자가 배치한 json 을 파싱해
  은행 분야 라벨링 데이터에서 (질문, 모범답변, 주제) 추출 → 내부 스키마로 변환.
- `data/aihub/` 를 .gitignore 에 추가. 파일이 없으면 명확한 안내 메시지 출력 후 종료
  (기본 데모는 합성 20건으로 항상 동작해야 함 — 클린 재현 불변).

### T9. 실데이터 기반 평가셋 확장
- `scripts/eval.ts` 에 `--aihub` 모드: 모범답변을 정본으로 삼고 오류 주입
  (수치 바꾸기 / 조건 삭제 / 단정화 / 불이익 누락 / 절차 오류 — 기존 6유형 재사용)
  → 실상담 기반 평가셋 생성 → v2 Recall@39 / Precision@39 산출.
- 결과는 `docs/eval-results-aihub.json` 별도 저장 (합성 결과와 섞지 않는다).

### T10. 실데이터 통계 1장
- `scripts/aihub-stats.ts` 신규: 은행 상담 주제 분포에서 S/A 티어 영역
  (수치·이자/연체·한도·만기/해지·자격) 비중 % 산출 → 콘솔 표 + json.
- 용도: 덱 "실제 은행 상담의 N%가 금소법 민감 영역" 한 줄.
- UI: `--aihub` 모드로 seed 했을 때만 배지를 "AI Hub 실상담 기반 재구성"으로 전환.

---

## Phase 5 — 증거물 캡처 (8/1~8/2)

### T11. 덱용 캡처 5 + GIF 2 (verify-shots/ 에 저장, 파일명 고정)
1. `deck-01-queue.png` — 큐 전체 (우측 R=11 분해 패널 + 수정된 압축 문장 포함)
2. `deck-02-review-mismatch.png` — 정합성 불일치 상태 (붉은 박스 + 비활성 승인 버튼)
3. `deck-03-blocked-diff.png` — 차단 화면 (붉은 diff "서류 없이도 즉시 처리됩니다")
4. `deck-04-registry-timeline.png` — 등기 조회 모달 (실수 기록 12:53:29 포함 전체)
5. `deck-05-dispatched.png` — 발행 완료 (해시 2줄 일치 + 고객 화면)
- GIF: `gif-01-coherence.gif` (사유 불일치→재선택→적합→승인),
  `gif-02-tamper.gif` (변조→409 차단, 기존 evidence-tamper-demo.gif 갱신)
- 캡처 전 체크: 에러 토스트 없음, 브라우저 높이 조절로 하단 여백 최소화,
  0142 상태 "검토 대기" 버전 사용.

### T12. README 최종화
- 데모 시나리오를 6막으로 갱신 (변조→차단, 등기 조회 포함).
- "AI 배치 원칙" 2줄, "만들지 않은 것" 섹션, AI Hub 트랙 안내
  ("발급 후 data/aihub/ 에 배치 → npm run eval -- --aihub") 추가.

---

## Phase 6 — 제출 준비 (8/2)

### T13. 클린 재현 테스트
- 새 임시 폴더에 git archive 로 추출 → `npm install && npm run dev` → 6막 데모 재현
  → `npx vitest run` green → `npm run eval` 동작. 실패 시 원인 수정 후 재시도.
- 결과를 docs/WORKLOG.md 에 기록 (시각·환경·결과).

### T14. zip 패키징 체크
- 포함: 소스, README, docs/(BUILD_SPEC, eval-results*.json, WORKLOG, 캡처·GIF)
- 제외: node_modules, .next, out/, data/*.db, data/aihub/, .env.local, .DS_Store, tsconfig.tsbuildinfo
- zip 내부에 AI Hub 원본이 없는지 최종 grep 확인.

---

## 기록 규칙

1. **docs/WORKLOG.md** (append-only, 없으면 생성). 각 태스크 완료마다 추가:
   ```
   ## [T번호] 제목 — YYYY-MM-DD HH:MM
   - 변경: (파일 목록 + 한 줄 요약)
   - 이유: (왜 — 특히 문구 변경은 반드시)
   - 증거: (스크린샷/테스트 출력/eval json 경로)
   - 테스트: vitest N passed / eval 수치
   ```
2. 커밋은 태스크 단위로: `T1: queue copy — depth not existence` 형식.
3. eval 결과는 덮어쓰지 말고 v1/v2/aihub 를 모두 보존 (개선 곡선이 서사다).
4. 판단이 필요한 모호점이 생기면 임의로 결정하지 말고 docs/WORKLOG.md 에
   `[QUESTION]` 항목으로 남기고 다음 태스크로 진행한다.
