'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chrome } from '../../chrome';
import { SIGNAL_NOTE, SectionHead, Shell, SignalText, Spinner, TIER_BASIS, TierChip, Toast } from '../../ui';
import { LockIcon, SealedBanner, SealedBlockModal } from './sealed-lock';
import { api } from '@/lib/api-client';
import { REASONS, type Reason } from '@/lib/constants';
import { findProductFacts } from '@/fixtures/product-facts';
import { compareSentenceToFacts, DETECTOR_VERSION } from '@/lib/scoring';
import type { CaseView } from '@/lib/views';

/**
 * 검토 화면 (스펙 §4.2).
 *
 * 좌우는 카드가 아니라 세로 구분선으로 나눈다 (Figma 정본 · 멘토 [15]).
 * 판정·사유·수정은 전부 API 를 거친다. 토글을 누르면 화면은 곧바로 반응하지만,
 * 승인 버튼은 서버 응답이 돌아오기 전까지 잠긴 채로 둔다 — 승인 조건 판정은 서버 몫이다.
 */
export function ReviewConsole({ initial }: { initial: CaseView }) {
  const router = useRouter();
  const [view, setView] = useState<CaseView>(initial);
  const [selected, setSelected] = useState<number>(() => firstActionable(initial));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  /** 사유를 고른 뒤에는 접고, '다시 고르기' 로만 연다. */
  const [reasonPickerOpen, setReasonPickerOpen] = useState<Set<number>>(() => new Set());

  /**
   * 판정 요청은 한 줄로 세운다.
   *
   * 같은 틱에 여러 번 눌리면 `pending` 은 아직 갱신되기 전이라 막지 못한다.
   * 그래서 렌더 상태가 아니라 ref 로 잡은 큐에서 직렬화하고, 응답이 도착한
   * 순서가 아니라 큐 순서대로 상태를 확정한다.
   */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const reviewStartRef = useRef<Promise<void> | null>(null);
  const inflightRef = useRef(0);
  /**
   * 구절별로 "마지막으로 보낸 판정"을 동기적으로 기억한다.
   * setView 는 다음 렌더에서야 반영되므로, 같은 틱에 연달아 눌린 클릭은
   * 렌더 상태로 걸러낼 수 없다. 같은 판정을 두 번 보내지 않기 위한 장치다.
   */
  const claimsRef = useRef(new Map<number, string>());

  /** 이 구절에 대해 같은 판정이 이미 나갔으면 false. */
  function claim(idx: number, intent: string): boolean {
    if (claimsRef.current.get(idx) === intent) return false;
    claimsRef.current.set(idx, intent);
    return true;
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  /** 검토 시작(review_started)은 어떤 판정보다 먼저 기록되어야 한다. */
  function ensureReviewStarted(): Promise<void> {
    if (!reviewStartRef.current) {
      reviewStartRef.current =
        initial.status === '검토 대기' || initial.status === '표본 검토'
          ? api.reviewStart(initial.caseId).then((result) => {
              if (result.status === 200) setView(result.data as CaseView);
            })
          : Promise.resolve();
    }
    return reviewStartRef.current;
  }

  useEffect(() => {
    void ensureReviewStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined);
    return run;
  }

  /**
   * 판정 1건을 기록한다.
   *
   * 응답을 못 받았다고 곧바로 실패로 단정하지 않는다. 서버 상태를 한 번 더 읽어
   * 의도한 판정이 로그에 남았는지 확인하고, 정말 남지 않은 경우에만 알린다.
   */
  async function mutate(
    label: string,
    request: () => Promise<{ status: number; data: unknown }>,
    landed: (fresh: CaseView) => boolean,
    claimKey: number,
  ): Promise<void> {
    inflightRef.current += 1;
    setPending(true);

    await enqueue(async () => {
      await ensureReviewStarted();
      const result = await request();

      if (result.status === 200) {
        setView(result.data as CaseView);
        return;
      }

      const fresh = await api.getCase(view.caseId);
      if (fresh) {
        setView(fresh);
        if (landed(fresh)) return;
      }
      // 기록되지 않았으므로 같은 판정을 다시 보낼 수 있게 중복 방지 표시를 푼다.
      claimsRef.current.delete(claimKey);
      setToast(`${label}을 저장하지 못했습니다. 다시 시도해 주세요.`);
    });

    inflightRef.current -= 1;
    if (inflightRef.current === 0) setPending(false);
  }

  const sentences = view.sentences;
  const current = sentences.find((sentence) => sentence.idx === selected) ?? sentences[0];

  // 선택 구절을 상품 정본 팩트와 대조한다. 감지기(scoring.ts)가 쓰는 함수를
  // 그대로 호출할 뿐 화면에서 새로 판정하지 않는다.
  const productFacts = findProductFacts(view.product);
  const comparisons =
    current && productFacts ? compareSentenceToFacts(current.currentText, productFacts) : [];
  const busy = pending || sending;

  async function keep(idx: number) {
    const sentence = sentences.find((item) => item.idx === idx);
    // 이미 유지로 판정된 구절을 다시 눌러 같은 이벤트를 쌓지 않는다.
    if (!sentence || sentence.verdict === 'kept') return;
    if (!claim(idx, 'kept')) return;

    setEditing(null);
    setView(optimisticVerdict(view, idx, 'kept'));
    await mutate(
      `${idx + 1}번 구절 유지 판정`,
      () => api.keep(view.caseId, idx),
      (fresh) => fresh.sentences.find((item) => item.idx === idx)?.verdict === 'kept',
      idx,
    );
  }

  function startEditing(idx: number) {
    const sentence = sentences.find((item) => item.idx === idx);
    if (!sentence) return;
    setSelected(idx);
    setEditing(idx);
    setDraft(sentence.currentText);
  }

  async function applyEdit(idx: number) {
    const newText = draft.trim();
    const sentence = sentences.find((item) => item.idx === idx);
    if (!sentence || newText.length === 0) return;
    if (sentence.verdict === 'edited' && sentence.currentText === newText) {
      setEditing(null);
      return;
    }
    if (!claim(idx, `edited:${newText}`)) return;

    setEditing(null);
    setSelected(idx);
    setView(optimisticVerdict(view, idx, 'edited', newText));
    await mutate(
      `${idx + 1}번 구절 수정 문안`,
      () => api.edit(view.caseId, idx, newText),
      (fresh) => fresh.sentences.find((item) => item.idx === idx)?.currentText === newText,
      idx,
    );
  }

  async function pickReason(idx: number, reason: Reason) {
    const sentence = sentences.find((item) => item.idx === idx);
    if (!sentence || sentence.verdict !== 'edited') return;
    // 같은 사유가 이미 검사까지 끝나 있으면 다시 보내지 않는다.
    if (sentence.reason === reason && sentence.coherence) {
      setReasonPickerOpen((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
      return;
    }
    if (!claim(-idx - 1, `reason:${reason}`)) return;

    setSelected(idx);
    setReasonPickerOpen((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    setView(optimisticReason(view, idx, reason));
    await mutate(
      '수정 사유',
      () => api.reason(view.caseId, idx, reason),
      (fresh) => {
        const next = fresh.sentences.find((item) => item.idx === idx);
        return next?.reason === reason && next.coherence !== null;
      },
      -idx - 1,
    );
  }

  /** 승인 → 승인문 그대로 발송. 앞선 판정이 모두 기록된 뒤에 실행된다. */
  async function approveAndDispatch() {
    if (busy || !view.canApprove) return;
    setSending(true);

    await enqueue(async () => {
      const approve = await api.approve(view.caseId);
      if (approve.status !== 200) {
        const body = approve.data as { blockers?: string[]; case?: CaseView };
        if (body.case) setView(body.case);
        setToast(`승인 조건이 아직 충족되지 않았습니다 — ${(body.blockers ?? []).join(' · ')}`);
        setSending(false);
        return;
      }

      const approved = approve.data as CaseView;
      setView(approved);

      const dispatch = await api.dispatch(view.caseId, approved.approvedContent ?? '');

      if (dispatch.status !== 200 && dispatch.status !== 409) {
        setToast('발송 요청이 처리되지 않았습니다. 잠시 후 다시 시도해 주세요.');
        setSending(false);
        return;
      }

      // 409(차단)도 발행 완료 화면으로 간다. 거기서 차단 배너로 결과를 보여준다.
      router.push(`/done/${view.caseId}`);
      router.refresh();
    });
  }

  const coherence = current?.coherence ?? null;
  const dispatched = view.status === '발행 완료';
  // 선택 구절이 유지여도 수정 문안이 비지 않도록, 수정된 구절 전체를 항상 보여준다.
  const editedSentences = sentences.filter((s) => s.verdict === 'edited');
  // 정합성 불일치는 문장 아래 검사 박스가 이미 설명하므로 CTA 아래에서 한 번 더 말하지 않는다.
  const mismatchShown = coherence?.result === 'mismatch';
  const blockLabel = dispatched
    ? '이미 발행된 등기입니다. 발송문은 승인문으로 고정되어 있습니다.'
    : mismatchShown
      ? null
      : approveBlockLabel(view, pending);

  return (
    <main className="stage-scroll flex flex-col bg-page">
      <Chrome
        screen="검토"
        meta={[
          <span key="id" className="font-mono">
            {view.caseId}
          </span>,
          <span key="r" className="tabular">
            개입 필요도 <span className="font-mono">{view.r}</span>
          </span>,
          view.product,
          <Elapsed key="elapsed" />,
        ]}
      />

      {dispatched && <SealedBanner sealedAt={view.approval?.sealedAt ?? null} />}

      <Shell className="flex flex-col">
        <div className="flex items-start gap-0 pt-[20px] pb-[8px]">
          {/* ── 좌: AI 초안 구절 리스트 ─────────────────────────────── */}
          <section className="min-w-0 flex-1 pr-[24px]">
            <div className="border-b border-line pb-[12px]">
              <SectionHead
                title="AI 초안"
                note={`감지된 구절 ${view.detectedCount}건`}
                right={
                  <span className="text-[13px] leading-[1.6] text-muted">
                    <span className="font-mono">{view.model}</span>
                    <span className="px-[6px] text-faint">·</span>
                    감지기 <span className="font-mono">{DETECTOR_VERSION}</span>
                    <span className="px-[6px] text-faint">·</span>
                    신뢰도 <span className="tabular font-mono">{view.confidence}</span>
                  </span>
                }
              />
            </div>

            <div className="pt-[4px]">
              {sentences.map((sentence) => {
                const isSelected = sentence.idx === selected;
                const isEditing = editing === sentence.idx;
                const highlight = sentence.verdict === 'edited' ? null : sentence.signal;

                return (
                  <div
                    key={sentence.idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(sentence.idx)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(sentence.idx);
                      }
                    }}
                    className={`relative cursor-pointer px-[12px] transition-colors duration-[120ms] ${
                      isSelected ? 'bg-kb-tint' : 'bg-transparent hover:bg-paper'
                    } ${dispatched ? 'opacity-50' : ''}`}
                  >
                    {isSelected && <span className="absolute left-0 top-0 h-full w-[3px] bg-kb" />}

                    <div className="flex min-h-[42px] items-center gap-[12px]">
                      {sentence.signal ? (
                        <TierChip tier={sentence.signal.tier} />
                      ) : (
                        <span className="h-[20px] w-[24px] shrink-0" />
                      )}

                      <p className="ko min-w-0 flex-1 py-[8px] text-[14px] leading-[1.7] text-ink">
                        <SignalText
                          text={sentence.currentText}
                          start={highlight ? sentence.flagStart : null}
                          end={highlight ? sentence.flagEnd : null}
                          tier={highlight ? highlight.tier : null}
                        />
                      </p>

                      {sentence.signal ? (
                        <span className="flex shrink-0 items-center gap-[6px]">
                          <VerdictButton
                            label="유지"
                            testId={`keep-${sentence.idx}`}
                            active={sentence.verdict === 'kept'}
                            disabled={busy || dispatched}
                            onClick={() => keep(sentence.idx)}
                          />
                          <VerdictButton
                            label="수정"
                            testId={`edit-${sentence.idx}`}
                            active={sentence.verdict === 'edited'}
                            disabled={busy}
                            locked={dispatched}
                            onClick={() =>
                              dispatched ? setBlockModalOpen(true) : startEditing(sentence.idx)
                            }
                          />
                        </span>
                      ) : (
                        <span className="w-[100px] shrink-0 text-right text-[12px] leading-[1.5] text-faint">
                          신호 없음
                        </span>
                      )}
                    </div>

                    {isEditing && (
                      <div className="animate-panel pb-[12px] pl-[36px]">
                        <textarea
                          value={draft}
                          autoFocus
                          onChange={(event) => setDraft(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          rows={3}
                          aria-label={`${sentence.idx + 1}번 구절 수정 문안`}
                          className="ko w-full resize-none rounded-[6px] border border-line bg-card px-[14px] py-[10px] text-[14px] leading-[1.7] text-ink outline-none transition-colors duration-[120ms] focus:border-ink-soft"
                        />
                        <div className="mt-[8px] flex items-center gap-[8px]">
                          <button
                            type="button"
                            data-testid="apply-edit"
                            disabled={busy || draft.trim().length === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              void applyEdit(sentence.idx);
                            }}
                            className="h-[32px] rounded-[6px] bg-ink px-[16px] text-[13px] font-bold text-white transition-colors duration-[120ms] hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-head disabled:text-faint"
                          >
                            수정 적용
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditing(null);
                            }}
                            className="h-[32px] rounded-[6px] border border-line bg-card px-[16px] text-[13px] text-ink transition-colors duration-[120ms] hover:bg-paper"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 수정 적용 후 — 사유 선택 / 요약 */}
                    {!isEditing && sentence.verdict === 'edited' && !dispatched && (
                      <div
                        className="animate-panel border-t border-line-soft pb-[14px] pl-[36px] pt-[12px]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {(!sentence.reason || reasonPickerOpen.has(sentence.idx)) && (
                          <>
                            <p className="type-subtitle mb-[8px] text-[14px] leading-[1.4] text-ink">
                              수정 사유 설명
                            </p>
                            <div className="grid grid-cols-3 gap-[6px]">
                              {REASONS.map((reason) => {
                                const active = sentence.reason === reason;
                                return (
                                  <button
                                    key={reason}
                                    type="button"
                                    data-testid={
                                      isSelected
                                        ? `reason-${REASONS.indexOf(reason)}`
                                        : undefined
                                    }
                                    aria-pressed={active}
                                    disabled={busy}
                                    onClick={() => void pickReason(sentence.idx, reason)}
                                    className={`ko flex h-[36px] items-center justify-center rounded-[6px] border text-[13px] font-semibold leading-[1.4] transition-colors duration-[120ms] ${
                                      active
                                        ? 'border-ink bg-ink text-white'
                                        : 'border-line bg-card text-ink hover:border-ink/40 hover:bg-paper'
                                    }`}
                                  >
                                    {reason}
                                  </button>
                                );
                              })}
                            </div>
                            {!sentence.reason && (
                              <p className="ko mt-[8px] text-[13px] leading-[1.55] text-warn">
                                이 문장의 수정 사유를 선택해 주세요.
                              </p>
                            )}
                          </>
                        )}

                        {sentence.reason && !reasonPickerOpen.has(sentence.idx) && (
                          <div className="flex flex-wrap items-center gap-[10px]">
                            <span className="inline-flex h-[28px] items-center gap-[6px] rounded-[4px] bg-kb-tint px-[10px] text-[13px] font-semibold text-ink">
                              <span className="text-[11px] font-medium text-muted">사유</span>
                              {sentence.reason}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setReasonPickerOpen((prev) => new Set(prev).add(sentence.idx))
                              }
                              className="text-[13px] font-medium text-muted underline underline-offset-2 transition-colors duration-[120ms] hover:text-ink disabled:text-faint"
                            >
                              다시 고르기
                            </button>
                          </div>
                        )}

                        {sentence.reason && (
                          <div className="mt-[12px]">
                            {sentence.coherence ? (
                              <CoherenceCard
                                reason={sentence.reason}
                                result={sentence.coherence.result}
                                detail={sentence.coherence.detail}
                              />
                            ) : (
                              <p className="ko flex min-h-[44px] items-center rounded-[8px] border border-line bg-paper px-[14px] text-[13px] leading-[1.6] text-ink-soft">
                                적합성 검사 중…
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!isEditing &&
                      sentence.verdict === 'edited' &&
                      sentence.reason &&
                      sentence.coherence &&
                      dispatched && (
                      <div
                        className="border-t border-line-soft pb-[14px] pl-[36px] pt-[12px]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="mb-[10px] flex flex-wrap items-center gap-[10px]">
                          <span className="inline-flex h-[28px] items-center gap-[6px] rounded-[4px] bg-kb-tint px-[10px] text-[13px] font-semibold text-ink">
                            <span className="text-[11px] font-medium text-muted">사유</span>
                            {sentence.reason}
                          </span>
                        </div>
                        <CoherenceCard
                          reason={sentence.reason}
                          result={sentence.coherence.result}
                          detail={sentence.coherence.detail}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-[12px] flex min-h-[38px] items-center border-t border-line">
              <span className="tabular text-[13px] leading-[1.6] text-ink">
                감지 <b className="font-bold">{view.detectedCount}</b>
                <span className="px-[7px] text-faint">·</span>
                유지 <b className="font-bold">{view.keptCount}</b>
                <span className="px-[7px] text-faint">·</span>
                수정 <b className="font-bold">{view.editedCount}</b>
                <span className="px-[7px] text-faint">·</span>
                미판정 <b className="font-bold">{view.undecidedCount}</b>
              </span>
            </div>

            {/* 수정 문안 — 좌측, 초안과 같은 흐름에서 원문↔수정 대조 */}
            <section className="mt-[20px] border-t border-line pt-[20px] pb-[8px]">
              <h3 className="type-subtitle text-[16px] leading-[1.35] text-ink">수정 문안</h3>
              {editedSentences.length === 0 ? (
                <p className="ko mt-[10px] text-[14px] leading-[1.7] text-muted">
                  수정하면 여기에 원문과 수정문이 대조됩니다.
                </p>
              ) : (
                <ul className="mt-[12px] space-y-[14px]">
                  {editedSentences.map((sentence) => (
                    <li key={sentence.idx}>
                      <div className="mb-[8px] flex flex-wrap items-center gap-[8px]">
                        <button
                          type="button"
                          onClick={() => setSelected(sentence.idx)}
                          className={`text-[13px] font-semibold ${
                            sentence.idx === selected ? 'text-ink' : 'text-muted hover:text-ink'
                          }`}
                        >
                          {sentence.idx + 1}번 구절
                        </button>
                        {sentence.reason ? (
                          <span className="inline-flex h-[24px] items-center gap-[5px] rounded-[4px] bg-kb-tint px-[8px] text-[12px] font-semibold text-ink">
                            <span className="text-[11px] font-medium text-muted">사유</span>
                            {sentence.reason}
                          </span>
                        ) : (
                          <span className="text-[12px] font-medium text-warn">사유 미선택</span>
                        )}
                      </div>
                      <div className="flex min-h-[40px] items-start gap-[12px] rounded-[6px] bg-paper px-[14px] py-[9px]">
                        <span className="w-[18px] shrink-0 text-[14px] leading-[1.7] text-muted">
                          −
                        </span>
                        <span className="ko min-w-0 flex-1 text-[14px] leading-[1.7] text-muted line-through">
                          {sentence.originalText}
                        </span>
                      </div>
                      <div className="mt-[6px] flex min-h-[48px] items-start gap-[12px] rounded-[6px] border-l-[4px] border-kb bg-kb-tint/40 px-[14px] py-[10px]">
                        <span className="w-[18px] shrink-0 text-[14px] font-bold leading-[1.7] text-ink">
                          +
                        </span>
                        <span className="ko min-w-0 flex-1 text-[14px] leading-[1.7] text-ink">
                          {sentence.currentText}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>

          {/* ── 우: 판단하기 + 발송 문안 ─────────────────────────────── */}
          <aside className="w-[min(42%,640px)] min-w-[440px] shrink-0 self-start border-l border-line pl-[24px]">
            <div className="border-b border-line pb-[12px]">
              <SectionHead title="판단하기" />
              <p className="ko mt-[6px] text-[13px] leading-[1.55] text-muted">
                선택한 구절이 왜 위험으로 잡혔는지 보는 칸입니다.
              </p>
            </div>

            <div className="pt-[16px]">
              {current?.signal ? (
                <div className="flex min-h-[60px] items-center gap-[14px] rounded-[8px] border border-line bg-card px-[16px] py-[14px]">
                  <span className="flex shrink-0 items-center gap-[10px]">
                    <TierChip tier={current.signal.tier} size="md" />
                    <span className="tabular font-mono text-[13px] font-semibold leading-[1.6] text-ink">
                      ×{current.signal.score}
                    </span>
                  </span>
                  <span className="ko min-w-0">
                    <span className="type-subtitle block text-[14px] leading-[1.4] text-ink">
                      {current.signal.label} · {current.signal.evidence}
                    </span>
                    <span className="mt-[5px] block text-[13px] leading-[1.65] text-ink-soft">
                      {SIGNAL_NOTE[current.signal.type]}
                    </span>
                  </span>
                </div>
              ) : (
                <p className="ko flex min-h-[60px] items-center text-[14px] leading-[1.65] text-ink-soft">
                  이 구절에서는 위험 신호가 발화하지 않았습니다. 판정 대상이 아닙니다.
                </p>
              )}

              {/* ── 정본 대조 (2층 설명) ────────────────────────────
                  위층은 고정된 법 근거, 아래층은 규칙 개선으로 달라지는 감지 근거다.
                  두 층을 나눠 두어야 "무엇이 바뀔 수 있는 판단인지"가 드러난다.
                  신호 카드 바로 아래에 두는 것은 읽는 순서를 근거 → 판단 → 행동으로
                  맞추기 위해서다. CTA 아래에 있으면 근거가 행동보다 뒤에 오고
                  1080p 에서 접힌다. */}
              <section className="mt-[22px]">
                <h3 className="type-subtitle text-[16px] leading-[1.35] text-ink">정본 대조</h3>
                <p className="ko mt-[6px] text-[13px] leading-[1.55] text-muted">
                  초안 내용을 공식 상품 조건·법 기준과 맞춰 보는 칸입니다.
                </p>

                <p className="ko mt-[14px] text-[13px] font-medium leading-[1.5] text-ink-soft">
                  법 근거 (티어 {current?.signal?.tier ?? '—'} · 금소법 위계 — 고정)
                </p>
                {current?.signal ? (
                  <div className="mt-[8px] flex items-start gap-[10px] rounded-[8px] border border-line bg-card px-[16px] py-[14px]">
                    <TierChip tier={current.signal.tier} size="md" />
                    <span className="ko min-w-0 text-[14px] font-medium leading-[1.65] text-ink">
                      {TIER_BASIS[current.signal.tier]}
                    </span>
                  </div>
                ) : (
                  <p className="ko mt-[8px] text-[14px] leading-[1.65] text-ink-soft">
                    이 구절에는 티어가 부여되지 않았습니다.
                  </p>
                )}

                <p className="ko mt-[20px] text-[13px] font-medium leading-[1.5] text-ink-soft">
                  수치·조건 맞춰보기
                </p>
                <p className="ko mt-[4px] text-[12px] leading-[1.5] text-muted">
                  상품에 적힌 숫자와 AI가 쓴 숫자가 같은지 확인합니다.
                </p>
                {comparisons.length > 0 ? (
                  <ul className="mt-[8px] overflow-hidden rounded-[8px] border border-line bg-card">
                    {comparisons.map((comparison) => (
                      <li
                        key={comparison.key}
                        className="flex flex-col gap-[6px] border-b border-line px-[16px] py-[12px] last:border-b-0 sm:flex-row sm:items-baseline sm:gap-[12px]"
                      >
                        <span className="ko min-w-0 flex-1 text-[14px] font-medium leading-[1.6] text-ink">
                          {comparison.label}
                        </span>
                        {comparison.kind === 'number' ? (
                          <span className="tabular shrink-0 text-[13px] leading-[1.6]">
                            <span className="text-ink-soft">
                              상품 조건{' '}
                              <span className="font-mono font-semibold text-ink">
                                {comparison.canonical}
                              </span>
                            </span>
                            <span className="px-[6px] text-muted">/</span>
                            <span
                              className={
                                comparison.matches ? 'text-ink-soft' : 'text-danger'
                              }
                            >
                              AI 초안{' '}
                              <span
                                className={`font-mono ${
                                  comparison.matches
                                    ? 'font-semibold text-ink'
                                    : 'font-bold text-danger'
                                }`}
                              >
                                {comparison.draft}
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="ko shrink-0 text-[13px] font-medium leading-[1.6] text-ink-soft">
                            {comparison.matches
                              ? '제한 조건이 초안에 있음'
                              : '제한 조건이 초안에 없음'}
                          </span>
                        )}
                        <span
                          className={`shrink-0 text-[13px] font-semibold leading-[1.5] ${
                            comparison.matches ? 'text-ok' : 'text-danger'
                          }`}
                        >
                          {comparison.matches ? '같음' : '다름'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ko mt-[8px] text-[14px] leading-[1.65] text-ink-soft">
                    이 구절에서 맞춰볼 숫자·조건이 없습니다.
                  </p>
                )}
                {productFacts?.source && (
                  <p className="ko mt-[10px] text-[12px] leading-[1.5] text-muted">
                    정본 출처: {productFacts.source}
                  </p>
                )}
              </section>

              {/* 발송 문안 + CTA — 우측, 승인 직전 전체 확인 */}
              <section className="mt-[22px] border-t border-line pt-[20px] pb-[8px]">
                <div className="flex items-baseline gap-[12px]">
                  <h3 className="type-subtitle text-[16px] leading-[1.35] text-ink">
                    {dispatched ? '봉인된 발송문' : '발송 문안'}
                  </h3>
                  <span className="text-[13px] leading-[1.6] text-muted">
                    {dispatched ? (
                      '읽기 전용'
                    ) : view.approval?.valid ? (
                      <>
                        승인 완료 · 봉인{' '}
                        <span className="font-mono">{view.approval.versionId}</span>
                      </>
                    ) : (
                      '승인 대기'
                    )}
                  </span>
                </div>
                <div className="ko mt-[12px] whitespace-pre-line rounded-[6px] border border-line bg-card px-[14px] py-[12px] text-[14px] leading-[1.7] text-ink">
                  {dispatched
                    ? (view.approvedContent ?? view.currentContent)
                    : view.currentContent}
                </div>

                <div className="mt-[20px] flex items-stretch gap-[10px]">
                  {dispatched ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/done/${view.caseId}`)}
                      className="type-subtitle flex h-[52px] flex-1 items-center justify-center rounded-[6px] bg-kb text-[16px] text-ink transition-colors duration-[120ms] hover:bg-kb-dark"
                    >
                      발행 완료 화면 보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="approve"
                      disabled={!view.canApprove || busy}
                      onClick={approveAndDispatch}
                      className="type-subtitle flex h-[52px] flex-1 items-center justify-center gap-[10px] rounded-[6px] bg-kb text-[16px] text-ink transition-colors duration-[120ms] hover:bg-kb-dark disabled:cursor-not-allowed disabled:bg-kb/45 disabled:text-ink/55"
                    >
                      {sending && <Spinner />}
                      {sending ? '발송 중' : '승인하고 발송'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => router.push('/')}
                    className="h-[52px] w-[120px] rounded-[6px] text-[15px] font-semibold text-ink-soft underline-offset-4 transition-colors duration-[120ms] hover:bg-head hover:text-ink disabled:cursor-not-allowed disabled:text-muted"
                  >
                    보류
                  </button>
                </div>

                {blockLabel && (
                  <p className="ko mt-[10px] text-[13px] font-medium leading-[1.6] text-muted">
                    {blockLabel}
                  </p>
                )}
              </section>
            </div>
          </aside>
        </div>
      </Shell>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {blockModalOpen && (
        <SealedBlockModal
          caseId={view.caseId}
          sealedAt={view.approval?.sealedAt ?? null}
          contentDigest={view.approval?.contentDigest ?? null}
          onClose={() => setBlockModalOpen(false)}
        />
      )}
    </main>
  );
}

function CoherenceCard({
  reason,
  result,
  detail,
}: {
  reason: string;
  result: 'pass' | 'mismatch';
  detail: string;
}) {
  const pass = result === 'pass';
  return (
    <div
      className={`animate-panel flex min-h-[48px] items-start rounded-[8px] border border-l-[4px] px-[14px] py-[11px] ${
        pass
          ? 'border-ok/30 border-l-ok bg-ok-bg'
          : 'border-danger/25 border-l-danger bg-danger-bg'
      }`}
    >
      <span
        className={`mr-[10px] shrink-0 text-[15px] font-bold leading-[1.4] ${
          pass ? 'text-ok' : 'text-danger'
        }`}
      >
        {pass ? '✓' : '!'}
      </span>
      <span className="ko min-w-0">
        <span className="type-subtitle block text-[14px] leading-[1.4] text-ink">
          {pass ? `적합 · ${reason}` : `불일치 · ${reason} · 사유 재선택`}
        </span>
        <span className="mt-[4px] block text-[13px] leading-[1.65] text-ink-soft">
          {detail}
          {!pass && ' 이 사유로는 승인할 수 없습니다.'}
        </span>
      </span>
    </div>
  );
}

function VerdictButton({
  label,
  testId,
  active,
  disabled,
  locked,
  onClick,
}: {
  label: string;
  testId: string;
  active: boolean;
  disabled: boolean;
  /** 발행 완료 케이스에서 잠긴 상태. 실제 disabled 는 아니다 — 눌러야 차단 모달이 뜬다. */
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      // aria-disabled 를 붙이면 보조기술이 "못 누른다"고 읽는데 실제로는 눌러야
      // 차단 사유가 뜬다. 잠긴 사실은 이름으로 알리고 버튼은 살려 둔다.
      aria-label={locked ? `${label} — 이미 발행된 등기, 눌러서 사유 보기` : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-[30px] shrink-0 items-center justify-center gap-[4px] rounded-[6px] border text-[13px] font-semibold leading-[1.4] transition-colors duration-100 disabled:cursor-not-allowed disabled:border-line disabled:bg-paper disabled:text-ink-soft ${
        locked ? 'w-[68px] px-[6px]' : 'w-[52px]'
      } ${
        locked
          ? 'border-line bg-paper text-ink-soft'
          : active
            ? 'border-ink bg-ink font-bold text-white'
            : 'border-line bg-card text-ink shadow-[inset_0_0_0_1px_rgba(38,40,44,0.04)] hover:border-ink/35 hover:bg-paper'
      }`}
    >
      {locked && <LockIcon className="h-[10px] w-[10px] shrink-0" />}
      {label}
    </button>
  );
}

/** 승인 버튼이 잠긴 이유를 한 줄로. 일반 규칙 문장은 두지 않고 구체 상태만 말한다 (멘토 [4]②). */
function approveBlockLabel(view: CaseView, pending: boolean): string | null {
  if (pending) return '판정을 기록하는 중입니다…';
  if (view.canApprove) return null;
  if (view.undecidedCount > 0) return `미판정 ${view.undecidedCount}건 남음`;
  const blocker = view.approvalBlockers[0];
  return blocker ? `승인 불가 · ${blocker}` : null;
}

/**
 * 낙관적 갱신: 토글을 누른 즉시 그 구절의 판정만 화면에 반영한다.
 * canApprove 는 항상 false 로 눌러 둔다 — 승인 가능 판정은 서버에서만 온다.
 */
function optimisticVerdict(
  view: CaseView,
  idx: number,
  verdict: 'kept' | 'edited',
  newText?: string,
): CaseView {
  const sentences = view.sentences.map((sentence) =>
    sentence.idx === idx
      ? {
          ...sentence,
          verdict,
          currentText:
            verdict === 'kept' ? sentence.originalText : (newText ?? sentence.currentText),
          reason: verdict === 'kept' ? null : sentence.reason,
          coherence: null,
        }
      : sentence,
  );
  return withCounts({ ...view, sentences });
}

function optimisticReason(view: CaseView, idx: number, reason: Reason): CaseView {
  const sentences = view.sentences.map((sentence) =>
    sentence.idx === idx ? { ...sentence, reason, coherence: null } : sentence,
  );
  return { ...view, sentences, canApprove: false };
}

function withCounts(view: CaseView): CaseView {
  const detected = view.sentences.filter((sentence) => sentence.signal !== null);
  return {
    ...view,
    detectedCount: detected.length,
    keptCount: detected.filter((sentence) => sentence.verdict === 'kept').length,
    editedCount: detected.filter((sentence) => sentence.verdict === 'edited').length,
    undecidedCount: detected.filter((sentence) => sentence.verdict === 'undecided').length,
    currentContent: view.sentences.map((sentence) => sentence.currentText).join('\n'),
    canApprove: false,
  };
}

/** chrome 바 우측의 검토 경과 시간. 화면을 연 시점부터 센다. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return <span className="tabular font-mono">{`${mm}:${ss}`}</span>;
}

function firstActionable(view: CaseView): number {
  const undecided = view.sentences.find(
    (sentence) => sentence.signal !== null && sentence.verdict === 'undecided',
  );
  if (undecided) return undecided.idx;
  const detected = view.sentences.find((sentence) => sentence.signal !== null);
  return detected?.idx ?? 0;
}
