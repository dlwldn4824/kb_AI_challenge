'use client';

import { useEffect } from 'react';
import type { AnyStoredEvent } from '@/lib/events';

export interface RegistryReplay {
  caseId: string;
  events: AnyStoredEvent[];
  eventCount: number;
  originalSentences: string[];
  edits: Array<{ idx: number; reason: string | null }>;
}

/**
 * 등기 조회 타임라인 (배송조회 스타일).
 *
 * 민원이 들어왔을 때 "등기번호 하나로 전 과정을 복원한다"를 보여 주는 화면이다.
 * 줄 내용은 전부 GET /api/registry/[caseId] 의 이벤트 재생 결과에서 만든다 — 하드코딩 없음.
 */
export function RegistryTimeline({
  replay,
  onClose,
}: {
  replay: RegistryReplay;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = replay.events.map(describe);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-6"
      role="dialog"
      aria-modal="true"
      aria-label="등기 조회 타임라인"
      onClick={onClose}
    >
      <div
        className="max-h-[80%] w-[640px] overflow-y-auto rounded-[8px] border border-line bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start border-b border-line px-[20px] py-[16px]">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold leading-[1.35] text-ink">등기 조회</h2>
            <p className="ko mt-[4px] text-[13px] leading-[1.6] text-muted">
              <span className="font-mono">{replay.caseId}</span>
              <span className="px-[8px] text-faint">·</span>
              이벤트 <span className="tabular font-semibold text-ink">{replay.eventCount}</span>건
              <span className="px-[8px] text-faint">·</span>
              원문 {replay.originalSentences.length}문장
              <span className="px-[8px] text-faint">·</span>
              수정 {replay.edits.length}건
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto shrink-0 rounded-[4px] px-[6px] text-[14px] text-muted transition-colors duration-[120ms] hover:text-ink"
          >
            ✕
          </button>
        </div>

        <ol className="px-[20px] py-[16px]">
          {rows.map((row, index) => (
            <li key={index} className="relative flex gap-[14px] pb-[16px] last:pb-0">
              <span className="tabular w-[62px] shrink-0 pt-[1px] font-mono text-[13px] leading-[1.6] text-muted">
                {row.time}
              </span>
              <span className="relative flex w-[10px] shrink-0 justify-center">
                <span
                  className={`z-10 mt-[6px] h-[9px] w-[9px] shrink-0 rounded-full ${row.tone}`}
                />
                {index < rows.length - 1 && (
                  <span className="absolute top-[14px] h-full w-px bg-line" />
                )}
              </span>
              <span className="ko min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-[1.4] text-ink">
                  {row.label}
                </span>
                {row.detail && (
                  <span className="mt-[3px] block text-[13px] leading-[1.6] text-muted">
                    {row.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

interface Row {
  time: string;
  label: string;
  detail?: string;
  tone: string;
}

/** 이벤트 1건을 타임라인 한 줄로 옮긴다. 값은 payload 에서만 가져온다. */
function describe(event: AnyStoredEvent): Row {
  const time = event.ts.slice(11, 19);
  // 색은 결과에만 쓴다. 진행 과정은 전부 중립 dot 이다.
  const neutral = 'bg-faint';
  const brand = neutral;
  const ok = 'bg-ok';
  const danger = 'bg-danger';

  switch (event.type) {
    case 'draft_created':
      return {
        time,
        label: '접수 · AI 초안 생성',
        detail: `${event.payload.product} · ${event.payload.model} ${event.payload.modelVersion}`,
        tone: neutral,
      };
    case 'signals_detected':
      return {
        time,
        label:
          event.payload.signals.length > 0
            ? `위험 신호 ${event.payload.signals.length}건 감지 · R ${event.payload.r}`
            : '위험 신호 없음 · 무작위 표본 선정',
        detail: event.payload.signals.map((signal) => signal.tier).join(' · ') || undefined,
        tone: brand,
      };
    case 'review_started':
      return { time, label: '상담직원 검토 시작', tone: brand };
    case 'sentence_kept':
      return { time, label: `${event.payload.sentenceIdx + 1}번 구절 유지`, tone: neutral };
    case 'sentence_edited':
      return {
        time,
        label: `${event.payload.sentenceIdx + 1}번 구절 수정`,
        detail: event.payload.newText,
        tone: brand,
      };
    case 'reason_selected':
      return {
        time,
        label: `수정 사유 선택 · ${event.payload.reason}`,
        tone: brand,
      };
    case 'coherence_checked':
      return {
        time,
        label: `사유 ↔ 실제 수정 적합성 ${event.payload.result === 'pass' ? '통과' : '불일치'}`,
        detail: event.payload.detail,
        tone: event.payload.result === 'pass' ? ok : danger,
      };
    case 'approved':
      return {
        time,
        label: '승인 · 봉인 생성',
        detail: `${event.payload.approver} · 버전 ${event.payload.versionId}`,
        tone: ok,
      };
    case 'approval_invalidated':
      return { time, label: '승인 무효화 · 승인 후 문장 변경', tone: danger };
    case 'dispatch_attempted':
      return { time, label: '발송 시도 · 해시 대조', tone: neutral };
    case 'dispatch_blocked':
      return { time, label: `발송 차단 · ${event.payload.reason}`, tone: danger };
    case 'dispatched':
      return { time, label: '발송 완료 · 고객 전달', tone: ok };
    default:
      return { time, label: '기록', tone: neutral };
  }
}
