import type { ReactNode } from 'react';

/**
 * iPhone 15 Pro 프레임 (논리 해상도 393×852pt).
 *
 * 이미지 에셋 없이 CSS·인라인 SVG 로만 그린다. pt 값은 실기기 스펙 그대로 두고
 * `scale` 로만 줄여서, 어떤 폭에서도 비율·모서리·다이내믹 아일랜드 비례가 유지된다.
 * 그림자는 절제 원칙에 맞춰 0 2px 12px 한 겹만 쓰고, 티타늄 엣지는 1px 아웃라인으로 암시한다.
 */
export const IPHONE_PT = { width: 393, height: 852 };

export function IPhoneFrame({
  scale = 1,
  statusBarTone = 'light',
  homeIndicatorTone = 'light',
  time = '12:54',
  children,
}: {
  scale?: number;
  /** 상태바 글리프 색 — 헤더가 어두우면 light. */
  statusBarTone?: 'light' | 'dark';
  homeIndicatorTone?: 'light' | 'dark';
  time?: string;
  children: ReactNode;
}) {
  const pt = (value: number) => value * scale;
  const bezel = pt(4.5);
  const screenWidth = pt(IPHONE_PT.width);
  const screenHeight = pt(IPHONE_PT.height);
  const glyph = statusBarTone === 'light' ? '#FFFFFF' : '#1B1B1D';

  return (
    <div
      className="relative shrink-0 bg-[#1B1B1D]"
      style={{
        width: screenWidth + bezel * 2,
        height: screenHeight + bezel * 2,
        padding: bezel,
        borderRadius: pt(55) + bezel,
        boxShadow: '0 0 0 1px rgba(138,138,142,.4), 0 2px 12px rgba(38,40,44,.10)',
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden"
        style={{ borderRadius: pt(55) }}
      >
        {children}

        {/* 상태바 — 콘텐츠 위에 겹친다 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20"
          style={{ height: pt(54) }}
        >
          <div
            className="absolute inset-y-0 left-0 flex items-center justify-center"
            style={{ width: pt(126), paddingTop: pt(4) }}
          >
            <span
              className="tabular font-semibold"
              style={{
                color: glyph,
                fontSize: pt(15),
                letterSpacing: pt(0.2),
                fontFamily: '-apple-system, "SF Pro Text", var(--font-sans)',
              }}
            >
              {time}
            </span>
          </div>

          <div
            className="absolute inset-y-0 right-0 flex items-center justify-end"
            style={{ width: pt(126), paddingTop: pt(4), paddingRight: pt(18), gap: pt(5) }}
          >
            <CellularBars size={pt(17)} color={glyph} />
            <WifiGlyph size={pt(16)} color={glyph} />
            <BatteryGlyph size={pt(26)} color={glyph} />
          </div>
        </div>

        {/* 다이내믹 아일랜드 */}
        <div
          className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 bg-black"
          style={{ top: pt(11), width: pt(126), height: pt(37), borderRadius: pt(37) / 2 }}
        />

        {/* 홈 인디케이터 */}
        <div
          className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full"
          style={{
            bottom: pt(8),
            width: pt(140),
            height: pt(5),
            background:
              homeIndicatorTone === 'light' ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.35)',
          }}
        />
      </div>
    </div>
  );
}

function CellularBars({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={(size * 11) / 17} viewBox="0 0 17 11" aria-hidden fill={color}>
      <rect x="0" y="7.2" width="3" height="3.8" rx="1" opacity=".95" />
      <rect x="4.7" y="4.8" width="3" height="6.2" rx="1" opacity=".95" />
      <rect x="9.4" y="2.4" width="3" height="8.6" rx="1" opacity=".95" />
      <rect x="14" y="0" width="3" height="11" rx="1" opacity=".4" />
    </svg>
  );
}

function WifiGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={(size * 12) / 16} viewBox="0 0 16 12" aria-hidden>
      <path
        d="M1.1 3.7a10.4 10.4 0 0 1 13.8 0"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M3.7 6.7a6.6 6.6 0 0 1 8.6 0"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M8 11.4 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.4Z" fill={color} />
    </svg>
  );
}

function BatteryGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={(size * 13) / 26} viewBox="0 0 26 13" aria-hidden>
      <rect
        x="0.6"
        y="0.6"
        width="22"
        height="11.8"
        rx="3.6"
        stroke={color}
        strokeOpacity=".38"
        fill="none"
      />
      <rect x="2.2" y="2.2" width="16.4" height="8.6" rx="2.2" fill={color} />
      <path
        d="M24.2 4.6c.9.4 1.2 1.1 1.2 1.9s-.3 1.5-1.2 1.9V4.6Z"
        fill={color}
        fillOpacity=".45"
      />
    </svg>
  );
}
