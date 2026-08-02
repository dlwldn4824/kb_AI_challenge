'use client';

import { useState } from 'react';
import { PhoneShell } from './phone-shell';
import { RegistryTimeline, type RegistryReplay } from './registry-timeline';
import { Spinner } from '../../ui';
import { api } from '@/lib/api-client';
import { asset } from '@/lib/asset-path';

export interface CustomerPaneProps {
  caseId: string;
  question: string;
  questionAt: string;
  answerAt: string;
  answerParagraphs: string[];
  delivered: boolean;
  statusTime: string;
}

/**
 * 고객 수신 미리보기 — 폰만. 타임라인 CTA 는 왼쪽 컬럼에 있다.
 * 폰 안 `등기 확인`은 고객 화면 목업용으로 그대로 둔다.
 */
export function CustomerPane(props: CustomerPaneProps) {
  const [replay, setReplay] = useState<RegistryReplay | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmRegistry() {
    if (busy) return;
    if (replay) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const registry = await api.getRegistry(props.caseId);
      if (!registry) throw new Error('lookup failed');
      setReplay(registry as unknown as RegistryReplay);
      setOpen(true);
    } catch {
      /* 폰 목업 버튼 — 실패는 조용히 */
    }
    setBusy(false);
  }

  return (
    <>
      {!props.delivered && (
        <p className="ko mb-[12px] text-[13px] leading-[1.6] text-danger">
          고객 채널에 전달되지 않았습니다.
        </p>
      )}

      <PhoneShell time={props.statusTime}>
          <div className="shrink-0 bg-chat-header pt-[34px]">
            <div className="flex h-[44px] items-center px-[6px]">
              <span className="flex h-[40px] w-[40px] items-center justify-center" aria-hidden>
                <ChevronLeft />
              </span>
              <span className="flex-1 text-center text-[15px] font-semibold text-white">
                종료된 상담
              </span>
              <span className="flex h-[40px] w-[40px] items-center justify-center" aria-hidden>
                <CloseIcon />
              </span>
            </div>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-[12px] py-[12px]">
            <p className="tabular mb-[8px] text-center text-[11px] text-[#8a8278]">
              {props.questionAt}
            </p>

            <div className="flex justify-end">
              <p className="ko max-w-[86%] rounded-[14px] rounded-br-[4px] bg-chat-bubble px-[12px] py-[9px] text-[13px] leading-[1.55] text-ink">
                {props.question}
              </p>
            </div>

            {props.delivered && (
              <>
                <div className="mt-[14px] flex items-start gap-[8px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset('/brand/kb-starbanking-icon.png')}
                    alt=""
                    width={26}
                    height={26}
                    className="mt-[2px] h-[26px] w-[26px] shrink-0 rounded-[7px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-[4px] flex items-baseline gap-[6px]">
                      <span className="text-[12px] font-bold text-ink">KB국민은행 상담원</span>
                      <span className="tabular text-[11px] text-[#8a8278]">{props.answerAt}</span>
                    </div>
                    <div className="rounded-[14px] rounded-tl-[4px] bg-white px-[12px] py-[10px]">
                      {props.answerParagraphs.map((paragraph, index) => (
                        <p
                          key={index}
                          className={`ko text-[13px] leading-[1.55] text-ink ${
                            index > 0 ? 'mt-[8px]' : ''
                          }`}
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ml-[34px] mt-[8px] rounded-[12px] bg-white px-[12px] py-[12px]">
                  <div className="flex items-center gap-[6px]">
                    <span className="inline-flex h-[18px] items-center bg-kb px-[6px] text-[10px] font-bold text-ink">
                      등기
                    </span>
                    <span className="text-[12px] font-bold text-ink">답변등기로 발행되었습니다</span>
                  </div>

                  <p className="mt-[10px] text-[11px] text-[#8a8278]">등기번호</p>
                  <p className="mt-[1px] font-mono text-[14px] font-bold tracking-[-0.02em] text-ink">
                    {props.caseId}
                  </p>

                  <p className="ko mt-[8px] border-t border-[#eeeae4] pt-[8px] text-[11px] leading-[1.55] text-[#6f6961]">
                    상담직원이 확인하고 승인한 답변입니다. 등기번호로 확인할 수 있습니다.
                  </p>

                  <button
                    type="button"
                    onClick={confirmRegistry}
                    disabled={busy}
                    className="mt-[10px] flex h-[34px] w-full items-center justify-center gap-[6px] rounded-[8px] border border-ink bg-white text-[12px] font-bold text-ink hover:bg-[#f7f5f1] disabled:opacity-40"
                  >
                    {busy && <Spinner />}
                    등기 확인
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="shrink-0 bg-kb text-[15px] font-bold text-ink hover:bg-kb-dark"
            style={{ height: 56, paddingBottom: 10 }}
          >
            챗봇 상담하기
          </button>
        </PhoneShell>

      {open && replay && <RegistryTimeline replay={replay} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6 9 12l6 6"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
