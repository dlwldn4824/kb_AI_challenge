'use client';

import { useState } from 'react';
import { IPHONE_PT, IPhoneFrame } from './iphone-frame';
import { RegistryTimeline, type RegistryReplay } from './registry-timeline';
import { SectionHead, Spinner } from '../../ui';
import { api } from '@/lib/api-client';
import { asset } from '@/lib/asset-path';

export interface CustomerPaneProps {
  caseId: string;
  question: string;
  questionAt: string;
  answerAt: string;
  answerParagraphs: string[];
  delivered: boolean;
  /** 폰 상태바 시각. 케이스의 마지막 관련 이벤트에서 도출한다. */
  statusTime: string;
  model: string;
  modelVersion: string;
  r: number;
  verdictSummary: string;
  reviewDuration: string;
  lookups: number;
}

/**
 * 고객 수신 화면 목업 + 등기 조회 패널 (스펙 §4.3).
 *
 * 폰은 iPhone 15 Pro 논리 해상도(393×852pt) 1:1 렌더다. 안쪽 내용은
 * pdf-ref-08 기반 KB 챗 상담 화면(종료된 상담 헤더 · 베이지 배경 · 옐로 CTA)을 유지한다.
 * `등기 확인`은 장식이 아니라 GET /api/registry/[caseId] 를 실제로 호출한다.
 */
export function CustomerPane(props: CustomerPaneProps) {
  const [replay, setReplay] = useState<RegistryReplay | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /** 등기번호로 이벤트를 재생해 온다. 결과는 타임라인 모달의 원천이다. */
  async function confirmRegistry() {
    if (busy) return;
    if (replay) {
      setOpen(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const registry = await api.getRegistry(props.caseId);
      if (!registry) throw new Error('lookup failed');
      setReplay(registry as unknown as RegistryReplay);
      setOpen(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="border-b border-line pb-[12px]">
        <SectionHead title="고객 수신 화면" note="KB 상담 채널 발송 결과" />
      </div>

      {!props.delivered && (
        <p className="ko mt-[16px] rounded-[6px] border-l-[3px] border-danger bg-danger-bg px-[14px] py-[10px] text-[13px] leading-[1.6] text-ink">
          고객 채널에는 아무것도 전달되지 않았습니다. 아래는 고객이 실제로 본 화면입니다.
        </p>
      )}

      <div className="flex items-start gap-[20px] pt-[16px]">
        <IPhoneFrame homeIndicatorTone="dark" time={props.statusTime}>
          {/* 상단: 상태바 영역(54pt)만큼 띄운 다크브라운 헤더 */}
          <div className="shrink-0 bg-chat-header" style={{ paddingTop: 54 }}>
            <div className="flex h-[48px] items-center px-[16px] text-white">
              <span className="text-[17px] leading-[1.2] text-white/70" aria-hidden>
                ‹
              </span>
              <span className="mx-auto text-[15px] font-semibold leading-[1.4]">종료된 상담</span>
              <span className="text-[14px] leading-[1.2] text-white/70" aria-hidden>
                ✕
              </span>
            </div>
          </div>

          {/* 대화 */}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto bg-chat-bg px-[16px] pb-[12px] pt-[12px]">
            <p className="tabular text-right text-[11px] leading-[1.5] text-muted">
              {props.questionAt}
            </p>
            <div className="mt-[6px] flex justify-end">
              <p className="ko max-w-[250px] rounded-[16px] rounded-tr-[5px] bg-chat-bubble px-[14px] py-[10px] text-[13px] leading-[1.6] text-ink">
                {props.question}
              </p>
            </div>

            {props.delivered && (
              <>
                <div className="mt-[14px] flex items-center gap-[8px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset("/brand/kb-starbanking-icon.png")}
                    alt=""
                    width={26}
                    height={26}
                    className="h-[26px] w-[26px] rounded-[7px]"
                  />
                  <span className="text-[12px] font-bold leading-[1.4] text-ink">
                    KB국민은행 상담원
                  </span>
                  <span className="tabular ml-auto text-[11px] leading-[1.5] text-muted">
                    {props.answerAt}
                  </span>
                </div>

                <div className="ml-[34px] mt-[7px] rounded-[16px] rounded-tl-[5px] border border-line-soft bg-white px-[14px] py-[11px]">
                  {props.answerParagraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className={`ko text-[13px] leading-[1.6] text-ink ${index > 0 ? 'mt-[8px]' : ''}`}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="ml-[34px] mt-[8px] rounded-[16px] border border-line-soft bg-white px-[14px] py-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="inline-flex h-[20px] items-center rounded-[4px] bg-kb px-[8px] text-[11px] font-bold text-ink">
                      등기
                    </span>
                    <span className="ko text-[13px] font-bold leading-[1.4] text-ink">
                      답변등기로 발행되었습니다
                    </span>
                  </div>

                  <p className="mt-[10px] text-[11px] leading-[1.5] text-muted">등기번호</p>
                  <p className="mt-[2px] font-mono text-[14px] font-bold leading-[1.4] text-ink">
                    {props.caseId}
                  </p>

                  <p className="ko mt-[9px] border-t border-line-soft pt-[9px] text-[11px] leading-[1.6] text-muted">
                    상담직원이 확인하고 승인한 답변입니다. 등기번호로 발행 사실을 확인하실 수
                    있습니다.
                  </p>
                  <button
                    type="button"
                    onClick={confirmRegistry}
                    disabled={busy}
                    className="mt-[10px] flex h-[34px] w-full items-center justify-center gap-[8px] rounded-[6px] border border-ink bg-white text-[12px] font-bold text-ink transition-colors duration-[120ms] hover:bg-paper disabled:text-faint"
                  >
                    {busy && <Spinner />}
                    등기 확인
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 하단 CTA — 홈 인디케이터 자리를 비워 둔다 */}
          <button
            type="button"
            className="shrink-0 bg-kb text-[15px] font-bold text-ink transition-colors duration-[120ms] hover:bg-kb-dark"
            style={{ height: 76, paddingBottom: 22 }}
          >
            챗봇 상담하기
          </button>
        </IPhoneFrame>

        {/* ── 등기 조회 패널 ─────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-[1.35] text-muted">발행 등기</p>
          <p className="mt-[6px] font-mono text-[20px] font-bold leading-[1.3] text-ink">
            {props.caseId}
          </p>

          <dl className="mt-[16px] border-t border-line pt-[16px]">
            <LookupRow label="모델 · 버전" value={`${props.model} / ${props.modelVersion}`} mono />
            <LookupRow label="개입 필요도" value={`R ${props.r}`} mono />
            <LookupRow label="판단" value={props.verdictSummary} />
            <LookupRow label="검토 소요" value={props.reviewDuration} mono />
            <LookupRow label="조회 이력" value={`${props.lookups}회`} last />
          </dl>

          {replay && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="ko mt-[16px] block w-full rounded-[6px] border-l-[3px] border-ok bg-ok-bg px-[13px] py-[10px] text-left text-[13px] leading-[1.6] text-ink transition-colors duration-[120ms] hover:bg-ok-bg/70"
            >
              이벤트 {replay.eventCount}건 재생 완료 · 원문 {replay.originalSentences.length}문장 ·
              수정 {replay.edits.length}건 복원
              <span className="mt-[2px] block text-[12px] text-muted">타임라인 보기 →</span>
            </button>
          )}

          {failed && (
            <p className="ko mt-[16px] rounded-[6px] border-l-[3px] border-danger bg-danger-bg px-[13px] py-[10px] text-[13px] leading-[1.6] text-ink">
              등기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}

          {!replay && !props.delivered && (
            <button
              type="button"
              onClick={confirmRegistry}
              disabled={busy}
              className="mt-[16px] flex h-[36px] w-full items-center justify-center gap-[8px] rounded-[6px] border border-line bg-card text-[13px] font-bold text-ink transition-colors duration-[120ms] hover:bg-paper disabled:text-faint"
            >
              {busy && <Spinner />}
              등기 조회 · 이벤트 재생
            </button>
          )}
        </div>
      </div>

      {open && replay && <RegistryTimeline replay={replay} onClose={() => setOpen(false)} />}
    </>
  );
}

function LookupRow({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div className={last ? 'border-b border-line pb-[16px]' : 'pb-[16px]'}>
      <dt className="text-[13px] leading-[1.35] text-muted">{label}</dt>
      <dd
        className={`ko mt-[6px] text-[15px] font-bold leading-[1.4] text-ink ${
          mono ? 'tabular font-mono' : 'tabular'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export const PHONE_LOGICAL = IPHONE_PT;
