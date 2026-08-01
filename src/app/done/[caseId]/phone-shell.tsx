import type { ReactNode } from 'react';

/**
 * 단순한 폰 네모 프레임.
 * transform scale 을 쓰지 않아 글자가 흐려지지 않는다.
 */
export function PhoneShell({
  time,
  children,
}: {
  time: string;
  children: ReactNode;
}) {
  return (
    <div
      className="relative mx-auto w-full max-w-[340px] overflow-hidden bg-[#1c1c1e]"
      style={{
        borderRadius: 32,
        padding: 7,
        boxShadow: '0 0 0 1px rgba(0,0,0,.14)',
      }}
    >
      <div
        className="relative flex flex-col overflow-hidden bg-chat-bg"
        style={{ borderRadius: 29, minHeight: 560, maxHeight: 620 }}
      >
        {/* 상태바 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[28px] items-end justify-between px-[18px] pb-[2px]">
          <span className="tabular text-[12px] font-semibold text-white">{time}</span>
          <span className="flex items-center gap-[5px]">
            <SignalDots />
            <BatteryMini />
          </span>
        </div>

        {/* 짧은 노치 */}
        <div
          className="pointer-events-none absolute left-1/2 top-[8px] z-30 -translate-x-1/2 bg-black"
          style={{ width: 96, height: 26, borderRadius: 14 }}
        />

        {children}

        {/* 홈 인디케이터 */}
        <div className="pointer-events-none absolute bottom-[6px] left-1/2 z-30 h-[4px] w-[108px] -translate-x-1/2 rounded-full bg-black/30" />
      </div>
    </div>
  );
}

function SignalDots() {
  return (
    <svg width="15" height="10" viewBox="0 0 15 10" aria-hidden fill="white">
      <rect x="0" y="6" width="2.5" height="4" rx="0.6" opacity=".95" />
      <rect x="4" y="4" width="2.5" height="6" rx="0.6" opacity=".95" />
      <rect x="8" y="2" width="2.5" height="8" rx="0.6" opacity=".95" />
      <rect x="12" y="0" width="2.5" height="10" rx="0.6" opacity=".4" />
    </svg>
  );
}

function BatteryMini() {
  return (
    <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="18"
        height="10"
        rx="2.5"
        stroke="white"
        strokeOpacity=".45"
        fill="none"
      />
      <rect x="2" y="2" width="13" height="7" rx="1.5" fill="white" />
      <path d="M20 3.5c.7.3 1 .8 1 1.5s-.3 1.2-1 1.5V3.5Z" fill="white" fillOpacity=".45" />
    </svg>
  );
}
