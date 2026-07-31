# WORKLOG — append-only 작업 기록

> WORKPLAN_FINAL.md 기록 규칙에 따른 태스크 단위 기록. 위에서 아래로 시간순.
> T1·T2는 WORKPLAN 채택(2026-07-31 15:25) 이전에 완료·배포된 작업의 소급 기록이다.

## [T1] 층위 문구 수정 — 2026-07-31 15:00 (소급)
- 변경: `src/app/queue-console.tsx` — 분석 패널 하단을 2줄 층위 문구("1,248건 전부, 승인 없이는 나가지 않습니다. / 시스템은 그중 깊게 볼 39건을 먼저 보여줍니다.")로 교체, 구 문구("사람이 볼 39건을 시스템이 고릅니다") 전 저장소에서 제거. `src/fixtures/stats.ts`에는 해당 문구 없음 확인.
- 이유: 전 건 승인 원칙(게이트)과 선별 명제의 충돌 해소 — 검토의 유무가 아니라 깊이를 배분한다. 코드 주석으로 동일 취지 기록됨. 위치가 1곳인 것은 대시보드 개편 때 큐 하단 문장이 분석 패널 하단으로 통합됐기 때문(같은 사실을 한 화면에서 2회 말하지 않는 규약).
- 증거: `verify-shots/v2-01-queue.png`, 커밋 2748e28
- 테스트: vitest 48 passed / 구 문구 검색 0건

## [T2] 숫자·라벨 정합 4건 — 2026-07-31 14:40 (소급)
- 변경: ① `done-screen.tsx` 하단 스트립 "오늘 초안 1,248 · 사람 개입 27 · 무작위 표본 12 · 발송 차단 1" ② `queue-console.tsx` 캡션 "현재 목록 9건 · 표본 2건" ③ `src/lib/clock.ts` 유지 이벤트 시각 분산(12:52:08/19/26/47, 검토 소요 02:41 불변) ④ `done-screen.tsx` sealLabel — 차단 케이스 "봉인 유효 · 발송 차단" 병기, 등기 조회 버튼 동작 및 붉은 dispatch_blocked 종결 타임라인 Playwright 실증.
- 이유: 큐 KPI와 라벨 계열 통일(①), 전체 27건 vs 목록 9건 기준 혼동 해소(②), 동일 초 4건의 비현실성 제거(③), 봉인과 발송 상태의 층위 분리(④).
- 증거: `verify-shots/v2-08-blocked-timeline.png`, 커밋 162d08b
- 테스트: vitest 48 passed

## [T5] 감지기 버전 라벨 — 2026-07-31 15:29
- 변경: `src/lib/scoring.ts` — `DETECTOR_VERSION = 'rule-v2 (fact·omission)'` 상수 신설. `src/app/review/[caseId]/review-console.tsx` — 검토 화면 헤더 우측 모델 표기 옆에 "감지기 rule-v2 (fact·omission)" 병기(모델 · 감지기 · 신뢰도 순).
- 이유: 같은 초안이라도 어떤 규칙 세트가 판정했는지에 따라 신호가 달라진다. 모델 버전만 적어 두면 감지기 v1/v2 결과를 사후에 구분할 수 없다. 규칙을 고칠 때 이 상수를 올리는 것으로 판정 이력을 추적한다.
- 증거: 검토 화면 헤더 렌더, `npm run build` exit 0
- 테스트: vitest 48 passed

## [T4] 학습 신호 이벤트 — 2026-07-31 15:35
- 변경: `src/lib/events.ts` — `learning_signal_saved` 타입 + `LearningSignalSavedPayload { caseId, sentenceCount, editCount, reasons[], tierCounts }` 추가(이벤트 12종 → 13종). `src/lib/learning-signal.ts` 신설 — payload 조립 순수 함수. `src/lib/actions.ts` `approveCase` 와 `src/lib/static-demo/store.ts` `approveCase` 가 approved 직후 같은 payload 를 append. `src/lib/clock.ts` — 정본 케이스 고정 시각 12:54:12. `src/app/done/[caseId]/registry-timeline.tsx` — "판단 레이블 저장 · 감지기 개선 데이터" 한 줄. `docs/BUILD_SPEC.md` §2.1 — 13개로 갱신 + payload 정의(+ confirmedHits 정의 누락분 보강).
- 이유: 사람이 무엇을 유지하고 무엇을 고쳤는지가 승인 시점에 확정된다. 그 판정이 감지기 개선의 유일한 레이블 소스인데 지금은 어디에도 남지 않았다. 서버·정적 두 모드가 같은 payload 를 내도록 조립을 순수 함수 하나로 모았다.
- 게이트 영향 확인: projection 의 `approvalStale` 은 `sentence_kept`·`sentence_edited`·`approval_invalidated` 3종에서만 켜지고, switch 의 `default: break;` 가 나머지를 무시한다. 따라서 approved 뒤에 이 이벤트가 쌓여도 승인은 유효하고 발송도 통과한다 — 테스트로 고정.
- 증거: seed 이벤트 69 → 76건(approved 7 · learning_signal_saved 7), `src/lib/static-demo/seed-events.json` 재출력, `npm run build` / `npm run build:static` exit 0
- 테스트: vitest 53 passed (신규 `tests/learning-signal.test.ts` 5건 — payload 값·approved 직후 순서·승인 무효화 없음·발송 통과·seed 기승인 케이스 재현)

## [T3] 정본 대조 UI 블록 (XAI 2층) — 2026-07-31 15:44
- 변경: `src/lib/scoring.ts` — `compareSentenceToFacts()` 분리(일치·불일치를 모두 돌려줌)하고 `detectFactMismatches()` 가 이 함수를 쓰도록 정리. `src/app/ui.tsx` — `TIER_BASIS` 맵 추가. `src/app/review/[caseId]/review-console.tsx` — 우측 판단하기 패널 아래에 "정본 대조" 섹션 추가(위층 법 근거 = 티어·고정 / 아래층 감지 근거 = 정본 대조·학습 가능).
- 이유: 감지기 v2 는 이미 상품 정본 팩트와 초안을 대조하고 있는데 그 결과가 화면 어디에도 없었다. 검토자가 "왜 이 구절이 걸렸나"를 R 점수 하나로만 봐야 했다. 2층으로 나눈 것은 무엇이 고정된 법 위계이고 무엇이 규칙 개선으로 달라질 수 있는 판단인지 구분해 보여 주기 위해서다.
- 새 계산 없음: 화면은 감지 경로와 같은 함수(`compareSentenceToFacts`)를 호출한다. 리팩터 후 `npm run eval` 결과 JSON 이 직전 커밋과 완전 동일함을 확인해 판정이 안 바뀐 것을 증명했다.
- 법 근거 문구에 조문 번호를 넣지 않았다. 합성 데모 화면에 확인되지 않은 금소법 조항 번호를 박으면 그 자체가 사실 오류가 되므로 의무의 성격만 서술했다(코드 주석에도 기록).
- UI 규약 준수: 옐로 0(티어 칩 정본색 + 중립/ok/danger만), 라운드 6px 1단, 카드 안 카드 없음(패널 직속 섹션 + 헤어라인 행 구분), 한글 `.ko` keep-all, 수치는 mono·tabular.
- 증거: `verify-shots/t3-fact-comparison.png`(일치 — 정본 30 · 초안 30), `verify-shots/t3-fact-comparison-mismatch.png`(불일치 — 정본 30 · 초안 50 볼드 레드). 불일치 캡처는 `ANSWER_REGISTRY_DB=/tmp/t3demo.db` 임시 DB + 별도 시드로 재현했고 `data/demo.db` 는 건드리지 않았다(파일 수정시각으로 확인).
- 테스트: vitest 53 passed / `npm run build` · `npm run build:static` exit 0

## [QUESTION] T3 블록 배치 — 2026-07-31 15:44
WORKPLAN 문구가 "우측 판단하기 패널 아래"라 CTA(`승인하고 발송`) 아래에 두었다. 다만 설명 블록이 최종 행동 버튼보다 아래에 오면 1080p 에서 접히기 쉽고, 읽는 순서도 "행동 → 근거"가 된다. 대안은 신호 분해 카드 바로 아래(사유 버튼 위)로 올리는 것이다. 지시 문구를 그대로 따랐으니 배치 변경이 필요하면 알려 달라.

## [T6] eval-results 스키마 정리 + 표본 근거 명시 — 2026-07-31 15:49
- 변경: `scripts/eval.ts` — WORKPLAN 스키마의 `runs[]` 추가(`{ detector, ranking, recall_at_39, precision_at_39, hits, by_error_type, source }`). v1/v2/v2+확증 3개를 나란히 기록하고 기존 `methods` 블록은 그대로 보존. `README.md` — AI 배치 원칙 2줄 + 삭제형 오류의 R 하락을 무작위 표본의 존재 근거로 명시 + eval-results.json 증거 행 추가. `docs/BUILD_SPEC.md` — §2.5.1 AI 배치 원칙 신설.
- 이유: 개선 곡선(22.9 → 27.1 → 81.3)이 서사인데 JSON 이 마지막 실행만 담고 있었다. v1 감지기는 코드에서 사라져 재계산이 불가능하므로 과거 실행값을 `source: "recorded"` 로 구분해 옮겨 적었다 — 재계산값(`recomputed`)과 섞으면 안 된다.
- 평가가 설계를 실증한 대목: 자격 요건·불이익 문구를 통째로 지운 초안은 위험 구절이 함께 사라져 R 이 기준선 11 → 9 로 **내려간다**. R 내림차순 큐만 보면 가장 위험한 누락이 맨 뒤로 밀린다. 저위험 무작위 표본 레인이 이 사각지대를 메우는 장치이고, 우리 평가가 우리 설계의 존재 이유를 실증했다. (감지기 v2 의 누락 트리거가 R 하락 자체는 막았지만, R 은 유형 단위 합이라 정상 초안보다 위로 올라가지는 못한다 — 표본 레인은 여전히 필요하다.)
- 증거: `docs/eval-results.json` `runs[]` — v1 22.9%/28.2%, v2 27.1%/33.3%, v2+확증 81.3%/100.0%
- 테스트: vitest 53 passed / eval 2회 실행 결과 완전 동일 / build · build:static exit 0

## [T7] 덱용 정량 차트 데이터 — 2026-07-31 15:49
- 변경: `scripts/eval.ts` — 콘솔 출력 끝에 덱 12-5 용 마크다운 표 2종 추가(방법별 Recall/Precision/적중, 오류 유형별 v2+확증 / v2 순수 R / v1 기록 / 편집거리).
- 이유: 덱 제작 시 콘솔의 고정폭 표를 손으로 옮기면 오타가 난다. 붙여넣기만 하면 되는 형태로 같은 수치를 한 번 더 낸다.
- 무작위 baseline 은 1,000회 평균 유지(이론값 7.80 · 실측 7.89).
- 증거: `npm run eval` 콘솔 하단 마크다운 블록
- 테스트: vitest 53 passed

## [T8] AI Hub 은행 상담 데이터 로더 — 2026-07-31 15:56
- 변경: `.gitignore` — `data/aihub/` 선행 추가(원본·해제본 재배포 금지). `scripts/load-aihub.ts` 신설 + `package.json` 에 `aihub:load` 스크립트.
- 순서 준수: .gitignore 를 먼저 넣고 `git check-ignore` 로 확인한 뒤에 zip 을 조립했다. 조립·해제는 전부 `data/aihub/` 안에서만 했고 원본 디렉터리(`25.금융분야_고객상담_데이터/`)는 읽기만 했다. 커밋 시점 `git status` 에 원본 490MB 가 하나도 잡히지 않음을 확인했다.
- 데이터 규모: TL_은행 40,000 파일 + VL_은행 5,000 파일 = 45,000건, 해제 후 389MB. 기관은 전부 하나은행.
- 데이터 없을 때: 발급 → `data/aihub/` 배치 → 재실행 안내를 출력하고 **exit 0**. 실제로 폴더를 치우고 실행해 확인했다. 기본 데모(합성 20건)는 이 경로와 무관하다.

### 실물 스키마 (정찰 내용과 다른 부분이 있어 실물 기준으로 구현)
```
source.source_institution      하나은행
source.source_id               21-1_bk_01_000029
source.source_date             202506
source.consulting_content      TX/RX 상담 전문
consulting.consulting_category 은행
consulting.consulting_topic    예: 대출문의(만기/연장/조회등)
consulting.consulting_summary  상담 요약
qa_data[]  (파일당 항상 1건)
  qa_id, task_category, consulting_situation, qa_topic,
  consulting_purpose, core_financial_terms, instruction
  input { question, answer, follow_up_question }
  output                        ← 모범답변(정본)
```
- **정찰 내용과 다른 점: `qa_data[].input.answer` 는 "없다"고 전달받았으나 실제로는 존재한다.** 표본 400건 기준 `instruction`·`output`·`input.question`·`input.answer`·`input.follow_up_question` 는 100% 존재, `core_financial_terms` 만 85.5%. `output` 길이 중앙값 181자(75~636).
- 매핑 결정: 질문 = `input.question`(고객 최초 질문), 추가 질문 = `input.follow_up_question`, **모범답변 = `output`**, 주제 = `consulting_topic` + `qa_topic`. `instruction` 은 과업 지시문이라 질문이 아니라 meta 로 보관했다. `input.answer` 는 상담 중간 답변이고 `output` 이 최종 모범답변이라 정본은 `output` 을 쓴다.
- 증거: `npm run aihub:load -- --limit 200 --print` — 파일 45,000건 · 파싱 200건 · 하나은행
- 테스트: vitest 53 passed / tsc · build exit 0 / `git check-ignore -v data/aihub/probe.json` 확인

## [T9] 실상담 기반 평가 (npm run eval -- --aihub) — 2026-07-31 16:04
- 변경: `scripts/eval-aihub.ts` 신설, `scripts/eval.ts` 에 `--aihub` 디스패치, `src/lib/scoring.ts` 에 `detectDraftWithFacts(sentences, facts?)` 분리(팩트를 이름으로 찾지 않고 직접 받는 진입점 — 판정 로직은 `detectDraft` 와 동일). 결과는 `docs/eval-results-aihub.json` 별도 파일.
- 설계: 원본 45,000건 중 시드 고정 표본 3,000 파일 파싱 → 문장 3개 이상인 모범답변 1,502건. 오류 유형 6종 × 8건 = 양성 48, 각 양성마다 **같은 정본에서 나온** 무해 변주 4건을 붙여 음성 192건. 총 240건 · K=39 · seed 20260723. 답변마다 원래 위험도가 다른 교란을 없애려고 양성·음성을 같은 원문에서 짝지었다.
- 레퍼런스: 하나은행 상품은 product-facts 에 없으므로 **그 건의 모범답변 자체**를 정본으로 삼았다(은행이 FAQ 정본을 보유한다는 제품 전제와 같은 구조). numbers = 모범답변의 수치 토큰(앞 문맥 포함), required = 모범답변이 담고 있던 신호 유형이 초안에서 사라지면 누락. conditions 는 비웠다 — 조건절의 claim/qualifier 짝은 상품 지식이 있어야 만들 수 있어 일반화하지 않았다.
- **주의(필수)**: 오류 주입기와 감지기가 같은 문서를 레퍼런스로 공유하므로 이 수치는 성능이 아니라 상한이다. 합성 평가와 같은 한계이며 콘솔·JSON(`reference.caveat`)에 모두 박아 두었다.
- 결과 (조작 없이 그대로):

| 방법 | Recall@39 | Precision@39 | 적중 |
| --- | ---: | ---: | ---: |
| R 랭킹 (v2 + 확증) | 25.0% | 30.8% | 12/48 |
| R 랭킹 (순수 R) | 22.9% | 28.2% | 11/48 |
| 편집거리 baseline | 20.8% | 25.6% | 10/48 |
| 무작위 (1,000회 평균) | 16.2% | 20.0% | 7.79/48 |

- 합성 평가(81.3%)와 크게 다르다. 확증이 붙은 양성이 48건 중 8건뿐이기 때문이고, 그 8건은 전부 수치 바꿔치기다. 실제 상담 답변은 같은 주제를 여러 문장이 나눠 말하므로 한 문장을 지워도 신호 "유형"이 통째로 사라지지 않아 누락 트리거가 거의 안 걸린다. 자동 유도할 수 있는 레퍼런스는 수치까지이고, 조건·누락 판정에는 상품 지식이 필요하다는 뜻이다 — 합성 벤치마크가 왜 낙관적이었는지에 대한 직접 증거다.
- 발견·수정한 버그: `/g` 정규식을 공유하면서 `exec` 이 남긴 `lastIndex` 를 `matchAll` 이 물려받아 레퍼런스에서 문자열 앞쪽 수치가 통째로 빠졌다. 확증이 6/48 로 낮게 나오던 원인이며, 정규식을 매 호출 새로 만들도록 고쳐 8/48 이 되었다.
- 증거: `docs/eval-results-aihub.json` · 직접 2회 실행 콘솔·JSON 바이트 동일
- 테스트: vitest 53 passed / 합성 `docs/eval-results.json` 미변경 확인 / build · build:static exit 0

## [T10] 실데이터 통계 + seed --aihub 배지 — 2026-07-31 16:14
- 변경: `scripts/aihub-stats.ts` 신설 + `package.json` `aihub:stats`. `scripts/seed.ts` — `--aihub` 모드(실상담 재구성 20건으로 큐 구성). `src/lib/seed-runner.ts` — `SeedOptions { cases?, dataset? }` 로 케이스 주입을 받게 함(src 가 scripts 를 거꾸로 import 하지 않도록 fixture 조립은 scripts 쪽에 둠). `src/lib/constants.ts` `AIHUB_BADGE`, `src/lib/events.ts` `DraftCreatedPayload.dataset?`, `src/lib/projection-core.ts` `state.dataset`, `src/lib/view-model.ts` 배지 전환.
- 통계는 표본이 아니라 전체 45,000건을 읽는다(약 2초). 결과는 `docs/aihub-stats.json`.

### 주제 → 티어 매핑 기준
감지기 티어 정의를 그대로 쓴다. S = 금액·금리·면제조건처럼 계약의 핵심 수치·조건을 말하는 주제 / A = 기한·자격 요건, 해지·연체 같은 불이익 고지가 걸리는 주제 / B = 절차·서류 안내 / — = 조회성(잘못 말해도 계약 조건이 안 바뀜). 은행 분야 주제가 닫힌 집합 9종이라 하나씩 손으로 배정했다.

| 주제 | 배정 | 근거 |
|---|---|---|
| 대출문의(만기/연장/조회등) | A | 만기·연장은 기한·자격이 걸리고 조건 안내에 금액·금리가 따라온다 |
| 이자/연체금액 | S | 이율·금액이 핵심이고 연체는 불이익 고지 대상 |
| 금융거래한도/비대면한도계좌 | S | 한도 금액이 곧 수치, 비대면 제한은 자격·불이익 |
| 만기,연장/해지,수신 | A | 중도해지이율·불이익 고지가 따라붙음 |
| 부수거래금리감면 | S | 감면은 면제 조건, 금리는 수치 |
| 환전문의 | — | 환율·수수료 수치는 있으나 계약 조건을 바꾸지 않음. 정본 시드도 환율 우대를 R=0 으로 둠 |
| 자동이체조회 · 거래내역/잔액조회 | — | 조회성 |
| 중계요청/착오송금 | B | 처리 절차 안내라 S/A 아님 |
| 기타(은행) | — | 주제 미특정 |

- **손 배정을 그대로 쓰지 않았다.** 같은 표에 감지기가 그 주제의 모범답변에서 실제로 S/A 를 발화시킨 비율을 나란히 실었고, 덱에 쓸 숫자는 실측 쪽이다.
  - 손 배정 기준 S/A 주제 비중 **69.9%** (31,450/45,000)
  - 감지기 실측 S/A 발화 비중 **36.6%** ← 덱 숫자
  - 둘이 갈리는 대표 사례: `자동이체조회` 는 조회성으로 배정했지만 실측 S/A 발화가 49.1% 다. 주제 이름만으로는 민감도를 못 가린다는 증거이고, 손 배정만 실었으면 과장이 됐을 것이다.
- seed 트랙: `npm run seed -- --aihub` 는 R 상위 18건 + 저위험 표본 2건으로 큐를 채우고 `draft_created.dataset='aihub'` 를 남긴다. 화면 배지는 "SYNTHETIC DEMO · AI Hub 실상담 기반 재구성" 으로 바뀐다 — SYNTHETIC 표기는 유지했다(원본 문안이 아니라 변환 결과이므로). 데이터가 없으면 안내 후 합성 시드로 진행한다.
- 기본 seed 완전 불변 확인: 배지 "SYNTHETIC DEMO · 합성 예시 데이터", 큐 R=11 S·S·A·A·B 이하 그대로, `src/lib/static-demo/seed-events.json` diff 없음(dataset 은 옵셔널이라 합성 시드 payload 에 나타나지 않음).
- 증거: `docs/aihub-stats.json` · `npm run aihub:stats` 콘솔 표 · 두 모드 배지 문자열 직접 확인
- 테스트: vitest 53 passed (scoring-regression 36건 포함, 기본 seed 기준 그대로) / build · build:static exit 0

## [T11] 덱용 캡처 5 + GIF 2 (선행 조정 A·B 포함) — 2026-07-31 16:30
### 선행 조정 A — T3 정본 대조 블록 배치 이동 (팀 리드 결정)
- 변경: `src/app/review/[caseId]/review-console.tsx` — 정본 대조 섹션을 CTA 아래에서 **신호 분해 카드 바로 아래(수정 사유 설명 위)** 로 이동. 헤어라인(`border-t` + `mt-[28px]`)을 떼고 형제 섹션과 같은 `mt-[20px]` + h3 로 맞췄다.
- 이유: [QUESTION] 항목에 대한 팀 리드 결정(사용자 보고됨). 읽는 순서를 근거 → 판단 → 행동으로 되돌리고 1080p 접힘을 막는다. 같은 패널 안 형제 섹션이 전부 h3 로만 구분되는데 하나만 헤어라인을 쓰면 층위가 어긋나 함께 정리했다. 코드 주석에 배치 이유를 남겼다.

### 선행 조정 B — 사유 오선택·재판단 기록
- 변경: `src/lib/clock.ts` — `eventTs(caseId, type, sentenceIdx?, reason?)` 로 확장하고 `PRIMARY_REASON_RETRY_TS = 12:53:12` 신설. 정본 케이스에서 확정 사유(`PRIMARY_DEMO.reason`)만 12:53:29 를 쓰고 그전 시도는 12:53:12 로 앞세운다. `src/lib/actions.ts` · `src/lib/static-demo/store.ts` 의 `selectReason` 이 사유를 넘기도록 수정(서버·정적 두 모드 동일).
- **seed 에 이벤트를 넣지 않았다.** 정본 케이스는 seed 직후 "검토 대기"(이벤트 2건)여야 하고 그것이 캡처·README 6막의 전제다. 사유 이벤트를 seed 에 심으면 그 전제가 깨진다. 대신 시각만 갈라 두어, 화면에서 실제로 오선택하면 그 흐름이 그대로 기록되게 했다 — 덱 4번이 요구한 타임라인은 조작이 아니라 실조작 결과다.
- 불일치 문구는 코드 변경 없이 나온다: 정본 수정은 확인 안내 추가라 `수치 오류` 사유에는 `checkCoherence` 가 "문구 추가만 있고 수치 변경 없음"을 낸다(지시서 문구와 동일).
- 타임라인 dot: `registry-timeline.tsx` 는 이미 `coherence_checked{result!=='pass'}` 를 `bg-danger` 로 그린다 — 확인만 하고 수정 없음.
- 불변 확인: R=11 · 신호 S·S·A·A·B · 검토 소요 02:41 · 승인 payload · seed 이벤트 76건 그대로. `npm run export:seed` 재출력 결과 `seed-events.json` diff 0. `npm run eval` 결과 JSON 바이트 동일(감지 판정 불변).
- 신규 테스트 `tests/reason-retry.test.ts` 4건: 오선택이 mismatch 로 기록되고 승인 422 / 재선택해도 틀린 시도가 로그에 남음(reasons `[수치 오류, 자격 미확인]`, results `[mismatch, pass]`) / 시각 12:53:12 → 12:53:29 이고 전체 로그에서 seq 오름차순과 ts 가 어긋나지 않음 / 오선택이 끼어도 봉인·검토 소요 불변.

### 캡처 (verify-shots/, 전부 1920×1200, 에러 토스트 0)
- `deck-01-queue.png` 224K — 큐 · R=11 분해 패널 · 2줄 압축 문장
- `deck-02-review-mismatch.png` 204K — 붉은 불일치 카드 · 비활성 승인 버튼 · **새 위치의 정본 대조 블록**
- `deck-03-blocked-diff.png` 164K — 차단 화면 · 붉은 diff "서류 없이도 즉시 처리됩니다"
- `deck-04-registry-timeline.png` 240K — 이벤트 16건 전체 · 12:53:12 불일치(적색 dot) · 12:53:29 통과(녹색 dot) · 판단 레이블 저장 줄
- `deck-05-dispatched.png` 200K — 해시 2줄 일치 · 봉인 정보 · 고객 수신 화면
- `gif-01-coherence.gif` 448K — 1280×800 4프레임 실조작 녹화(수정 완료 → 불일치 → 적합 → 발행 완료)
- `gif-02-tamper.gif` 208K — `docs/evidence-tamper-demo.gif` 사본(내용 최신이라 재생성 불요)
- 절차: `npm run seed` 직후 0142="검토 대기" 상태에서 화면 조작으로 진행하며 촬영. deck-01 은 승인 전 상태가 필요해 리시드 후 재촬영했다.
- 뷰포트: `devicePixelRatio` 가 0.9 라 1728×1080 을 요청하면 CSS 는 1920×1200 이지만 PNG 가 1728 로 나온다. **1920×1200 을 요청**하면 CSS 2133×1333 → stage scale 1.111 로 캔버스가 뷰포트를 꽉 채우고 PNG 가 정확히 1920×1200 이 된다(다운스케일이라 화질 손실도 없다).
- **하단 여백은 줄이지 못했다.** 지시의 "브라우저 높이 조절"은 stage 모드(1920×1200 고정 캔버스, `src/app/stage.tsx`)와 양립하지 않는다 — 창을 줄이면 캔버스가 통째로 축소되고 레터박스가 늘 뿐 콘텐츠 비율은 그대로다. 명시 요구인 1920×1200 을 지키고 여백은 남겼다. 없애려면 캔버스 비율을 바꾸거나 검토 화면 레이아웃을 손봐야 해 지시 범위를 넘는다.
