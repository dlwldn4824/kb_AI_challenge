'use client';

import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { Sheet, StatusLabel, TierChip } from './ui';
import type { QueueItem, QueueView } from '@/lib/view-model';
import type { Tier } from '@/lib/scoring';

/** 이 값 이상이면 "개입 필요"로 앞세운다. 정본 케이스(11)와 8점 케이스가 여기 걸린다. */
const INTERVENTION_R = 8;

const FILTERS: Array<{ label: string; tier: Tier | null }> = [
  { label: '전체', tier: null },
  { label: 'S 고위험', tier: 'S' },
  { label: 'A 중위험', tier: 'A' },
  { label: 'B 저위험', tier: 'B' },
];

/**
 * 발행 대기 큐 (스펙 §4.1).
 *
 * 목록은 훑어보는 화면이라, 고른 행의 근거는 열고 닫는 패널이 아니라
 * 우측에 늘 떠 있는 분석 패널에서 읽는다.
 */
export function QueueConsole({ data }: { data: QueueView }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Tier | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(data.queue[0]?.caseId ?? null);

  const matches = (row: QueueItem) => filter === null || row.tiers.includes(filter);
  const queue = data.queue.filter(matches);
  // 티어를 고르면 신호가 없는 표본은 대상이 아니다.
  const samples = filter === null ? data.samples : [];

  const selected =
    [...data.queue, ...data.samples].find((row) => row.caseId === selectedId) ?? queue[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-[20px]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-[8px] pb-[12px]">
          {FILTERS.map((option) => {
            const active = option.tier === filter;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.tier)}
                className={`h-[32px] rounded-[6px] border px-[14px] text-[13px] leading-[1.6] transition-colors duration-[120ms] ${
                  active
                    ? 'border-ink bg-ink font-bold text-white'
                    : 'border-line bg-card text-ink hover:bg-paper'
                }`}
              >
                {option.label}
              </button>
            );
          })}
          <span className="ml-auto text-[13px] leading-[1.6] text-muted">
            현재 목록 <span className="tabular font-semibold text-ink">{queue.length}</span>건
            {samples.length > 0 && (
              <>
                <span className="px-[8px] text-faint">·</span>
                표본 <span className="tabular font-semibold text-ink">{samples.length}</span>건
              </>
            )}
          </span>
        </div>

        <Sheet className="flex min-h-0 flex-1 flex-col overflow-hidden" padded={false}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[17%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
                <col className="w-[15%]" />
                <col className="w-[23%]" />
                <col className="w-[12%]" />
              </colgroup>

              <thead className="sticky top-0 z-10">
                <tr className="h-[40px] border-b border-line bg-head text-[13px] leading-[1.5] text-muted">
                  <th className="bg-head pl-[20px] text-left font-semibold">개입 필요도</th>
                  <th className="bg-head text-left font-semibold">감지 신호</th>
                  <th className="bg-head text-left font-semibold">등기번호</th>
                  <th className="bg-head text-left font-semibold">접수</th>
                  <th className="bg-head text-left font-semibold">상품</th>
                  <th className="bg-head text-left font-semibold">문의 요지</th>
                  <th className="bg-head pr-[20px] text-right font-semibold">상태</th>
                </tr>
              </thead>

              <tbody>
                {queue.map((row) => (
                  <Row
                    key={row.caseId}
                    row={row}
                    selected={row.caseId === selected?.caseId}
                    onSelect={() => setSelectedId(row.caseId)}
                  />
                ))}

                {samples.length > 0 && (
                  <tr className="bg-paper">
                    <td colSpan={7} className="border-y border-line px-[20px] py-[10px]">
                      <div className="flex items-baseline">
                        <span className="text-[13px] font-bold leading-[1.6] text-ink">
                          저위험 무작위 표본
                        </span>
                        <span className="ko ml-[16px] text-[12px] leading-[1.5] text-muted">
                          개입 필요도가 0이어도 일정 비율을 무작위로 검토합니다. 시스템이
                          놓친 유형을 찾기 위한 장치입니다.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {samples.map((row) => (
                  <Row
                    key={row.caseId}
                    row={row}
                    selected={row.caseId === selected?.caseId}
                    onSelect={() => setSelectedId(row.caseId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>
      </div>

      <AnalysisPanel
        row={selected}
        kpi={data.kpi}
        onOpenReview={(caseId) => router.push(`/review/${caseId}`)}
      />
    </div>
  );
}

function Row({
  row,
  selected,
  onSelect,
}: {
  row: QueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  }

  const cell = 'border-b border-line-soft';

  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`h-[52px] cursor-pointer transition-colors duration-[120ms] hover:bg-paper ${
        selected ? 'bg-kb-tint' : 'bg-card'
      }`}
    >
      <td className={`relative pl-[20px] ${cell}`}>
        {selected && <span className="absolute left-0 top-0 h-full w-[4px] bg-kb" />}
        <span
          className={`tabular text-[16px] font-bold leading-[1.05] ${
            row.r === 0 ? 'text-faint' : 'text-ink'
          }`}
        >
          {row.r}
        </span>
      </td>

      <td className={cell}>
        {row.tiers.length > 0 ? (
          <span className="flex items-center gap-[5px]">
            {row.tiers.map((tier, index) => (
              <TierChip key={`${tier}-${index}`} tier={tier} />
            ))}
          </span>
        ) : (
          <span className="text-[13px] leading-[1.6] text-faint">징후 없음</span>
        )}
      </td>

      <td className={cell}>
        <span
          className={`font-mono text-[13px] leading-[1.6] ${
            selected ? 'font-bold text-ink' : 'text-ink-soft'
          }`}
        >
          {row.caseId}
        </span>
      </td>

      <td className={cell}>
        <span className="tabular block font-mono text-[13px] leading-[1.5] text-ink-soft">
          {row.receivedAtLabel}
        </span>
        <span className="ko block text-[12px] leading-[1.4] text-faint">{row.receivedAgo}</span>
      </td>

      <td className={`ko truncate pr-3 text-[14px] leading-[1.6] text-ink ${cell}`}>
        {row.product}
      </td>

      <td className={`ko truncate pr-3 text-[14px] leading-[1.6] text-ink ${cell}`}>
        {row.inquiry}
      </td>

      <td className={`pr-[20px] text-right ${cell}`}>
        {row.r >= INTERVENTION_R ? (
          <span className="inline-flex h-[24px] items-center rounded-[4px] bg-warn-bg px-[10px] text-[12px] font-semibold text-warn">
            개입 필요
          </span>
        ) : (
          <StatusLabel status={row.status} />
        )}
      </td>
    </tr>
  );
}

/** 고른 행의 개입 필요도가 어떻게 나온 값인지 늘 보여 주는 패널. */
function AnalysisPanel({
  row,
  kpi,
  onOpenReview,
}: {
  row: QueueItem | null;
  kpi: QueueView['kpi'];
  onOpenReview: (caseId: string) => void;
}) {
  const humanReviewed = kpi.interventionNeeded + kpi.randomSamples;

  return (
    <Sheet className="flex h-full max-h-full w-[360px] shrink-0 flex-col overflow-y-auto">
      <h2 className="type-subtitle text-[17px] leading-[1.35] text-ink">
        개입 필요도 분석
      </h2>

      {row ? (
        <>
          <div className="mt-[14px] flex items-center gap-[10px]">
            <span className="font-mono text-[14px] font-bold leading-[1.4] text-ink">
              {row.caseId}
            </span>
            {row.r >= INTERVENTION_R && (
              <span className="inline-flex h-[22px] items-center rounded-[4px] bg-warn-bg px-[8px] text-[12px] font-semibold text-warn">
                개입 필요
              </span>
            )}
          </div>
          <p className="ko mt-[4px] text-[13px] leading-[1.6] text-muted">
            {row.product}
            <span className="px-[8px] text-faint">·</span>
            {row.receivedAgo}
          </p>

          <p className="mt-[16px] flex items-baseline gap-[8px]">
            <span className="text-[14px] font-semibold leading-[1.4] text-muted">개입 필요도</span>
            <span className="tabular text-[30px] font-bold leading-[1.05] tracking-[-0.02em] text-ink">
              {row.r}
            </span>
          </p>

          <ul className="mt-[14px] border-t border-line pt-[12px]">
            {row.signals.length > 0 ? (
              row.signals.map((signal, index) => (
                <li
                  key={`${signal.sentenceIdx}-${index}`}
                  className="flex items-center gap-[10px] py-[7px]"
                >
                  <TierChip tier={signal.tier} />
                  <span className="ko min-w-0 flex-1 truncate text-[13px] leading-[1.6] text-ink">
                    {signal.label}
                  </span>
                  <span className="tabular font-mono text-[13px] font-semibold text-ink">
                    {signal.score}
                  </span>
                </li>
              ))
            ) : (
              <li className="ko py-[7px] text-[13px] leading-[1.6] text-muted">
                발화한 신호가 없습니다. 무작위 표본으로 선정되어 사람이 한 번 더 봅니다.
              </li>
            )}
          </ul>

          <p className="ko border-t border-line pt-[10px] text-[12px] leading-[1.5] text-muted">
            위험 신호(S·A·B) 점수를 더한 값입니다. 높을수록 먼저 검토합니다.
          </p>

          <button
            type="button"
            onClick={() => onOpenReview(row.caseId)}
            className="mt-[16px] h-[40px] w-full rounded-[6px] bg-ink text-[13px] font-bold text-white transition-colors duration-[120ms] hover:bg-ink-soft"
          >
            검토 화면으로 →
          </button>
        </>
      ) : (
        <p className="ko mt-[14px] text-[13px] leading-[1.6] text-muted">
          이 조건에 해당하는 상담 건이 없습니다.
        </p>
      )}

      {/*
        첫 줄이 원칙(전 건 승인), 둘째 줄이 선별(먼저 볼 순서)이다.
        "고른 것만 본다"로 읽히면 승인 없이 나가는 건이 있다는 오해가 생긴다.
      */}
      <div className="ko mt-[16px] border-t border-line pt-[12px] text-[13px] leading-[1.6]">
        <p className="text-ink">
          <span className="tabular font-semibold">{kpi.draftsToday.toLocaleString()}</span>건
          전부, 승인 없이는 나가지 않습니다.
        </p>
        <p className="mt-[2px] text-muted">
          시스템은 그중 깊게 볼{' '}
          <span className="tabular font-semibold text-ink">{humanReviewed}</span>건을 먼저
          보여줍니다.
        </p>
      </div>
    </Sheet>
  );
}
