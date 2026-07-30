'use client';

import { useEffect, useState } from 'react';
import { ReviewConsole } from './review-console';
import { LoadingScreen } from '../../static-queue';
import { api } from '@/lib/api-client';
import type { CaseView } from '@/lib/views';

/** 정적 데모 모드의 검토 화면 — 초기 상태를 브라우저 스토어에서 재생해 온다. */
export function StaticReview({ caseId }: { caseId: string }) {
  const [initial, setInitial] = useState<CaseView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void api.getCase(caseId).then((result) => {
      if (result) setInitial(result);
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
  if (!initial) return <LoadingScreen />;
  return <ReviewConsole initial={initial} />;
}
