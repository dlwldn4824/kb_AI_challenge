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
