'use client';

import { useEffect, useState } from 'react';
import { QueueScreen } from './queue-screen';
import { api } from '@/lib/api-client';
import type { QueueView } from '@/lib/views';

/** 정적 데모 모드의 큐 — 브라우저 스토어를 재생해 같은 화면을 그린다. */
export function StaticQueue() {
  const [data, setData] = useState<QueueView | null>(null);

  useEffect(() => {
    void api.getQueue().then(setData);
  }, []);

  if (!data) return <LoadingScreen />;
  return <QueueScreen data={data} />;
}

export function LoadingScreen() {
  return (
    <main className="stage-scroll flex items-center justify-center bg-page">
      <p className="text-[13px] leading-[1.6] text-muted">이벤트 로그를 재생하는 중입니다…</p>
    </main>
  );
}
