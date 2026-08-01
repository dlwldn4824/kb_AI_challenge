import { Chrome } from './chrome';
import { AlertIcon, DeltaArrow, DocumentIcon, PeopleIcon, ShieldIcon } from './icons';
import { QueueConsole } from './queue-console';
import { Sheet, Shell } from './ui';
import { ACTOR_ID, ACTOR_TEAM } from '@/lib/constants';
import { DISPLAY } from '@/fixtures/stats';
import type { QueueView } from '@/lib/view-model';

/**
 * 발행 대기 큐 화면 (스펙 §4.1).
 *
 * 목록을 훑는 화면이므로 "무슨 화면인지 → 오늘 규모 → 무엇을 볼지" 순으로 읽히게 둔다.
 * 데이터가 어디서 왔는지는 모른다 — 서버 모드는 SQLite 재생 결과를,
 * 정적 데모 모드는 브라우저 스토어 재생 결과를 같은 모양으로 넘겨준다.
 */
export function QueueScreen({ data }: { data: QueueView }) {
  const { kpi } = data;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-page">
      <div className="shrink-0">
      <Chrome
        screen="발행 대기"
        tabs={[
          { label: '검토 대기', href: '/', active: true },
          ...(data.lastPublishedCaseId
            ? [{ label: '발행 완료', href: `/done/${data.lastPublishedCaseId}`, active: false }]
            : []),
        ]}
        meta={[
          <span key="ts">
            현재 시각 <span className="tabular font-mono">{DISPLAY.chromeTimestamp}</span>
          </span>,
          <span key="actor">
            {ACTOR_TEAM} · 김국민 대리 <span className="font-mono">({ACTOR_ID})</span>
          </span>,
        ]}
      />
      </div>
      <Shell className="flex min-h-0 flex-1 flex-col pb-[20px]">
        <header className="shrink-0 pt-[24px]">
          <h1 className="type-title text-[32px] leading-[1.2] text-ink">검토 대기</h1>
          <p className="ko mt-[8px] max-w-[42rem] text-[16px] leading-[1.7] text-muted">
            시스템이 먼저 확인이 필요한 AI 상담 답변을 골라 보여줍니다.
          </p>
        </header>

        <div className="flex shrink-0 gap-[14px] pb-[20px] pt-[18px]">
          <KpiCard
            icon={<DocumentIcon />}
            tone="neutral"
            label="오늘 생성된 AI 초안"
            value={kpi.draftsToday.toLocaleString()}
            delta={kpi.delta.draftsToday}
          />
          <KpiCard
            icon={<AlertIcon />}
            tone="warn"
            label="개입 필요"
            value={String(kpi.interventionNeeded)}
            note={`전체의 ${kpi.interventionRate}%`}
            delta={kpi.delta.interventionNeeded}
          />
          <KpiCard
            icon={<ShieldIcon />}
            tone="ok"
            label="저위험 무작위 표본"
            value={String(kpi.randomSamples)}
            delta={kpi.delta.randomSamples}
          />
          <KpiCard
            icon={<PeopleIcon />}
            tone="neutral"
            label="검토 대기"
            value={String(kpi.pendingReview)}
            delta={kpi.delta.pendingReview}
          />
        </div>

        <QueueConsole data={data} />
      </Shell>
    </main>
  );
}

const TONE: Record<string, string> = {
  neutral: 'bg-head text-ink-soft',
  warn: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
};

function KpiCard({
  icon,
  tone,
  label,
  value,
  note,
  delta,
}: {
  icon: React.ReactNode;
  tone: 'neutral' | 'warn' | 'ok';
  label: string;
  value: string;
  note?: string;
  delta: number;
}) {
  const up = delta >= 0;

  return (
    <Sheet className="flex-1">
      <div className="flex items-start gap-[14px]">
        <span
          className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] ${TONE[tone]}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="ko text-[14px] leading-[1.4] text-muted">{label}</p>
          <p className="mt-[6px] flex items-baseline gap-[5px]">
            <span className="type-title tabular text-[32px] leading-[1.05] text-ink">
              {value}
            </span>
            <span className="text-[14px] leading-[1.5] text-muted">건</span>
            {note && <span className="text-[13px] leading-[1.5] text-faint">{note}</span>}
          </p>
          <p className="ko mt-[6px] flex items-center gap-[4px] text-[13px] leading-[1.5] text-muted">
            전일 대비
            <span className="tabular font-semibold text-ink-soft">
              {up ? '+' : ''}
              {delta}건
            </span>
            <span className="text-faint">
              <DeltaArrow up={up} />
            </span>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
