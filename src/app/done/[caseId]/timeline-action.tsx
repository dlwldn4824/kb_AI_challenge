'use client';

import { useState } from 'react';
import { RegistryTimeline, type RegistryReplay } from './registry-timeline';
import { Spinner } from '../../ui';
import { api } from '@/lib/api-client';

/** 건 요약 오른쪽용 작은 등기·타임라인 버튼. */
export function TimelineAction({
  caseId,
  delivered,
}: {
  caseId: string;
  delivered: boolean;
}) {
  const [replay, setReplay] = useState<RegistryReplay | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openTimeline() {
    if (busy) return;
    if (replay) {
      setOpen(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const registry = await api.getRegistry(caseId);
      if (!registry) throw new Error('lookup failed');
      setReplay(registry as unknown as RegistryReplay);
      setOpen(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <div className="shrink-0 self-start">
      <button
        type="button"
        onClick={openTimeline}
        disabled={busy}
        className="inline-flex h-[40px] items-center gap-[8px] rounded-[6px] bg-ink px-[14px] text-[13px] font-bold text-white transition-colors hover:bg-ink-soft disabled:opacity-50"
      >
        {busy ? (
          <>
            <Spinner />
            불러오는 중
          </>
        ) : (
          <>
            {replay ? '타임라인 보기' : delivered ? '등기 확인' : '등기 조회'}
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      {replay && (
        <p className="ko mt-[6px] text-right text-[11px] leading-[1.4] text-muted">
          이벤트 {replay.eventCount}건 · 수정 {replay.edits.length}건
        </p>
      )}
      {failed && (
        <p className="ko mt-[6px] text-right text-[12px] text-danger">불러오지 못했습니다.</p>
      )}
      {open && replay && <RegistryTimeline replay={replay} onClose={() => setOpen(false)} />}
    </div>
  );
}
