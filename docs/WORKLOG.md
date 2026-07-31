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
