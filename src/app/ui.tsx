import type { ReactNode } from 'react';
import type { SignalType, Tier } from '@/lib/scoring';
import type { CaseStatus } from '@/lib/projection';

/**
 * 세 화면이 공유하는 UI 조각.
 *
 * 레이아웃 구조는 design-refs/screen-0X-*.png(Figma 정본),
 * 색·타이포·면 처리는 docs/UI_MENTOR_NOTES.md 를 따른다.
 * 면은 헤어라인으로 나누고, 그림자는 "떠 있는 것" 둘(토스트·폰 목업)에만 쓴다.
 */

export function Shell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[1720px] px-10 pb-[28px] ${className}`}>{children}</div>
  );
}

/** 백오피스 면 — 그림자 없이 1px 헤어라인으로만 구획한다 (멘토 [2]). */
export function Sheet({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[8px] border border-line bg-card ${
        padded ? 'px-[20px] py-[16px]' : ''
      } ${className}`}
    >
      {children}
    </section>
  );
}

const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
};

/** 티어 칩 — pdf-ref-10 정본. 이 3색은 브랜드 옐로보다 우선한다. */
export function TierChip({ tier, size = 'sm' }: { tier: Tier; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] font-bold text-ink ${
        size === 'md' ? 'h-[22px] w-[26px] text-[12px]' : 'h-[20px] w-[24px] text-[12px]'
      } ${TIER_BG[tier]}`}
    >
      {tier}
    </span>
  );
}

/** 신호 구간(flagStart~flagEnd)만 티어 색으로 파스텔 마킹한다. */
export function SignalText({
  text,
  start,
  end,
  tier,
}: {
  text: string;
  start: number | null;
  end: number | null;
  tier: Tier | null;
}) {
  if (start === null || end === null || tier === null || start >= end || end > text.length) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, start)}
      <span className={`rounded-[4px] px-[3px] py-[1px] font-semibold text-ink ${TIER_BG[tier]}`}>
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

/** 신호 유형별 한 줄 설명. 큐에서는 반복이라 빼고 검토 화면에서만 쓴다 (멘토 [4]). */
/**
 * 티어별 법 근거 (T3 위층 라벨). 티어는 금소법 의무 위계에서 오므로 고정값이고,
 * 아래층의 감지 근거(정본 대조)만 규칙 개선으로 달라진다.
 *
 * 조문 번호는 적지 않는다. 합성 데모 화면에 확인되지 않은 조항 번호를 박으면
 * 그 자체가 사실 오류가 된다 — 의무의 성격만 서술한다.
 */
export const TIER_BASIS: Record<Tier, string> = {
  S: '설명의무 대상 — 금액·금리·면제조건 등 계약의 핵심 사항',
  A: '적합성·불이익 고지 대상 — 자격 요건과 불이익 사항',
  B: '절차 안내 정확성 — 서류·기한 등 이행 정보',
};

export const SIGNAL_NOTE: Record<SignalType, string> = {
  numeric_change: '금액·금리·수수료 수치가 실제 조건과 어긋날 수 있는 구절입니다',
  exemption_condition: '면제·비과세 부과 조건이 빠지거나 바뀔 수 있는 구절입니다',
  overcertainty: '조건부로 안내해야 할 내용을 단정으로 말한 구절입니다',
  deadline_eligibility: '기한·계약기간·자격 요건이 걸린 구절입니다',
  disadvantage_omission: '고객의 해당 여부를 확인할 수 없는 상태의 자격·불이익 안내입니다',
  procedure_document: '절차·서류 안내가 실제 처리 기준과 어긋날 수 있는 구절입니다',
};

/**
 * 상태 표시 (멘토 [3]).
 * 배지는 예외 표시 도구다. 모든 행에 알약을 붙이면 R·티어 칩이라는 진짜 신호를 덮는다.
 * 그래서 `차단`만 알약으로 남기고 나머지는 텍스트 위계로 구분한다.
 */
export function StatusLabel({ status }: { status: CaseStatus }) {
  if (status === '차단') {
    return (
      <span className="inline-flex h-[24px] items-center rounded-[4px] bg-danger-bg px-[10px] text-[13px] font-semibold text-danger">
        차단
      </span>
    );
  }

  if (status === '검토 중') {
    return (
      <span className="inline-flex items-center gap-[7px] text-[13px] text-ink-soft">
        <span className="h-[6px] w-[6px] rounded-full bg-kb-star" />
        검토 중
      </span>
    );
  }

  const tone = status === '검토 완료' || status === '표본 검토' ? 'text-faint' : 'text-ink';
  return <span className={`text-[13px] ${tone}`}>{status}</span>;
}

export function SectionHead({
  title,
  note,
  right,
}: {
  title: string;
  note?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-[28px] items-center">
      <h2 className="text-[16px] font-bold leading-[1.35] tracking-[-0.01em] text-ink">{title}</h2>
      {note && <span className="ko ml-[12px] text-[13px] leading-[1.6] text-muted">{note}</span>}
      {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
    </div>
  );
}

/** KPI 셀. 수치는 34/700/1.05 tabular (멘토 [11]). */
export function KpiCell({
  label,
  value,
  unit,
  accent,
  size = 'lg',
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  size?: 'lg' | 'md';
}) {
  return (
    <div>
      <div className="text-[13px] leading-[1.35] text-muted">{label}</div>
      <div className="mt-[10px] flex items-baseline gap-[6px]">
        <span
          className={`tabular font-bold leading-[1.05] tracking-[-0.02em] ${
            size === 'lg' ? 'text-[34px]' : 'text-[28px]'
          } ${accent ? 'text-danger' : 'text-ink'}`}
        >
          {value}
        </span>
        {unit && <span className="text-[13px] leading-[1.5] text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`animate-spin inline-block h-[14px] w-[14px] rounded-full border-[2px] border-current border-t-transparent ${className}`}
    />
  );
}

/** API 실패를 알리는 토스트 (한국어). 떠 있는 표면이라 그림자를 쓴다. */
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="animate-toast fixed bottom-[28px] right-[28px] z-50 flex max-w-[440px] items-start gap-3 rounded-[8px] bg-ink px-[18px] py-[14px] text-[13px] leading-[1.6] text-white shadow-raised"
    >
      <span className="ko">{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="ml-2 shrink-0 rounded-[4px] px-1 text-white/60 transition-colors hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
