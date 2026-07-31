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
