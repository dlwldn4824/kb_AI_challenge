'use client';

import type { ReactNode } from 'react';

/**
 * 뷰포트 전체 스테이지.
 * scale transform 은 스크롤·포인터를 깨뜨리므로 쓰지 않는다.
 * 화면을 꽉 채우고, 스크롤은 `.stage-scroll` 이 담당한다.
 */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="stage-root">
      <div className="stage-frame">{children}</div>
    </div>
  );
}
