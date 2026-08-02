import { Chrome } from '../../chrome';
import { CustomerPane } from './customer-pane';
import { TimelineAction } from './timeline-action';
import { Shell } from '../../ui';
import { DISPLAY, STATS } from '@/fixtures/stats';
import { PRIMARY_CASE_ID } from '@/lib/constants';
import { hhmm } from '@/lib/clock';
import { shortDigest } from '@/lib/digest-core';
import type { RegistryView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCK_MESSAGE: Record<string, string> = {
  no_valid_approval: '유효한 승인이 없습니다. 발송이 차단되었습니다.',
  digest_mismatch: '발송문이 승인문과 다릅니다. 발송이 차단되었습니다.',
  seal_invalid: '봉인이 훼손되었습니다. 발송이 차단되었습니다.',
};

/**
 * 발행 완료 화면 (스펙 §4.3) + 409 차단 배너 (스펙 §4.4).
 */
export function DoneScreen({ view }: { view: RegistryView }) {
  const approvedDigest = view.approval?.contentDigest ?? null;
  const dispatchedDigest = view.dispatched?.contentDigest ?? null;
  const delivered = view.dispatched !== null && view.status !== '차단';
  const matched = delivered && approvedDigest !== null && dispatchedDigest === approvedDigest;
  const blocked = view.status === '차단' ? view.blocked : null;
  const answerParagraphs = (view.approvedContent ?? view.finalSentences.join('\n'))
    .split('\n')
    .filter((line) => line.trim().length > 0);
  const editCount = view.edits.length;
  const coherenceOk =
    editCount === 0 || view.edits.every((edit) => edit.coherenceResult === 'pass');
  const coherenceLabel = editCount === 0 ? '수정 없음' : coherenceOk ? '적합 · 통과' : '불일치';
  const reasonLabel = view.approval?.reasonLabel ?? '—';

  return (
    <main className="stage-scroll flex flex-col bg-page">
      <Chrome
        screen="발행 완료"
        meta={[
          <span key="id" className="font-mono">
            {view.caseId}
          </span>,
          sealLabel(view.approval?.sealValid ?? null, blocked !== null),
          <span key="ts">
            현재 시각 <span className="tabular font-mono">{DISPLAY.chromeTimestamp}</span>
          </span>,
        ]}
      />

      {blocked && (
        <section className="shrink-0 bg-danger">
          <div className="mx-auto w-full max-w-[1520px] px-8 py-[12px]">
            <p className="ko text-[15px] font-bold leading-[1.3] text-white">
              409 DISPATCH BLOCKED — {BLOCK_MESSAGE[blocked.reason]}
            </p>
            <p className="tabular mt-[6px] font-mono text-[13px] leading-[1.6] text-white/85">
              기대 sha256 {blocked.expectedDigest ? shortDigest(blocked.expectedDigest) : '—'}
              <span className="px-[10px] text-white/45">·</span>
              실제 sha256 {blocked.actualDigest ? shortDigest(blocked.actualDigest) : '—'}
              <span className="px-[10px] text-white/45">·</span>
              dispatch_blocked #{blocked.seq} · {blocked.reason} · {tsLabel(blocked.ts)}
            </p>
          </div>
        </section>
      )}

      <Shell className="flex flex-col">
        <div className="flex min-h-0 flex-1 items-start gap-0 pt-[24px] pb-[32px]">
          {/* ── 좌 ─────────────────────────────────────────────────── */}
          <section className="min-w-0 flex-1 pr-[32px]">
            {/* 건 요약 + 등기 확인 버튼 */}
            <div className="flex items-start justify-between gap-[20px]">
              <div className="min-w-0 flex-1">
                <header>
                  <p className="text-[12px] font-medium tracking-[0.02em] text-muted">발행 등기</p>
                  <h1 className="mt-[6px] font-mono text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
                    {view.caseId}
                  </h1>
                  {view.product && (
                    <p className="type-subtitle mt-[12px] text-[18px] leading-[1.35] text-ink">
                      {view.product}
                    </p>
                  )}
                  {view.inquiry && (
                    <p className="ko mt-[6px] max-w-[38rem] text-[15px] leading-[1.6] text-ink-soft">
                      {view.inquiry}
                    </p>
                  )}
                </header>

                {delivered && (
                  <div
                    className={`mt-[20px] flex items-center gap-[10px] border-l-[3px] pl-[14px] ${
                      matched ? 'border-ok' : 'border-danger'
                    }`}
                  >
                    <span
                      className={`text-[16px] font-bold leading-[1.3] ${
                        matched ? 'text-ok' : 'text-danger'
                      }`}
                    >
                      {matched ? '승인문 = 발송문' : blocked ? '불일치 · 발송 차단' : '미발송'}
                    </span>
                    <span className="tabular text-[13px] text-muted">
                      {formatComparisonElapsed(view.comparisonElapsed)}
                    </span>
                  </div>
                )}
              </div>

              <TimelineAction caseId={view.caseId} delivered={delivered} />
            </div>

            {/* 문장 대조 — 1순위 본문 */}
            <div className="mt-[28px]">
              <h2 className="type-subtitle text-[18px] leading-[1.3] text-ink">문장 대조</h2>
              <p className="ko mt-[4px] text-[13px] text-muted">고객에게 나간 최종 문안</p>

              {delivered ? (
                <ol className="mt-[18px] list-none space-y-[16px]">
                  {view.sentences.map((sentence) => {
                    const edited = sentence.verdict === 'edited';
                    return (
                      <li key={sentence.idx} className="flex gap-[14px]">
                        <span className="tabular mt-[3px] w-[20px] shrink-0 text-[13px] font-bold text-kb-star">
                          {sentence.idx + 1}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
                          {edited && (
                            <span className="inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-[4px] bg-kb-tint px-[8px] text-[12px] font-semibold text-ink">
                              수정
                              {sentence.reason ? (
                                <span className="font-medium text-muted">· {sentence.reason}</span>
                              ) : null}
                            </span>
                          )}
                          <p
                            className={`ko min-w-0 flex-1 text-[16px] leading-[1.75] ${
                              edited ? 'font-semibold text-ink' : 'text-ink'
                            }`}
                          >
                            {sentence.finalText}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <>
                  {!matched && blocked && (
                    <p className="ko mt-[14px] text-[15px] font-semibold text-danger">
                      발송 차단 · 승인문과 발송 시도문이 다릅니다
                    </p>
                  )}
                  {!blocked && (
                    <p className="ko mt-[14px] text-[15px] text-muted">아직 발송되지 않았습니다.</p>
                  )}
                  <ContentBlock
                    title="승인문"
                    note="상담원이 승인한 문장"
                    body={view.approvedContent}
                    digest={approvedDigest}
                  />
                  <BlockedAttempt
                    approved={view.approvedContent ?? ''}
                    attempted={blocked?.attemptedContent ?? null}
                    digest={blocked?.actualDigest ?? null}
                  />
                </>
              )}
            </div>

            {/* 판단·봉인 — 수정·사유·적합이 먼저, 나머지는 보조 */}
            <div className="mt-[28px] border-t border-line pt-[18px]">
              <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[8px]">
                <p className="ko text-[18px] font-bold leading-[1.35] text-ink">
                  {editCount > 0
                    ? `${view.sentences.length}개 구절 중 ${editCount}개 수정`
                    : `${view.sentences.length}개 구절 · 수정 없음`}
                </p>
                {editCount > 0 && (
                  <p className="ko text-[16px] font-semibold leading-[1.35] text-ink">
                    {reasonLabel}
                  </p>
                )}
                <p
                  className={`ko text-[16px] font-bold leading-[1.35] ${
                    editCount === 0 ? 'text-muted' : coherenceOk ? 'text-ok' : 'text-danger'
                  }`}
                >
                  {coherenceLabel}
                </p>
              </div>

              <p className="ko mt-[10px] text-[13px] leading-[1.6] text-muted">
                개입 필요도{' '}
                <span className="tabular font-semibold text-ink-soft">{view.r}</span>
                <span className="px-[8px] text-faint">·</span>
                검토{' '}
                <span className="tabular font-semibold text-ink-soft">
                  {view.reviewDuration ?? '—'}
                </span>
                {view.approver && (
                  <>
                    <span className="px-[8px] text-faint">·</span>
                    {view.approver}
                    {view.team ? ` / ${view.team}` : ''}
                  </>
                )}
                {view.approval && (
                  <>
                    <span className="px-[8px] text-faint">·</span>
                    <span className="tabular">{tsLabel(view.approval.sealedAt)}</span>
                  </>
                )}
              </p>

              {delivered && (
                <p className="tabular mt-[12px] font-mono text-[11px] leading-[1.7] text-faint">
                  승인 {approvedDigest ? shortDigest(approvedDigest) : '—'}
                  <span className="px-[6px]">·</span>
                  발송 {dispatchedDigest ? shortDigest(dispatchedDigest) : '—'}
                  <span className="px-[6px]">·</span>
                  HMAC {view.approval ? shortDigest(view.approval.seal) : '—'}
                </p>
              )}
              <p className="ko mt-[4px] text-[12px] leading-[1.6] text-faint">
                {view.model} / {view.modelVersion}
                <span className="px-[8px]">·</span>
                조회 {view.lookups}회
                <span className="px-[8px]">·</span>
                오늘 초안 {STATS.draftsToday.toLocaleString()}
                <span className="px-[6px]">·</span>
                개입 {STATS.interventionNeeded}
                <span className="px-[6px]">·</span>
                표본 {STATS.randomSamples}
                <span className="px-[6px]">·</span>
                차단{' '}
                <span className={STATS.blockedToday > 0 ? 'text-danger' : undefined}>
                  {STATS.blockedToday}
                </span>
              </p>
            </div>
          </section>

          {/* ── 우: 폰만 ──────────────────────────────────────────── */}
          <aside className="w-[360px] shrink-0 self-start border-l border-line pl-[24px]">
            <div className="border-b border-line pb-[12px]">
              <h2 className="type-subtitle text-[17px] leading-[1.35] text-ink">고객 수신 화면</h2>
              <p className="ko mt-[4px] text-[13px] leading-[1.5] text-muted">KB 상담 채널</p>
            </div>
            <div className="mt-[16px]">
              <CustomerPane
                caseId={view.caseId}
                question={view.caseId === PRIMARY_CASE_ID ? view.customerQuestion : view.inquiry}
                questionAt={ampmLabel(view.receivedAt)}
                answerAt={ampmLabel(
                  view.dispatched?.dispatchedAt ?? view.approval?.sealedAt ?? view.receivedAt,
                )}
                answerParagraphs={answerParagraphs}
                delivered={delivered}
                statusTime={hhmm(
                  view.dispatched?.dispatchedAt ??
                    blocked?.ts ??
                    view.approval?.sealedAt ??
                    view.receivedAt,
                )}
              />
            </div>
          </aside>
        </div>
      </Shell>
    </main>
  );
}

function ContentBlock({
  title,
  note,
  body,
  digest,
  empty,
}: {
  title: string;
  note: string;
  body: string | null;
  digest: string | null;
  empty?: string;
}) {
  return (
    <div className="mt-[20px]">
      <div className="flex items-baseline gap-[12px]">
        <span className="text-[15px] font-bold leading-[1.4] text-ink">{title}</span>
        <span className="text-[13px] leading-[1.6] text-muted">{note}</span>
      </div>
      <div className="ko mt-[10px] whitespace-pre-line border-l-[2px] border-line pl-[16px] text-[15px] leading-[1.75] text-ink">
        {body ?? <span className="text-muted">{empty ?? '—'}</span>}
      </div>
      <p className="tabular mt-[8px] font-mono text-[12px] leading-[1.6] text-muted">
        sha256 {digest ? shortDigest(digest) : '—'}
      </p>
    </div>
  );
}

function BlockedAttempt({
  approved,
  attempted,
  digest,
}: {
  approved: string;
  attempted: string | null;
  digest: string | null;
}) {
  const parts = attempted === null ? null : diffTokens(approved, attempted);

  return (
    <div className="mt-[20px]">
      <div className="flex items-baseline gap-[12px]">
        <span className="text-[15px] font-bold leading-[1.4] text-ink">차단된 발송 시도문</span>
        <span className="text-[13px] leading-[1.6] text-muted">다른 부분이 붉게 표시됩니다</span>
      </div>
      <div className="ko mt-[10px] whitespace-pre-line border-l-[2px] border-danger pl-[16px] text-[15px] leading-[1.75] text-ink">
        {parts === null ? (
          <span className="text-muted">시도 문안 기록이 없습니다. 해시만 남아 있습니다.</span>
        ) : (
          parts.map((part, index) =>
            part.changed ? (
              <span key={index} className="font-bold text-danger">
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )
        )}
      </div>
      <p className="tabular mt-[8px] font-mono text-[12px] leading-[1.6] text-muted">
        sha256 {digest ? shortDigest(digest) : '—'}
      </p>
      <p className="ko mt-[6px] text-[13px] leading-[1.6] text-muted">
        이 문장은 고객에게 전달되지 않았습니다.
      </p>
    </div>
  );
}

function diffTokens(approved: string, attempted: string) {
  const a = approved.split(/(\s+)/);
  const b = attempted.split(/(\s+)/);
  const rows = a.length;
  const cols = b.length;

  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: Array<{ text: string; changed: boolean }> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      out.push({ text: b[j], changed: false });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      out.push({ text: b[j], changed: true });
      j += 1;
    }
  }
  while (j < cols) {
    out.push({ text: b[j], changed: true });
    j += 1;
  }
  return out;
}

/** `00:00.4` → `대조 0.4초` — 해시 대조에 걸린 시간. */
function formatComparisonElapsed(raw: string): string {
  const match = /^(\d{2}):(\d{2})(?:\.(\d))?$/.exec(raw);
  if (!match) return `대조 ${raw}`;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const tenth = match[3] ? Number(match[3]) / 10 : 0;
  const total = minutes * 60 + seconds + tenth;
  const label = Number.isInteger(total) ? String(total) : total.toFixed(1);
  return `대조 ${label}초`;
}

function sealLabel(sealValid: boolean | null, blocked: boolean): string {
  if (sealValid === null) return '봉인 없음';
  const seal = sealValid ? '봉인 유효' : '봉인 무효';
  return blocked ? `${seal} · 발송 차단` : seal;
}

function tsLabel(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function ampmLabel(iso: string): string {
  const hour = Number(iso.slice(11, 13));
  const minute = iso.slice(14, 16);
  const meridiem = hour >= 12 ? '오후' : '오전';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${meridiem} ${display}:${minute}`;
}
