'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** 제출물 캡처 기준 캔버스. 이 비율(16:10)은 화면 크기와 무관하게 유지된다. */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1200;

/**
 * 16:10 스테이지 모드.
 *
 * 앱을 1920×1200 캔버스에 고정하고, 뷰포트가 그보다 작으면 transform scale 로
 * 줄여서 가운데에 앉힌다. 바깥은 딥 뉴트럴로 레터박스 처리된다.
 * scale 은 레이아웃이 아니라 합성 단계에서 처리되므로 내부는 100% 그대로 동작한다.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);


  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="stage-root">
      <div
        className="stage-frame"
        // 측정 전에는 1배로 그린다. 스크립트가 실패해도 화면이 비지 않게 하기 위해서다
        // (기준 뷰포트 1920×1200 에서는 어차피 배율이 1이라 깜빡임도 없다).
        style={{ transform: `translate(-50%, -50%) scale(${scale ?? 1})` }}
      >
        {children}
      </div>
    </div>
  );
}
