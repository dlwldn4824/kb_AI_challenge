'use client';

import { useEffect, useRef } from 'react';
import { shortDigest } from '@/lib/digest-core';

/**
 * 발행 완료(dispatched) 케이스를 /review/[caseId] 에서 다시 열었을 때
 * 편집을 막는 순수 표시용 UI. 서버·이벤트·projection 은 건드리지 않는다 —
 * 여기 컴포넌트들은 CaseView 에 이미 있는 값만 그대로 보여준다.
 */

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** ISO8601(KST) → `YYYY-MM-DD HH:MM:SS` (done-screen.tsx 의 tsLabel 과 동일 표기). */
function tsLabel(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * 읽기 전용은 경고가 아니다.
 *
 * 옐로는 화면당 CTA 하나에만 쓴다는 규약이 있고, 이 상태는 "무언가 잘못됐다"가 아니라
 * "이미 끝났다"에 가깝다. 그래서 색으로 말하지 않고 자물쇠와 중립 회색으로만 말한다.
 * 붉은 계열도 쓰지 않는다 — 차단(danger)과 섞이면 층위가 무너진다.
 */
export function SealedBanner({ sealedAt }: { sealedAt: string | null }) {
  return (
    <section className="shrink-0 border-b border-line bg-head">
      <div className="mx-auto flex w-full max-w-[1520px] items-center gap-[14px] px-8 py-[12px]">
        <LockIcon className="h-[18px] w-[18px] shrink-0 text-ink-soft" />
        <div className="min-w-0">
          <p className="text-[14px] font-bold leading-[1.4] text-ink">발행 완료 · 읽기 전용</p>
          <p className="ko mt-[2px] text-[13px] leading-[1.6] text-muted">
            봉인 시각{' '}
            <span className="tabular font-mono">{sealedAt ? `${tsLabel(sealedAt)} KST` : '—'}</span>
            <span className="px-[8px] text-faint">·</span>
            이 화면에서는 수정할 수 없습니다
          </p>
        </div>
      </div>
    </section>
  );
}

export function SealedBlockModal({
  caseId,
  sealedAt,
  contentDigest,
  onClose,
}: {
  caseId: string;
  sealedAt: string | null;
  contentDigest: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sealed-block-title"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-[480px] rounded-[8px] border border-line bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-[12px] border-b border-line px-[20px] py-[16px]">
          <LockIcon className="mt-[2px] h-[18px] w-[18px] shrink-0 text-ink-soft" />
          <h2 id="sealed-block-title" className="type-subtitle text-[16px] leading-[1.35] text-ink">
            이미 발행된 등기입니다
          </h2>
        </div>

        <div className="px-[20px] py-[16px]">
          <dl className="grid grid-cols-[92px_1fr] gap-y-[10px] text-[13px] leading-[1.6]">
            <dt className="text-muted">등기번호</dt>
            <dd className="tabular font-mono text-ink">{caseId}</dd>
            <dt className="text-muted">봉인 시각</dt>
            <dd className="tabular font-mono text-ink">
              {sealedAt ? `${tsLabel(sealedAt)} KST` : '—'}
            </dd>
            <dt className="text-muted">봉인 sha256</dt>
            <dd className="font-mono text-ink">
              {contentDigest ? shortDigest(contentDigest) : '—'}
            </dd>
          </dl>

          {/* 재발행은 이번 스코프 밖이라 버튼을 두지 않는다.
              누를 수 없는 컨트롤은 "곧 된다"는 잘못된 신호만 준다. */}
          <p className="ko mt-[16px] text-[13px] leading-[1.6] text-muted">
            내용을 바로잡아야 한다면 새 등기로 다시 발행하는 것이 원칙입니다.
            <br />
            기존 등기는 삭제되지 않고 이력으로 남습니다.
          </p>
        </div>

        <div className="border-t border-line px-[20px] py-[16px]">
          <button
            type="button"
            onClick={onClose}
            className="h-[40px] w-full rounded-[6px] border border-line bg-card text-[13px] font-bold text-ink transition-colors duration-[120ms] hover:bg-paper"
          >
            읽기 전용으로 보기
          </button>
        </div>
      </div>
    </div>
  );
}
