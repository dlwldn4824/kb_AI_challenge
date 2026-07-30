import { notFound } from 'next/navigation';
import { Chrome } from '../../chrome';
import { CustomerPane } from './customer-pane';
import { SectionHead, Shell } from '../../ui';
import { DISPLAY, STATS } from '@/fixtures/stats';
import { PRIMARY_CASE_ID } from '@/lib/constants';
import { hhmm } from '@/lib/clock';
import { shortDigest } from '@/lib/digest';
import { buildRegistryView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCK_MESSAGE: Record<string, string> = {
  no_valid_approval: '유효한 승인이 없습니다. 발송이 차단되었습니다.',
  digest_mismatch: '발송문이 승인문과 다릅니다. 발송이 차단되었습니다.',
  seal_invalid: '봉인이 훼손되었습니다. 발송이 차단되었습니다.',
};

/**
 * 발행 완료 화면 (스펙 §4.3) + 409 차단 배너 (스펙 §4.4).
 *
 * 결론(일치/불일치)을 증거(승인문·발송문) 위에 둔다 (멘토 [14]).
 * 해시 두 개는 장식이 아니라 이벤트에 기록된 실제 sha256 이고,
 * 두 줄이 세로로 붙어 있어 육안으로도 대조된다.
 */
export default async function DonePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const view = buildRegistryView(caseId);
  if (!view) notFound();

  const approvedDigest = view.approval?.contentDigest ?? null;
  const dispatchedDigest = view.dispatched?.contentDigest ?? null;
  const delivered = view.dispatched !== null && view.status !== '차단';
  const matched = delivered && approvedDigest !== null && dispatchedDigest === approvedDigest;
  const blocked = view.status === '차단' ? view.blocked : null;
  const answerParagraphs = (view.approvedContent ?? view.finalSentences.join('\n')).split('\n');

  return (
    <main className="stage-scroll flex flex-col bg-page">
      <Chrome
        screen="발행 완료"
        meta={[
          <span key="id" className="font-mono">
            {view.caseId}
          </span>,
          view.approval ? (view.approval.sealValid ? '봉인 유효' : '봉인 무효') : '봉인 없음',
          <span key="ts">
            현재 시각 <span className="tabular font-mono">{DISPLAY.chromeTimestamp}</span>
          </span>,
        ]}
      />

      {blocked && (
        <section className="shrink-0 bg-danger">
          <div className="mx-auto w-full max-w-[1720px] px-10 py-[12px]">
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

      <Shell className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-stretch pt-[20px]">
          {/* ── 좌: 문장 대조 ───────────────────────────────────────── */}
          <section className="min-w-0 flex-1 pr-[24px]">
            <div className="border-b border-line pb-[12px]">
              <SectionHead title="문장 대조" note="발송 직후 자동 실행" />
            </div>

            {/* 결론 먼저 (멘토 [14]) */}
            <div
              className={`animate-verdict mt-[16px] flex min-h-[52px] items-center rounded-[6px] border-l-[3px] px-[18px] py-[12px] ${
                matched ? 'border-ok bg-ok-bg' : 'border-danger bg-danger-bg'
              }`}
            >
              <span
                className={`mr-[14px] shrink-0 text-[15px] font-bold ${matched ? 'text-ok' : 'text-danger'}`}
              >
                {matched ? '✓' : '!'}
              </span>
              <span className="text-[15px] font-bold leading-[1.3] text-ink">
                {matched ? '일치' : blocked ? '불일치 · 발송 차단' : '발송 전'}
              </span>
              <span className="ko ml-[20px] text-[13px] leading-[1.6] text-muted">
                {matched
                  ? '승인문과 발송문의 해시가 동일합니다. 승인 이후 문장이 바뀌지 않았습니다.'
                  : blocked
                    ? '승인문과 발송문의 해시가 다릅니다. 고객에게 나가지 않았습니다.'
                    : '아직 발송되지 않았습니다. 검토 화면에서 승인하면 대조가 실행됩니다.'}
              </span>
              <span
                className={`tabular ml-auto pl-[16px] font-mono text-[13px] ${matched ? 'text-ok' : 'text-danger'}`}
              >
                {view.comparisonElapsed}
              </span>
            </div>

            <ContentBlock
              title="승인문"
              note="상담원이 승인한 문장"
              body={view.approvedContent}
              digest={approvedDigest}
            />

            {delivered ? (
              <ContentBlock
                title="실제 발송문"
                note="고객이 수신한 문장"
                body={view.approvedContent}
                digest={dispatchedDigest}
              />
            ) : (
              <BlockedAttempt
                approved={view.approvedContent ?? ''}
                attempted={blocked?.attemptedContent ?? null}
                digest={blocked?.actualDigest ?? null}
              />
            )}

            <h3 className="mt-[28px] text-[14px] font-bold leading-[1.4] text-ink">봉인 정보</h3>
            <div className="mt-[12px] grid grid-cols-2 gap-x-[20px] gap-y-[16px]">
              <SealField
                label="봉인 시각"
                value={view.approval ? `${tsLabel(view.approval.sealedAt)} KST` : '—'}
                mono
              />
              <SealField
                label="승인자"
                value={view.approver ? `${view.approver} / ${view.team}` : '—'}
              />
              <SealField label="수정 사유" value={view.approval?.reasonLabel ?? '—'} />
              <SealField
                label="적합성 검사"
                value={
                  view.edits.length === 0
                    ? '수정 없음'
                    : view.edits.every((edit) => edit.coherenceResult === 'pass')
                      ? '적합 · 통과'
                      : '불일치'
                }
              />
            </div>
            <p className="ko mt-[16px] text-[13px] leading-[1.6] text-muted">
              봉인 대상 = 승인문 + 수정 사유 + 승인자 + 모델 버전
              <span className="px-[8px] text-faint">·</span>
              HMAC{' '}
              <span className="font-mono">
                {view.approval ? shortDigest(view.approval.seal) : '—'}
              </span>
            </p>

            <div className="mt-[20px] border-t border-line pt-[16px]">
              <h3 className="text-[14px] font-bold leading-[1.4] text-ink">오늘 발행 결과</h3>
              <div className="mt-[12px] grid grid-cols-4">
                <TodayStat label="발행" value={STATS.draftsToday.toLocaleString()} />
                <TodayStat label="사람 개입" value={String(STATS.interventionNeeded)} divided />
                <TodayStat label="무작위 표본" value={String(STATS.randomSamples)} divided />
                <TodayStat
                  label="발송 차단"
                  value={String(STATS.blockedToday)}
                  divided
                  accent
                />
              </div>
            </div>
          </section>

          {/* ── 우: 고객 수신 화면 ──────────────────────────────────── */}
          <aside className="w-[720px] shrink-0 self-stretch border-l border-line pl-[24px]">
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
              model={view.model}
              modelVersion={view.modelVersion}
              r={view.r}
              verdictSummary={view.verdictSummary}
              reviewDuration={view.reviewDuration ?? '—'}
              lookups={view.lookups}
            />
          </aside>
        </div>
      </Shell>
    </main>
  );
}

/** 본문 박스는 테두리 없이 좌측 2px 헤어라인으로만 면을 표시한다 (멘토 [14]). */
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
        <span className="text-[14px] font-bold leading-[1.4] text-ink">{title}</span>
        <span className="text-[13px] leading-[1.6] text-muted">{note}</span>
      </div>
      <div className="ko mt-[8px] whitespace-pre-line border-l-[2px] border-line bg-paper px-[16px] py-[12px] text-[14px] leading-[1.7] text-ink">
        {body ?? <span className="text-muted">{empty ?? '—'}</span>}
      </div>
      <p className="tabular mt-[8px] font-mono text-[13px] leading-[1.6] text-muted">
        <span className="pr-[12px]">sha256</span>
        {digest ? shortDigest(digest) : '—'}
      </p>
    </div>
  );
}

/**
 * 차단된 발송 시도문 (P0-2).
 *
 * 승인문과 어떤 토큰이 달랐는지가 이 화면의 핵심 증거다.
 * 공백 단위로 쪼개 LCS 로 맞춰 보고, 승인문에 없던 토큰만 붉게 표시한다.
 */
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
        <span className="text-[14px] font-bold leading-[1.4] text-ink">차단된 발송 시도문</span>
        <span className="text-[13px] leading-[1.6] text-muted">
          승인문과 다른 부분이 붉게 표시됩니다
        </span>
      </div>
      <div className="ko mt-[8px] whitespace-pre-line border-l-[2px] border-danger bg-danger-bg px-[16px] py-[12px] text-[14px] leading-[1.7] text-ink">
        {parts === null ? (
          <span className="text-muted">
            이 시도의 문안은 기록되어 있지 않습니다. 해시 대조 결과만 남아 있습니다.
          </span>
        ) : (
          parts.map((part, index) =>
            part.changed ? (
              <span key={index} className="rounded-[4px] bg-danger/15 font-bold text-danger">
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )
        )}
      </div>
      <p className="tabular mt-[8px] font-mono text-[13px] leading-[1.6] text-muted">
        <span className="pr-[12px]">sha256</span>
        {digest ? shortDigest(digest) : '—'}
      </p>
      <p className="ko mt-[6px] text-[13px] leading-[1.6] text-muted">
        이 문장은 고객에게 전달되지 않았습니다.
      </p>
    </div>
  );
}

/** 공백 토큰 기준 최소 diff. 승인문에 정렬되지 않는 시도문 토큰을 changed 로 표시한다. */
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

function TodayStat({
  label,
  value,
  divided,
  accent,
}: {
  label: string;
  value: string;
  divided?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={divided ? 'border-l border-line-soft pl-[20px]' : ''}>
      <p className="text-[13px] leading-[1.35] text-muted">{label}</p>
      <p
        className={`tabular mt-[8px] text-[28px] font-bold leading-[1.05] tracking-[-0.02em] ${
          accent ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SealField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[13px] leading-[1.35] text-muted">{label}</p>
      <p
        className={`ko mt-[6px] text-[14px] font-bold leading-[1.4] text-ink ${
          mono ? 'tabular font-mono' : 'tabular'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** ISO8601(KST) → `YYYY-MM-DD HH:MM:SS` */
function tsLabel(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/** ISO8601(KST) → `오후 12:54` (고객 앱 목업 표시용) */
function ampmLabel(iso: string): string {
  const hour = Number(iso.slice(11, 13));
  const minute = iso.slice(14, 16);
  const meridiem = hour >= 12 ? '오후' : '오전';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${meridiem} ${display}:${minute}`;
}
