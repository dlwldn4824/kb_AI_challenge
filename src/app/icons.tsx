/**
 * KPI 타일 아이콘. 이모지·아이콘 폰트 없이 인라인 SVG 로만 그린다.
 * 선 굵기 1.6, 24×24 그리드로 통일해 네 개가 한 세트로 보이게 한다.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** 오늘 생성된 AI 초안 */
export function DocumentIcon() {
  return (
    <svg {...base}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

/** 개입 필요 */
export function AlertIcon() {
  return (
    <svg {...base}>
      <path d="M12 4.5 3.4 19a1 1 0 0 0 .87 1.5h15.46a1 1 0 0 0 .87-1.5L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.4h.01" />
    </svg>
  );
}

/** 저위험 무작위 표본 */
export function ShieldIcon() {
  return (
    <svg {...base}>
      <path d="M12 3 5 6v5.5c0 4.3 2.9 8.3 7 9.5 4.1-1.2 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </svg>
  );
}

/** 검토 대기 (사람이 볼 몫) */
export function PeopleIcon() {
  return (
    <svg {...base}>
      <path d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Z" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.2 5.2a3 3 0 0 1 0 5.8" />
      <path d="M17.6 14.2A5.6 5.6 0 0 1 21.2 20" />
    </svg>
  );
}

/** 전일 대비 증감 화살표. up=true 면 위쪽. */
export function DeltaArrow({ up }: { up: boolean }) {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden fill="currentColor">
      {up ? <path d="M5 1.5 9 7H1L5 1.5Z" /> : <path d="M5 8.5 1 3h8L5 8.5Z" />}
    </svg>
  );
}
