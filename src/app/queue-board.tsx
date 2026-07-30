'use client';

import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { StatusLabel, TierChip } from './ui';
import type { QueueItem } from '@/lib/views';

/**
 * 발행 대기 큐 테이블 (스펙 §4.1).
 *
 * 행 전체가 클릭·키보드 타깃이고, 열면 그 자리에서 신호 분해가 펼쳐진다.
 * hover 는 중립색이다 — 옐로는 1위 행 강조 바와 CTA 몫이라 여기서 쓰면 서로 싸운다.
 */
export function QueueBoard({ queue, samples }: { queue: QueueItem[]; samples: QueueItem[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (caseId: string) => setOpenId((prev) => (prev === caseId ? null : caseId));

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[4.5%]" />
        <col className="w-[17.5%]" />
        <col className="w-[12%]" />
        <col className="w-[6.5%]" />
        <col className="w-[14%]" />
        <col className="w-[34.5%]" />
        <col className="w-[11%]" />
      </colgroup>

      <thead>
        <tr className="h-[36px] border-b border-line bg-head text-[12px] leading-[1.5] text-muted">
          <th className="pl-[22px] text-left font-semibold">R</th>
          <th className="text-left font-semibold">감지 신호</th>
          <th className="text-left font-semibold">등기번호</th>
          <th className="text-left font-semibold">접수</th>
          <th className="text-left font-semibold">상품</th>
          <th className="text-left font-semibold">문의 요지</th>
          <th className="pr-[22px] text-right font-semibold">상태</th>
        </tr>
      </thead>

      <tbody>
        {queue.map((row) => (
          <Row
            key={row.caseId}
            row={row}
            open={openId === row.caseId}
            onToggle={() => toggle(row.caseId)}
            onOpenReview={() => router.push(`/review/${row.caseId}`)}
          />
        ))}

        <tr className="bg-paper">
          <td colSpan={7} className="border-y border-line px-[22px] py-[10px]">
            <div className="flex items-baseline">
              <span className="text-[13px] font-bold leading-[1.6] text-ink">
                저위험 무작위 표본
              </span>
              <span className="ko ml-[16px] text-[12px] leading-[1.5] text-muted">
                R = 0 이라도 일정 비율을 무작위로 검토 대상에 넣습니다. 시스템이 놓친 유형을
                발견하기 위한 장치입니다.
              </span>
            </div>
          </td>
        </tr>

        {samples.map((row) => (
          <Row
            key={row.caseId}
            row={row}
            open={openId === row.caseId}
            onToggle={() => toggle(row.caseId)}
            onOpenReview={() => router.push(`/review/${row.caseId}`)}
          />
        ))}
      </tbody>
    </table>
  );
}

function Row({
  row,
  open,
  onToggle,
  onOpenReview,
}: {
  row: QueueItem;
  open: boolean;
  onToggle: () => void;
  onOpenReview: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  }

  const cell = 'border-b border-line-soft';

  return (
    <>
      <tr
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${row.caseId} 신호 분해`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={`h-[40px] cursor-pointer transition-colors duration-[120ms] hover:bg-paper ${
          row.isPrimary ? 'bg-kb-tint' : 'bg-card'
        }`}
      >
        <td className={`relative pl-[22px] ${cell}`}>
          {row.isPrimary && <span className="absolute left-0 top-0 h-full w-[4px] bg-kb" />}
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
              row.isPrimary ? 'font-bold text-ink' : 'text-ink-soft'
            }`}
          >
            {row.caseId}
          </span>
        </td>

        <td className={cell}>
          <span className="tabular font-mono text-[13px] leading-[1.6] text-muted">
            {row.receivedAtLabel}
          </span>
        </td>

        <td className={`ko truncate pr-3 text-[14px] leading-[1.6] text-ink ${cell}`}>
          {row.product}
        </td>

        <td className={`ko truncate pr-3 text-[14px] leading-[1.6] text-ink ${cell}`}>
          {row.inquiry}
        </td>

        <td className={`pr-[22px] text-right ${cell}`}>
          <StatusLabel status={row.status} />
        </td>
      </tr>

      {open && (
        <tr className="bg-paper">
          <td colSpan={7} className="border-b border-line p-0">
            <SignalBreakdown row={row} onOpenReview={onOpenReview} />
          </td>
        </tr>
      )}
    </>
  );
}

/** 행을 열었을 때 펼쳐지는 신호 분해 (유형·티어·점수·근거 구절). */
function SignalBreakdown({ row, onOpenReview }: { row: QueueItem; onOpenReview: () => void }) {
  return (
    <div className="animate-panel flex items-start gap-[20px] px-[22px] py-[16px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-[12px]">
          <span className="text-[14px] font-bold leading-[1.4] text-ink">신호 분해</span>
          <span className="font-mono text-[13px] leading-[1.6] text-muted">{row.caseId}</span>
          <span className="ko text-[13px] leading-[1.6] text-muted">
            구절 {row.sentenceCount}건 중 {row.detectedCount}건에서 신호 발화
          </span>
        </div>

        {row.signals.length > 0 ? (
          <ul className="mt-[12px] space-y-[8px]">
            {row.signals.map((signal, index) => (
              <li key={`${signal.sentenceIdx}-${index}`} className="flex items-start gap-[10px]">
                <TierChip tier={signal.tier} />
                <span className="tabular w-[28px] shrink-0 font-mono text-[13px] leading-[1.6] text-muted">
                  ×{signal.score}
                </span>
                <span className="ko min-w-0 flex-1 text-[13px] leading-[1.6] text-ink-soft">
                  {signal.label}
                  <span className="px-[6px] text-faint">·</span>
                  {signal.sentenceIdx + 1}번 구절
                  <span className="px-[6px] text-faint">·</span>
                  근거 “<span className="font-medium text-ink">{signal.evidence}</span>”
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ko mt-[12px] text-[13px] leading-[1.6] text-muted">
            발화한 신호가 없습니다. 무작위 표본으로 선정되어 사람이 한 번 더 봅니다.
          </p>
        )}

        <p className="tabular mt-[12px] font-mono text-[13px] leading-[1.6] text-muted">
          R = {row.signals.map((signal) => signal.score).join(' + ') || 0} ={' '}
          <span className="text-[14px] font-bold text-ink">{row.r}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenReview();
        }}
        className="mt-[2px] h-[36px] shrink-0 rounded-[6px] bg-ink px-[18px] text-[13px] font-bold text-white transition-colors duration-[120ms] hover:bg-ink-soft"
      >
        검토 화면으로 →
      </button>
    </div>
  );
}
