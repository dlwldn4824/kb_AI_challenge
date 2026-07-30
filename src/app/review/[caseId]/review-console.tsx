'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chrome } from '../../chrome';
import { SIGNAL_NOTE, SectionHead, Shell, SignalText, Spinner, TierChip, Toast } from '../../ui';
import { REASONS, type Reason } from '@/lib/constants';
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
          ? post(`/api/cases/${initial.caseId}/review-start`).then((result) => {
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

      const fresh = await getCase(view.caseId);
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
      () => post(`/api/cases/${view.caseId}/sentences/${idx}/keep`),
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
    setView(optimisticVerdict(view, idx, 'edited', newText));
    await mutate(
      `${idx + 1}번 구절 수정 문안`,
      () => post(`/api/cases/${view.caseId}/sentences/${idx}/edit`, { newText }),
      (fresh) => fresh.sentences.find((item) => item.idx === idx)?.currentText === newText,
      idx,
    );
  }

  async function pickReason(reason: Reason) {
    if (!current) return;
    const idx = current.idx;
    // 같은 사유가 이미 검사까지 끝나 있으면 다시 보내지 않는다.
    if (current.reason === reason && current.coherence) return;
    if (!claim(-idx - 1, `reason:${reason}`)) return;

    setView(optimisticReason(view, idx, reason));
    await mutate(
      '수정 사유',
      () => post(`/api/cases/${view.caseId}/sentences/${idx}/reason`, { reason }),
      (fresh) => {
        const sentence = fresh.sentences.find((item) => item.idx === idx);
        return sentence?.reason === reason && sentence.coherence !== null;
      },
      -idx - 1,
    );
  }

  /** 승인 → 승인문 그대로 발송. 앞선 판정이 모두 기록된 뒤에 실행된다. */
  async function approveAndDispatch() {
    if (busy || !view.canApprove) return;
    setSending(true);

    await enqueue(async () => {
      const approve = await post(`/api/cases/${view.caseId}/approve`);
      if (approve.status !== 200) {
        const body = approve.data as { blockers?: string[]; case?: CaseView };
        if (body.case) setView(body.case);
        setToast(`승인 조건이 아직 충족되지 않았습니다 — ${(body.blockers ?? []).join(' · ')}`);
        setSending(false);
        return;
      }

      const approved = approve.data as CaseView;
      setView(approved);

      const dispatch = await post('/api/dispatch', {
        caseId: view.caseId,
        content: approved.approvedContent ?? '',
        via: 'ui',
      });

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

  const editedNow = current?.verdict === 'edited';
  const coherence = current?.coherence ?? null;
  const dispatched = view.status === '발행 완료';
  const blockLabel = dispatched
    ? '이미 발행된 등기입니다. 발송문은 승인문으로 고정되어 있습니다.'
    : approveBlockLabel(view, pending);

  return (
    <main className="stage-scroll flex flex-col bg-page">
      <Chrome
        screen="검토"
        meta={[
          <span key="id" className="font-mono">
            {view.caseId}
          </span>,
          <span key="r" className="tabular font-mono">
            R {view.r}
          </span>,
          view.product,
          <Elapsed key="elapsed" />,
        ]}
      />

      <Shell className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-stretch pt-[20px]">
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
                    }`}
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
                            tone="soft"
                            disabled={busy}
                            onClick={() => keep(sentence.idx)}
                          />
                          <VerdictButton
                            label="수정"
                            testId={`edit-${sentence.idx}`}
                            active={sentence.verdict === 'edited'}
                            tone="strong"
                            disabled={busy}
                            onClick={() => startEditing(sentence.idx)}
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

            <h3 className="mt-[20px] text-[14px] font-bold leading-[1.4] text-ink">수정 문안</h3>
            {current && current.verdict === 'edited' ? (
              <div className="mt-[8px]">
                <div className="flex min-h-[40px] items-center rounded-[6px] bg-paper px-[16px] py-[9px]">
                  <span className="w-[18px] shrink-0 text-[13px] text-muted">−</span>
                  <span className="ko text-[13px] leading-[1.6] text-muted line-through">
                    {current.originalText}
                  </span>
                </div>
                <div className="mt-[6px] flex min-h-[56px] items-center rounded-[6px] border-l-[4px] border-kb bg-kb-tint px-[16px] py-[11px]">
                  <span className="w-[18px] shrink-0 text-[13px] font-bold text-ink">+</span>
                  <span className="ko text-[14px] font-semibold leading-[1.7] text-ink">
                    {current.currentText}
                  </span>
                </div>
              </div>
            ) : (
              <p className="ko mt-[8px] flex min-h-[40px] items-center text-[13px] leading-[1.6] text-muted">
                수정하면 여기에 원문과 수정문이 대조됩니다.
              </p>
            )}

            <div className="mt-[20px] flex items-baseline gap-[12px]">
              <h3 className="text-[14px] font-bold leading-[1.4] text-ink">발송 문안</h3>
              <span className="text-[13px] leading-[1.6] text-muted">
                {view.approval?.valid ? (
                  <>
                    승인 완료 · 봉인 <span className="font-mono">{view.approval.versionId}</span>
                  </>
                ) : (
                  '승인 대기'
                )}
              </span>
            </div>
            <div className="ko mt-[8px] whitespace-pre-line rounded-[6px] border-l-[2px] border-line bg-paper px-[16px] py-[14px] text-[14px] leading-[1.7] text-ink">
              {view.currentContent}
            </div>
          </section>

          {/* ── 우: 판단하기 ────────────────────────────────────────── */}
          <aside className="w-[560px] shrink-0 self-stretch border-l border-line pl-[24px]">
            <div className="border-b border-line pb-[12px]">
              <SectionHead title="판단하기" />
            </div>

            <div className="pt-[16px]">
              {current?.signal ? (
                <div className="flex min-h-[60px] items-center gap-[14px] rounded-[6px] bg-paper px-[16px] py-[12px]">
                  <span className="flex shrink-0 items-center gap-[10px]">
                    <TierChip tier={current.signal.tier} size="md" />
                    <span className="tabular font-mono text-[13px] leading-[1.6] text-ink">
                      ×{current.signal.score}
                    </span>
                  </span>
                  <span className="ko min-w-0">
                    <span className="block text-[14px] font-bold leading-[1.4] text-ink">
                      {current.signal.label} · {current.signal.evidence}
                    </span>
                    <span className="mt-[4px] block text-[13px] leading-[1.6] text-muted">
                      {SIGNAL_NOTE[current.signal.type]}
                    </span>
                  </span>
                </div>
              ) : (
                <p className="ko flex min-h-[60px] items-center text-[13px] leading-[1.6] text-muted">
                  이 구절에서는 위험 신호가 발화하지 않았습니다. 판정 대상이 아닙니다.
                </p>
              )}

              <h3 className="mt-[20px] text-[14px] font-bold leading-[1.4] text-ink">
                수정 사유 설명
              </h3>
              <div className="mt-[12px] grid grid-cols-2 gap-[8px]">
                {REASONS.map((reason) => {
                  const active = current?.reason === reason && editedNow;
                  return (
                    <button
                      key={reason}
                      type="button"
                      data-testid={`reason-${REASONS.indexOf(reason)}`}
                      aria-pressed={active}
                      disabled={!editedNow || busy}
                      onClick={() => pickReason(reason)}
                      className={`ko h-[38px] rounded-[6px] border text-[13px] leading-[1.6] transition-colors duration-[120ms] ${
                        active
                          ? 'border-ink bg-ink font-bold text-white'
                          : editedNow
                            ? 'border-line bg-card text-ink hover:bg-paper'
                            : 'cursor-not-allowed border-transparent bg-paper text-faint'
                      }`}
                    >
                      {reason}
                    </button>
                  );
                })}
              </div>

              <h3 className="mt-[20px] text-[14px] font-bold leading-[1.4] text-ink">
                사유 ↔ 실제 수정 적합성 검사
              </h3>
              <div className="mt-[12px]">
                {coherence && current?.reason ? (
                  <div
                    key={`${current.reason}-${coherence.result}`}
                    className={`animate-panel flex min-h-[56px] items-center rounded-[6px] border-l-[4px] px-[16px] py-[12px] ${
                      coherence.result === 'pass'
                        ? 'border-ok bg-ok-bg'
                        : 'border-danger bg-danger-bg'
                    }`}
                  >
                    <span
                      className={`mr-[14px] shrink-0 text-[15px] font-bold ${
                        coherence.result === 'pass' ? 'text-ok' : 'text-danger'
                      }`}
                    >
                      {coherence.result === 'pass' ? '✓' : '!'}
                    </span>
                    <span className="ko min-w-0">
                      <span className="block text-[14px] font-bold leading-[1.4] text-ink">
                        {current.reason}
                      </span>
                      <span className="mt-[3px] block text-[13px] leading-[1.6] text-muted">
                        {coherence.detail}
                      </span>
                    </span>
                    <span
                      className={`ko ml-auto shrink-0 pl-[14px] text-[13px] font-bold ${
                        coherence.result === 'pass' ? 'text-ok' : 'text-danger'
                      }`}
                    >
                      {coherence.result === 'pass' ? '적합' : '불일치 · 사유 재선택'}
                    </span>
                  </div>
                ) : (
                  <p className="ko flex min-h-[56px] items-center text-[13px] leading-[1.6] text-muted">
                    수정한 구절에만 적용됩니다. 유지 판정에는 사유가 필요하지 않습니다.
                  </p>
                )}
              </div>

              <div className="mt-[28px] flex gap-[12px]">
                {dispatched ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/done/${view.caseId}`)}
                    className="h-[48px] flex-1 rounded-[6px] border border-line bg-card text-[15px] font-bold text-ink transition-colors duration-[120ms] hover:bg-paper"
                  >
                    발행 완료 화면 보기
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="approve"
                    disabled={!view.canApprove || busy}
                    onClick={approveAndDispatch}
                    className="flex h-[48px] flex-1 items-center justify-center gap-[10px] rounded-[6px] bg-kb text-[15px] font-bold text-ink transition-colors duration-[120ms] hover:bg-kb-dark disabled:cursor-not-allowed disabled:bg-head disabled:text-faint"
                  >
                    {sending && <Spinner />}
                    {sending ? '발송 중' : '승인하고 발송'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => router.push('/')}
                  className="h-[48px] w-[140px] rounded-[6px] border border-line bg-card text-[15px] text-ink transition-colors duration-[120ms] hover:bg-paper disabled:cursor-not-allowed disabled:text-faint"
                >
                  보류
                </button>
              </div>

              {blockLabel && (
                <p className="ko mt-[12px] text-center text-[13px] leading-[1.6] text-muted">
                  {blockLabel}
                </p>
              )}
            </div>
          </aside>
        </div>
      </Shell>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </main>
  );
}

function VerdictButton({
  label,
  testId,
  active,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  testId: string;
  active: boolean;
  tone: 'soft' | 'strong';
  disabled: boolean;
  onClick: () => void;
}) {
  // 옐로는 화면당 CTA 하나뿐이라(멘토 [7]) 선택 상태는 그레이/잉크 필로 구분한다.
  const activeClass =
    tone === 'strong' ? 'border-ink bg-ink font-bold text-white' : 'border-line bg-head font-bold text-ink';

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`h-[26px] w-[48px] rounded-[6px] border text-[12px] leading-[1.5] transition-colors duration-100 ${
        active ? activeClass : 'border-line bg-card text-muted hover:bg-paper'
      }`}
    >
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

/** 응답을 못 받았을 때 서버의 현재 상태를 다시 읽는다. */
async function getCase(caseId: string): Promise<CaseView | null> {
  try {
    const response = await fetch(`/api/cases/${caseId}`);
    if (!response.ok) return null;
    return (await response.json()) as CaseView;
  } catch {
    return null;
  }
}

async function post(path: string, body?: unknown) {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch {
    return { status: 0, data: {} };
  }
}
