'use client';

import { useEffect, useState } from 'react';
import { DoneScreen } from './done-screen';
import { LoadingScreen } from '../../static-queue';
import { api } from '@/lib/api-client';
import type { RegistryView } from '@/lib/views';

/** 정적 데모 모드의 발행 완료 화면 — 브라우저 스토어 재생 결과로 그린다. */
export function StaticDone({ caseId }: { caseId: string }) {
  const [view, setView] = useState<RegistryView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void api.getRegistry(caseId).then((result) => {
      if (result) setView(result);
      else setMissing(true);
    });
  }, [caseId]);

  if (missing) {
    return (
      <main className="stage-scroll flex items-center justify-center bg-page">
        <p className="text-[13px] leading-[1.6] text-muted">등기 {caseId} 를 찾을 수 없습니다.</p>
      </main>
    );
  }
  if (!view) return <LoadingScreen />;
  return <DoneScreen view={view} />;
}
