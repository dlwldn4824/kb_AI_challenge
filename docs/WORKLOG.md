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

## [T12] README 최종화 — 2026-07-31 16:32
- 변경: `README.md` — ① "데모 시나리오 6스텝"을 **6막**으로 재구성(3막에 사유 오선택→재선택, 6막에 등기 조회 타임라인 추가) ② 테스트 57건 구성 표기 ③ 증거 표에 aihub eval·덱 캡처 2행 추가 ④ **실상담 데이터 트랙 섹션 신설**(발급 → `data/aihub/` 배치 → `aihub:load` / `eval -- --aihub` / `aihub:stats` / `seed -- --aihub`) ⑤ 구조 블록에 static-demo·eval·aihub 스크립트 반영 ⑥ 캡처 전 준비에 stage 캔버스 성질과 덱 파일명 7개 명시.
- 중복 정리: "AI 배치 원칙" 2줄과 "만들지 않은 것" 섹션은 이미 있어 그대로 두었고, 6막 본문이 흡수한 낡은 스텝 서술만 걷어냈다.
- 실상담 수치는 낮은 대로 적었다(Recall@39 25.0% vs 합성 81.3%) — 절대 원칙 2.
- 증거물 갱신: 테스트가 48 → 57 이 되어 `docs/evidence-invariants-green.png` 재생성(1400×1040, 384K). 방식 동일 — 실제 `npx vitest run` 두 번(불변조건·사유재선택 verbose / 전체 기본 리포터)을 한 터미널 세션에서 실행한 출력 그대로이고, 마지막 줄이 `Tests 57 passed (57)`.
- 테스트: vitest 57 passed / tsc 0 / `npm run build` · `npm run build:static` exit 0 / eval JSON 재현 동일

## [M1] bborang 브랜치 병합 + 조정 3건 — 2026-07-31 16:45
- 병합 출처: `origin/feature/block-edit-on-sealed-case` (3dcbb71, "발행 완료 케이스 재열람 시 편집 차단 UI", bborang). 분기점 162d08b.
- 충돌 해소: `review-console.tsx` 의 import 한 줄만 충돌했고 양쪽을 다 남겼다(우리 `TIER_BASIS` + 그들 `sealed-lock`). 그들의 sealed-lock 코드와 우리 T3 정본 대조 블록·T5 감지기 라벨이 같은 파일 다른 영역이라 나머지는 자동 병합됐다. 병합 후 우측 패널 순서(정본 대조 → 사유 → 적합성 → CTA)와 양쪽 기능 존재를 문자열 단위로 확인했다. README 는 자동 병합.

### 조정 1 — 서버 가드 (핵심)
- 변경: `src/lib/actions.ts` `CaseSealedError` + `assertNotDispatched()` 신설, `keepSentence`·`editSentence`·`selectReason` 진입부에 적용. `src/lib/http.ts` `sealed()` 헬퍼(409). `keep`·`edit`·`reason` 라우트 3곳이 409 `{error:'case_sealed', reason:'already_dispatched', caseId, dispatchedAt}` 로 응답. `src/lib/static-demo/store.ts` 에 `CaseSealed` + 같은 가드 3곳(두 모드의 판정이 갈리지 않게).
- 이유: 잠금이 UI 에만 있으면 curl 로 dispatched 케이스가 편집된다. "검증은 화면이 아니라 발송 경로에 있다"는 이 제품의 주장과 정면으로 어긋나므로 잠금도 서버에 둬야 한다.
- **dispatched 이전(승인만 된 상태)의 편집은 그대로 허용**한다. 그 경로의 정답은 차단이 아니라 `approval_invalidated` 로 승인을 무효로 돌리는 것이고(불변조건 2), 막아 버리면 기존 불변조건 테스트가 검증하는 흐름 자체가 사라진다.
- 실증: 발송 완료 후 `curl -X POST .../sentences/0/edit` → `HTTP/1.1 409 Conflict` + `case_sealed` 확인.
- 신규 테스트 `tests/sealed-case.test.ts` 3건: dispatched 후 edit → 409 이고 `sentence_edited` 가 늘지 않음 / keep·reason 도 409 이며 거부된 요청은 이벤트를 하나도 남기지 않음 / 승인 후 발송 전 편집은 200 이고 `approval_invalidated` 가 뒤따름.

### 조정 2 — seal 색 토큰 제거
- 변경: `src/app/globals.css` 에서 `--color-seal`(#e0a000) · `--color-seal-bg` 삭제. `sealed-lock.tsx` 배너를 `border-b border-line bg-head` + `text-ink-soft` 자물쇠로, 모달 아이콘도 `text-ink-soft` 로 바꿨다.
- 이유: 옐로는 화면당 CTA 하나라는 예산 규약이 있고, 앰버는 경고(warn)와도 겹친다. 이 상태는 "무언가 잘못됐다"가 아니라 "이미 끝났다"라서 색으로 말할 일이 아니다 — 자물쇠와 중립 회색이 더 정확하다. 붉은 계열도 피했다(차단 danger 와 층위가 섞인다). 의도는 코드 주석에 남겼다.

### 조정 3 — 죽은 UI 제거
- 변경: 배너와 모달의 비활성 `새 등기로 재발행` 버튼 2개 삭제(모달의 남은 버튼은 전체 폭으로). README 해당 문단을 "재발행은 이번 스코프 밖" 한 줄로 줄이고, 대신 서버 가드 설명으로 대체했다.
- 이유: 누를 수 없는 컨트롤은 "곧 된다"는 잘못된 신호만 준다. 원칙은 모달 본문 문장이 이미 말하고 있어 버튼 없이도 전달된다.

### 덤으로 고친 것 (지시 범위 밖 · 캡처 중 발견)
- `VerdictButton` 의 `aria-disabled={locked}` 를 `aria-label` 로 바꿨다. 실제로는 눌러야 차단 모달이 뜨는 버튼인데 보조기술에는 "못 누른다"고 알리고 있었다. Playwright 도 이 속성 때문에 클릭이 막혀서 발견했다 — 실사용자도 같은 벽에 부딪힌다.
- 증거: `verify-shots/m1-sealed-lock.png` (1920×1200 · 잠금 배너 · 반투명 읽기 전용 행 · 차단 모달 · 우측 정본 대조 블록 보존)
- 테스트: vitest 60 passed (57 + sealed-case 3) / tsc 0 / `npm run build` · `npm run build:static` exit 0

## [T13] 클린 재현 테스트 — 2026-07-31 16:44
- 환경: macOS 26.5.2 · node v25.2.1 · 새 임시 폴더에 `git archive HEAD` 추출(비추적·gitignore 파일 자동 배제)
- 절차·결과 (전부 통과):
  ① `npm install` — 131 packages, 4s ② `npx vitest run` — **60 passed / 0 failed**
  ③ `npm run seed` — 정본 케이스 검토 대기 상태로 시드 ④ `npm run eval` — R+확증 81.3% / 100.0% 재현
  ⑤ `npm run tamper` — HTTP 409 차단 재현 ⑥ `npm run aihub:load` — 데이터 없음 안내 후 exit 0 (기본 데모 무영향)
  ⑦ `npm run build` — 성공 ⑧ `npm run dev` 기동 → `/` 200 + `/api/cases` KPI JSON 정상 응답
- 6막 데모의 화면 조작 재현은 동일 코드에 대한 Playwright 실측(deck-01~05, gif-01/02 캡처 과정)으로 갈음.

## [T14] zip 패키징 체크 — 2026-07-31 16:44
- 방법: `git archive --format=zip HEAD` → `KBAICH/answer-registry-submission.zip` (144 files, 6.9MB)
- 포함 확인: 소스 전체 · README · docs/(BUILD_SPEC, WORKPLAN_FINAL, WORKLOG, eval-results.json, eval-results-aihub.json, aihub-stats.json, evidence-*.png/gif) · verify-shots/(deck-01~05, gif-01/02 등)
- 금지물 검사: zip 목록 grep — `aihub/`·`*.db`·`node_modules`·`.env.local`·`.next`·`.DS_Store` **0건** (AI Hub 원본·해제본 미포함 확정)

## [T15] README 재구성 — 2026-07-31 16:56
- 변경: `README.md` 전면 교체(사용자 작성 — 세 개의 숫자 · 데모 6막 인라인 캡처 · 숫자—정직하게 절). `docs/evidence-invariants-green.png` 재생성(57건 시점 캡처 → 현재 60 passed 기준, 신규 테스트 파일 4종 요약 포함, 실제 출력 그대로).
- 검증: 참조 이미지 10개(deck-01~05 · t3-fact-comparison-mismatch · m1-sealed-lock · gif-01/02 · evidence PNG) 전부 실존, GIF 412/208KB(GitHub 렌더 한도 내), 앵커 `#숫자--정직하게` = GitHub 슬러그 규칙(em-dash 제거+공백 2회 하이픈화) 일치.
- 판단: WORKLOG 내 "57" 표기 2곳은 append-only 기록이라 보존(기록 당시 사실). 사용자 대면 문서(README·BUILD_SPEC)에는 낡은 수치 잔존 0건.
- 테스트: vitest 60 passed

## [T15-검증] 라이브 Pages 실조작 검증 — 2026-07-31 17:08
- 결과: 6항목 전부 통과 — 큐 필터 실동작(9→5건), 검토 플로우 실조작(브라우저 정합성 검사가 불일치→재선택→적합 실계산), done 해시 동일(WebCrypto=Node), 타임라인 16건(실수 기록 포함), 차단 케이스, sealed-lock 정적 모드, 외부 도메인 요청 0건.
- 수정 1건: 전 페이지 콘솔 favicon 404(도메인 루트 기본 시도) → `src/app/icon.svg` 신설(App Router 자동 인식, basePath 반영 링크 생성 확인). 수정 후 콘솔 에러 0건.
- 증거: `verify-shots/live-01/03/04/05.png` (1920×1200 라이브 캡처)
- 테스트: vitest 60 passed / build·build:static exit 0

## [T16] enriched-reference rule-v2.1 — 3차 실험 — 2026-08-02 (타임박스 내 완료)
- 변경: `scripts/eval-aihub.ts` 만 수정(평가 트랙 전용). 제품 `src/lib/scoring.ts`·`DETECTOR_VERSION`·판정 로직 **불변** — `git diff -- src/` 에 내 변경 0건.
- 구조: 코퍼스 생성과 채점을 분리해 **같은 시험지를 레퍼런스만 갈아 끼워 두 번 채점**한다. 시험지가 한 번만 만들어지므로 두 run 이 문자 그대로 같은 문장을 본다.

### 추출 규칙 (v2.1 보강 레퍼런스)
v2 는 `conditions` 를 비워 두고 수치 슬롯 + "정본에 있던 신호 유형"만 썼다. v2.1 은 모범답변에서 아래 표지를 뽑아 `conditions` 로 편입한다. claim = 표지 **뒤에 남는 본문 앵커**(12자), qualifier = 표지 자체. 본문은 남았는데 표지가 사라지면 "조건 없이 단정"으로 본다. 앵커를 문장 끝이 아니라 표지 직후에서 뽑는 이유는 무해 변주의 어미 치환에 걸리지 않게 하기 위해서다.

| 계열 | 표지 | 편입 유형 |
|---|---|---|
| 조건절 | `~(하시는/하신/하는/이신/인) 경우`, `~의 경우`, `~에 한하여/한해`, `단,` | exemption_condition |
| 기한 | `N(영업일/일/개월/년/주/시간) 이내`, `~ 이후`, `M월 D일부터`, `~부터`, `~까지` | deadline_eligibility |

### 시험지 동일성 검증
- 시험지 지문 `sha256:e0434a29d82e23a1` 을 결과 JSON(`corpus_digest`)에 기록.
- 재계산한 v2 run 이 **직전 커밋의 v2 run 과 완전 일치**: recall 0.25 / precision 0.3077 / hits 12 / by_error_type `{수치4, 조건1, 단정3, 자격0, 불이익1, 서류3}`. 순수 R·편집거리 run 도 일치. 레퍼런스만 달라졌음이 확인된다.

### 결과 (조작 없이 그대로 — 개선 없음)

| 방법 | Recall@39 | Precision@39 | 적중 |
| --- | ---: | ---: | ---: |
| R 랭킹 (v2.1 보강 레퍼런스 + 확증) | 25.0% | 30.8% | 12/48 |
| R 랭킹 (v2 기본 레퍼런스 + 확증) | 25.0% | 30.8% | 12/48 |
| R 랭킹 (순수 R · 레퍼런스 무관) | 22.9% | 28.2% | 11/48 |
| 편집거리 baseline | 20.8% | 25.6% | 10/48 |
| 무작위 (1,000회 평균) | 16.2% | 20.0% | 7.79/48 |

유형별 상위 39 적중 / 확증(양성 8건 중):

| 오류 유형 | v2.1 적중 | v2 적중 | v2.1 확증 | v2 확증 |
| --- | ---: | ---: | ---: | ---: |
| 수치 바꿔치기 | 4 | 4 | 5/8 | 5/8 |
| 조건절 삭제 | 1 | 1 | **1/8** | 0/8 |
| 단정 표현 삽입 | 3 | 3 | 0/8 | 0/8 |
| 자격 요건 삭제 | 0 | 0 | 1/8 | 1/8 |
| 불이익 문구 삭제 | 1 | 1 | 2/8 | 2/8 |
| 서류 절차 왜곡 | 3 | 3 | 0/8 | 0/8 |

- 확증 총계 8/48 → **9/48** (+1, 조건절 삭제). 랭킹 적중은 12 → 12 로 **변화 없음**. 음성 오탐은 0/192 유지.
- 보강 레퍼런스 규모: 정본 48건에서 수치 슬롯 25개 · 조건 슬롯 18개, 조건 슬롯이 하나라도 있는 정본은 **16/48건(33%)**.

### 해석 — 왜 안 올랐나
1. **커버리지 한계**: 조건 슬롯이 정본 48건 중 16건에서만 뽑혔다. 실제 상담 모범답변이 조건절·기한 표지를 늘 쓰지는 않는다. 레퍼런스가 없는 32건에서는 보강이 할 일이 없다.
2. **표지 목록 불일치**: 조건절 삭제 8건 중 1건만 확증됐다. 주입기가 쓰는 조건 표지에 `~하시면 / ~이시면` 이 있는데 지시서가 명시한 추출 표지 목록(`~의 경우` / `단,` / `~에 한하여`)에는 없다. 표지를 주입기에 맞춰 넓히면 수치는 오르지만 **그건 내가 쓴 주입기에 맞추는 것이라 벤치마크가 더 순환적이 된다.** 지시서에 명시된 표지만 구현하고 결과는 그대로 두었다. 표지 확장이 정당한 개선인지 판단이 필요하면 제3자가 쓴 held-out 주입기로 검증해야 한다.
3. **구조적 한계 (가장 큰 몫)**: 자격 요건 삭제·불이익 문구 삭제는 문장을 통째로 지운다. 그러면 claim 앵커와 조건 표지가 **함께** 사라져 문장 단위 조건 대조가 아예 성립하지 않는다. 남은 경로는 신호 "유형"이 통째로 사라졌는지 보는 것뿐이고 그건 v2 가 이미 하고 있다. 레퍼런스를 아무리 보강해도 이 두 유형은 못 올라간다 — 잡으려면 draft 전체에 대한 어휘 단위 필수 요소 검사가 필요하고, 그건 `src/lib/scoring.ts` 의 `detectOmissions` 가 유형 단위로만 판정하는 현재 구조를 바꿔야 한다(제품 코드 불변 제약상 이번 실험 범위 밖).
- 증거: `docs/eval-results-aihub.json` (`corpus_digest`, `runs[]` 에 v2/v2.1 병기, `reference_scale`, `confirmed_hits_by_type`) · 직접 2회 실행 콘솔·JSON 바이트 동일
- 테스트: vitest 60 passed / build exit 0 / build:static 은 첫 시도에서 `Cannot find module for page: /done/[caseId]` 로 실패했으나 이는 다른 에이전트의 동시 빌드로 `.next` 가 엉킨 것이고 재시도 exit 0. 내 변경은 `scripts/`·`docs/` 뿐이라 앱 번들과 무관하다(`grep eval-aihub src/` 0건).

## [T16-b] KB 공시 정본 연결 — 2026-08-02 (타임박스 내)
- 공시 확인: KB 상품공시 페이지(obank1.kbstar.com C016613, 웹상품코드 DP000939) + KB 공식 안내(kbthink.com 2024-11) — 확인일 2026-08-02.
- 대조 결과: **기존 fixture 팩트 6개 전부 공시와 일치** — 은행별 월 최고 30만원 / 고객별 합산 월 55만원(2025-01-02부터) / 한도변경 1회(2025-01-01 이전 가입, 5만원 단위) / 가입자격 확인서 발급일로부터 3개월 이내 / 매월 30만원 이하 / 25년 기준 연도. **scoring-regression 깨짐 없음(60 passed) — 임의 조정 0건.**
- 변경: `product-facts.ts`에 `source` 필드+공시 URL·확인일 주석, 미배선 공시 팩트 12종 주석 기록(가입대상·계약기간 1~24개월·금리 4.0~5.0%+우대 4.5%p·비과세 2026-12-31까지 가입분·매칭지원금 2024년 이후 100%·1인 1계좌·재가입 불가 등 — 감지 슬롯 배선 안 함, R=11 불변 보호). `review-console.tsx` 정본 대조 블록 하단에 "정본 출처: …" 캡션 노출(최소 수정). README·DISCLAIMER 고지문을 "상담 시나리오·인물은 합성이나, 상품 정본 수치는 KB 공시 상품설명서 기준"으로 갱신. 원본 PDF repo 미포함.
- [QUESTION] combined_limit 팩트의 슬롯 문맥이 "원리금 … 최고 55만원"인데 공시 표현은 "고객별 월 55만원 저축한도"다. 값(55)은 일치하나 문맥 층위가 달라 이 팩트의 출처 표기는 보류하고 값만 유지했다. seed 문장 확인 후 문맥 정정 여부 판단 필요.
- 테스트: vitest 60 passed / tsc 0

## [T17] 기록 정합 감사 — 2026-08-02
- 수치 감사: 45,000건(수령분 Training 40,000+Validation 5,000은 T8 항목에 정위치) / 36.6%(분모 45,000, aihub-stats.json 확인) / 무작위의 1.5배(1.9배 잔존 0건) / 테스트 60건 / R=11 — 전 문서 정합, 수정 필요 0건. evidence-invariants-green.png 60 passed 기준 확인(T15 재생성본).
- 캡처 정합: 디자인 병합(6e0c590) 반영으로 deck-01~05·gif-01·t3-*·m1-* 전량 재촬영(새 디자인 + 고지문 푸터 포함). deck-06-kb-source/crop 신규(T16-b 출처 캡션). 육안 검수: 정본 숫자·용어("개입 필요도")·푸터·출처 캡션 확인.
- 테스트: vitest 60 passed

## [T18] 덱 자산 매핑 문서 — 2026-08-02
- 변경: `docs/DECK_ASSETS.md` 신규 — 덱 페이지→자산 파일→처리 지침 표, 17.5장 수치의 JSON 원 위치(경로→키) 명기, 사용 금지 자산 목록(v2-*·live-*), 파일 존재 확인 결과.
- 원칙: 수치는 손으로 옮기지 않고 JSON 원 위치에서 복사(1.9배류 드리프트 재발 방지). 14장은 png 원본 직접 삽입(브라우저 재촬영 금지) 명시.
- 증거: 참조 파일 11종 + evidence 2종 존재 확인 통과.

## [T19] 최종 재패키징 — 2026-08-02 19:07
- 클린 재현(새 임시 폴더, git archive HEAD): npm install(131pkg) → vitest **60 passed** → eval 합성(R+확증 81.3%/100%) → eval --aihub(데이터 미배치 안내 후 정상 종료 — 클린 재현 불변 확인) → seed → tamper **HTTP 409 + dispatch_blocked** → dev 기동, 6막 라우트 스팟체크(`/`·`/review/0142`·`/done/0135` 전부 200).
- zip: `KBAICH/answer-registry-submission.zip` — **145 files / 11.0MB**. git archive 후 `verify-shots/v2-*`(8)·`verify-shots/live-*`(4) 제거.
- 포함: 소스 전체(src·scripts·tests·public) / README / docs 15종(BUILD_SPEC·WORKPLAN_FINAL·WORKLOG·DECK_ASSETS·IMPACT_NARRATIVE·eval-results 3종·evidence 2종 등) / verify-shots 12종(deck-01~06 7장·gif 2·t3 2·m1 1) / .github 워크플로.
- 제외 grep 검증: data/aihub·*.db·node_modules·.next·out·.env.local·.DS_Store·v2-*·live-* **0건**.
- 판단: `.env.example`은 제외 패턴(.env*)에 걸리나 시크릿이 아닌 데모 상수 문서(파일 주석 명시)라 설치 편의를 위해 유지. 시크릿 실파일(.env.local)은 미추적으로 원천 배제.
- 정적 데모 고지문: 번들(layout chunk) 내 존재 확인, Pages 배포 [ok], 라이브 반영(클라이언트 렌더).

## [T20] 제출 정리 — 2026-08-02
- **T20-a 배포 흔적 제거**: `.github/`(deploy-pages.yml 포함) 삭제. README "라이브 데모" 절 → "정적 데모(오프라인)"(`npm run build:static && npx serve out`, mock 없음·curl 차단은 서버 모드 담당 표기 유지). `build-static.mjs`·`asset-path.ts`·`next.config.ts`의 basePath 기본값을 빈 문자열로 정리(로직 불변 — 경로 상수·주석만). grep(`dlwldn4824`·`github.io`·`kb_AI_challenge`·"라이브 데모") **0건**. build·build:static 모두 exit 0, 정적 산출물이 루트 경로로 빌드됨을 확인.
- **T20-b docs 분리**: 심사용 7종(BUILD_SPEC·WORKLOG·eval-results 3종·evidence 2종)만 `docs/` 에 남기고 내부 메모 5종을 `docs/notes/` 로 이동(삭제 아님) + `docs/notes/README.md` 안내. 코드 주석의 문서 경로(`ui.tsx`) 갱신, 깨진 링크 0건.
- **T20-c README 최종**: 고지문 4항목 완비(KB 상표 시연 표현 / 상담·인물 합성 / 상품 정본 수치는 KB 공시 / **AI Hub 원본 미포함·파생 수치만**). 실행 4줄(install·dev·vitest·tamper)을 상단으로 이동하고 6막 섹션의 중복 블록 제거. "감지기의 현재와 다음" 문단 추가 — 규칙 기반이며 의미 모델 자리는 M1·M3, 그 자리가 코드에 열려 있음(DETECTOR_VERSION·detectDraftWithFacts·eval 벤치마크). verify-shots 이미지 경로 전부 유효, v2-*·live-* 참조 0건.
- **T20-d 파일 정리**: `verify-shots/v2-*.png`(8)·`live-*.png`(4) 삭제 → 제출 캡처 12종만 유지. `.env.local`·`data/*.db`·`.next`·`out`·`*.tsbuildinfo` gitignore 확인, `.env.example`(데모 상수 문서)만 유지.
- **BUILD_SPEC 갱신**: §7 테스트 절을 현재 구성(6파일 60건: invariants 8·scoring-regression 36·learning-signal 5·reason-retry 4·sealed-case 3·hash-parity 4)으로 정정.
- **T20-e 최종 패키징**: 클린 재현(git archive → install 131pkg → **vitest 60 passed** → eval 81.3%/100% → seed → tamper **409** → dev 라우트 3종 200). zip 재생성 `answer-registry-submission.zip` — **144 files / 7.1MB**. 제외 grep(node_modules·.next·out·data/aihub·*.db·.env.local·.DS_Store·v2-*·live-*·.github) **0건**, zip 압축 해제 후 `github.io`·`dlwldn4824`·`kb_AI_challenge` 문자열 **0건**.
- 로직 불변: `src/lib` 검증·봉인·게이트 수정 0건, 정본 RG-2026-081-0142 R=11 회귀 green.

## [T21] 제출 진입점 — START_HERE.html — 2026-08-02
- 추가: 프로젝트 루트에 `START_HERE.html`(1.79MB) — 실행 없이 전체 흐름을 보는 자기완결 단일 파일. 캡처 9종(6막 전부·정본 대조 크롭·GIF 2·테스트 실행)을 base64 내장, 외부 요청 0(URL은 안내용 localhost 하나뿐). 구성: 고지문 → 실행 4줄 → 세 개의 숫자 → 한 건의 여정(RG-2026-081-0142) → 불변조건 4 + 테스트 증거 → 숫자 정직하게(상한 캐비앗) → 감지기의 현재와 다음(M1·M3).
- 이미지 확대(라이트박스) 추가: 전체 화면 캡처는 1920×1200 원본을 912px 폭으로 표시해(47.5%) 화면 속 한글이 안 읽힌다. 원인이 JPEG 품질이 아니라 표시 크기임을 원본 100% 크롭으로 확인했고(품질 82로도 판독 가능), 재인코딩 대신 클릭 시 원본 크기로 펼치는 오버레이를 넣었다(인라인 CSS+JS, +2KB, 이미지 바이트 불변). Esc·배경 클릭 닫기·포커스 복귀·스크롤 잠금 포함.
- 검증(file:// 직접 열기): 이미지 9/9 표시 · GIF 2종 재생 · 콘솔 에러 0 · 네트워크 요청은 문서 자신 1건뿐 · 다크모드 대비 충분 · 모바일 390px 가로 넘침 0 · 한글 keep-all 정상. 확대 상태에서 사유 불일치 문구·정본 출처 캡션까지 판독 확인.
- 미대응(우선순위 판단): 모바일 390px 에서 코드 블록이 가로 스크롤되고(정상 동작) 불변조건 표 첫 열이 좁게 줄바꿈된다. 심사 시나리오가 데스크톱 더블클릭이라 두었다.
- zip 구조 정리: `.gitattributes` 에 `docs/notes/ export-ignore` — 내부 메모 5종은 저장소에 보존하되 제출 zip 에서 자동 제외. 루트 md 는 README 하나.
- 재패키징: **139 files / 8.3MB**. 금지물 grep(node_modules·.next·out·data/aihub·*.db·.env.local·.DS_Store·v2-*·live-*·.github·docs/notes) **0건**.
- 테스트: vitest 60 passed / 로직 수정 0건
