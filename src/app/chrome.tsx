import Link from 'next/link';
import type { ReactNode } from 'react';
import { asset } from '@/lib/asset-path';
import { SYNTHETIC_BADGE } from '@/lib/constants';

export interface ChromeTab {
  label: string;
  href: string;
  active: boolean;
}

/**
 * 모든 화면 상단의 chrome 바.
 *
 * 상단 3px KB 옐로 액센트 라인 → 화이트 헤더 → 1px 보더.
 * 우측 메타는 항목마다 서체가 다르다: 등기번호·시각·R 같이 자릿수가 의미 있는 값만
 * mono 를 쓰고, 팀·상품명 같은 한글은 산세리프로 둔다 (멘토 [9]).
 * SYNTHETIC DEMO 배지는 어느 화면에서도 사라지지 않는다. 색만 중립이다 (멘토 [7]).
 */
export function Chrome({
  screen,
  meta = [],
  tabs = [],
}: {
  screen: string;
  meta?: ReactNode[];
  /** 화면 사이 이동 탭. 실제로 가는 곳만 둔다 — 죽은 메뉴는 만들지 않는다. */
  tabs?: ChromeTab[];
}) {
  return (
    <header className="sticky top-0 z-30 shrink-0">
      <div className="h-[3px] bg-kb" />
      <div className="border-b border-line bg-card">
        <div className="mx-auto flex h-[52px] w-full max-w-[1720px] items-center px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset("/brand/kb-logo.svg")}
            alt="KB국민은행"
            width={61}
            height={20}
            className="h-[20px] w-auto"
          />
          <span className="mx-[14px] h-[16px] w-px bg-line" />
          <h1 className="text-[15px] font-bold leading-[1.3] tracking-[-0.01em] text-ink">
            답변등기
            {tabs.length === 0 && (
              <>
                <span className="px-[3px] font-normal text-faint">·</span>
                {screen}
              </>
            )}
          </h1>

          {tabs.length > 0 && (
            <nav className="ml-[20px] flex h-[52px] items-stretch gap-[4px]">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={tab.active ? 'page' : undefined}
                  className={`flex items-center border-b-[2px] px-[12px] text-[14px] leading-[1.4] transition-colors duration-[120ms] ${
                    tab.active
                      ? 'border-kb font-bold text-ink'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-[12px] text-[13px] leading-[1.5] text-muted">
            {meta.map((item, index) => (
              <span key={index} className="flex items-center gap-[12px]">
                {index > 0 && <span className="text-line">|</span>}
                {item}
              </span>
            ))}
            <span className="ml-[4px] inline-flex h-[24px] items-center rounded-[4px] border border-line bg-card px-[10px] text-[12px] font-medium leading-[1.5] text-muted">
              {SYNTHETIC_BADGE}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
