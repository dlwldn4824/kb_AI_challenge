# DECK_ASSETS — 덱 조립용 자산 매핑 (디자이너 참조 단일 문서)

> 확인일 2026-08-02. 모든 캡처는 디자인 병합(6e0c590) + 고지문 푸터 반영본, 1920×1200.
> 수치는 손으로 옮기지 말고 아래 "JSON 원 위치"에서 복사할 것 (드리프트 방지).

## 페이지 → 자산 매핑

| 덱 페이지 | 자산 파일 | 처리 지침 |
|---|---|---|
| 12 큐 (고르기·12:49) | `verify-shots/deck-01-queue.png` | 목업 유지 가능 · 여정 칩 "고르기 · 12:49" · 하단 카피 "1,248건 전부, 승인 없이는 나가지 않습니다" |
| 13 검토 (판단·설명하기·12:52) | `verify-shots/deck-02-review-mismatch.png` + `verify-shots/deck-06-crop.png` | 정본 출처 라벨 크롭(deck-06-crop)을 인셋으로 추가 — "정본이 꽂힐 자리" 실물 |
| 14 차단 (재확인하기·12:54) | `verify-shots/deck-03-blocked-diff.png` | ★브라우저로 png를 열어 재촬영 금지 — **원본을 슬라이드에 직접 삽입, 풀블리드** |
| 15 등기 (등기 조회·6개월 뒤) | `verify-shots/deck-04-registry-timeline.png` | **한 장만**(두 노트북 구도 금지) · 캡션 "추가 보고 없이, 등기번호 하나로 복원됩니다" |
| 13/15 보조 | `verify-shots/gif-01-coherence.gif` (발표용 동영상 대체) | 정지 덱에는 미사용, 발표 백업 |
| 16 검증① 데이터 | (텍스트) 45,000건 · 36.6% | 원 위치: `docs/aihub-stats.json → dataset.files = 45000`, `sensitive_share.measured_detector = 0.3664` |
| 17 검증② 시험지 | `verify-shots/deck-06-kb-source.png` (선택) | 오류 주입 3단(정본 추출→주입→감지) 도식은 PPT 측 제작 |
| 17.5 검증③ 결과 — 두 실험 카드 | (수치) 아래 JSON 원 위치 참조 | **실상담 카드**: 무작위 8건 → 큐 12건 (유형별: 수치 4/8 · 삭제형 0/8) / **합성·정본 완전 카드**: 39자리 전부 · 헛걸음 0 + 결론 "선별 성능은 정본 커버리지의 함수" + T16 null 각주 |
| 18 가치 (환경) | (텍스트) 12,800건/일 · 최대 50% 과징금 · 민원 +24% | 출처: `docs/IMPACT_NARRATIVE.md` 숫자→출처 매핑 표 |
| 19 가치 (응답) | `docs/evidence-invariants-green.png` | 인셋 허용 · 차단 100% · 재생 100% · 575h→87h(가정 명시) |
| 20 아키텍처 | (도식) PPT 측 제작 | 문구: "기존 발송 API 앞에 게이트 한 층" + AI 배치 원칙 |
| 22 클로징 | (텍스트) RG-2026-081-0142 | 등기번호로 마무리 · 데모 URL 제외 |

## 17.5장 수치의 JSON 원 위치 (복사 원천)

| 표기 | 값 | 원 위치 (경로 → 키) |
|---|---|---|
| 실상담 · 큐 12건 | 12/48 | `docs/eval-results-aihub.json → runs[detector="v2", ranking="R+confirmedHits"].hits` |
| 실상담 · 무작위 8건 | 7.79/48 (표기 "8건") | `docs/eval-results-aihub.json → runs[ranking^="random"].hits` |
| 실상담 · Recall 25.0% / 무작위의 1.5배 | 0.25 vs 0.1624 (25.0÷16.2=1.54) | 같은 파일 `runs[].recall_at_39` |
| 실상담 · 유형별 수치 4/8, 삭제형(자격) 0/8 | by_error_type | `runs[0].by_error_type.수치바꿔치기 = 4`, `.자격요건삭제 = 0` |
| 합성 · 39자리 전부 | 39/48 (상한 39/39) | `docs/eval-results.json → runs[detector="v2", ranking="R+confirmedHits"].hits = 39` |
| 합성 · 헛걸음 0 | precision 1.0 | 같은 run `.precision_at_39 = 1` |
| T16 null 각주 | v2.1 = v2 (12건 동일) | `docs/eval-results-aihub.json → runs[detector="v2.1 enriched-reference"]` — "표면 보강으로는 안 오른다: 문서 차원의 정본 필요" |
| 등기 타임라인 16건 | 이벤트 16건 | deck-04 캡처 헤더 "이벤트 16건 재생" |

## 사용 금지 자산 (zip·덱 공통)

| 파일 | 사유 |
|---|---|
| `verify-shots/v2-*.png` | 구버전 디자인 (폐기 대상) |
| `verify-shots/live-*.png` | 브라우저 URL 노출 (내부 증거용) |
| `verify-shots/shot-*·kb-*·final-*` (있는 경우) | 중간 이터레이션 |

## 파일 존재 확인 (2026-08-02)

deck-01~05 ✓ · deck-06-kb-source ✓ · deck-06-crop ✓ · gif-01 ✓ · gif-02 ✓ ·
t3-fact-comparison-mismatch ✓ · m1-sealed-lock ✓ · evidence-invariants-green ✓ · evidence-tamper-demo ✓
