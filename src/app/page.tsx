import { Chrome } from './chrome';
import { QueueBoard } from './queue-board';
import { KpiCell, Sheet, Shell } from './ui';
import { ACTOR_ID, ACTOR_TEAM } from '@/lib/constants';
import { DISPLAY } from '@/fixtures/stats';
import { buildQueue } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 발행 대기 큐 (스펙 §4.1).
 *
 * KPI 와 큐는 카드 여러 장이 아니라 한 장의 흰 시트다 (Figma 정본 · 멘토 [1]).
 * KPI 총량은 fixture 상수, 큐는 전부 이벤트 재생 결과다.
 */
export default function QueuePage() {
  const { kpi, rFormula, queue, samples } = buildQueue();
  const [formula, formulaNote] = rFormula.split(' · ');
  // 사람이 본 건 = 개입 필요 + 저위험 무작위 표본. fixture 상수에서 계산한다.
  const humanReviewed = kpi.interventionNeeded + kpi.randomSamples;
  const humanReviewedRate = ((humanReviewed / kpi.draftsToday) * 100).toFixed(1);

  return (
    <main className="stage-scroll flex flex-col bg-page">
      <Chrome
        screen="발행 대기"
        meta={[
          <span key="ts">
            현재 시각 <span className="tabular font-mono">{DISPLAY.chromeTimestamp}</span>
          </span>,
          ACTOR_TEAM,
          <span key="actor">
            상담원 <span className="font-mono">{ACTOR_ID}</span>
          </span>,
        ]}
      />

      <Shell className="flex min-h-0 flex-1 flex-col">
        <Sheet className="mt-[20px] flex min-h-0 flex-1 flex-col overflow-hidden" padded={false}>
          <div className="grid min-h-[84px] grid-cols-[1fr_1fr_1fr_1fr_366px] border-b border-line">
            <div className="px-[22px] py-[16px]">
              <KpiCell label="오늘 AI 초안" value={kpi.draftsToday.toLocaleString()} unit="건" />
            </div>

            <div className="relative border-l border-line-soft px-[22px] py-[16px]">
              <span className="absolute left-0 top-0 h-full w-[4px] bg-kb" />
              <KpiCell
                label="개입 필요"
                value={String(kpi.interventionNeeded)}
                unit={`건 (${kpi.interventionRate}%)`}
              />
            </div>

            <div className="border-l border-line-soft px-[22px] py-[16px]">
              <KpiCell label="저위험 무작위 표본" value={String(kpi.randomSamples)} unit="건" />
            </div>

            <div className="border-l border-line-soft px-[22px] py-[16px]">
              <KpiCell label="검토 대기" value={String(kpi.pendingReview)} unit="건" />
            </div>

            <div className="border-l border-line-soft bg-kb-tint px-[22px] py-[16px]">
              <div className="text-[13px] leading-[1.35] text-muted">개입 필요도</div>
              <div className="tabular ko mt-[10px] text-[13px] font-bold leading-[1.6] text-ink">
                {formula}
              </div>
              <div className="ko mt-[6px] text-[12px] leading-[1.5] text-muted">{formulaNote}</div>
            </div>
          </div>

          <QueueBoard queue={queue} samples={samples} />

          {/* 이 큐가 무엇을 뜻하는지 한 줄로 — 오늘 만들어진 초안 중 사람 손을 탄 비율 */}
          <p className="ko mt-auto border-t border-line px-[22px] py-[14px] text-[13px] leading-[1.6] text-muted">
            오늘 생성된 <span className="tabular font-bold text-ink">
              {kpi.draftsToday.toLocaleString()}
            </span>건 중, 사람이 본 것은{' '}
            <span className="tabular font-bold text-ink">{humanReviewed}</span>건입니다 (
            <span className="tabular font-bold text-ink">{humanReviewedRate}%</span>)
          </p>
        </Sheet>
      </Shell>
    </main>
  );
}
