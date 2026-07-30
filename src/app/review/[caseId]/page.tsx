import { notFound } from 'next/navigation';
import { ReviewConsole } from './review-console';
import { StaticReview } from './static-review';
import { STATIC_DEMO } from '@/lib/api-client';
import { staticCaseIds } from '@/lib/static-demo/case-ids';

export const runtime = 'nodejs';
// 서버 모드는 요청마다 이벤트를 다시 재생한다.
// 정적 export 빌드(scripts/build-static.mjs)는 이 한 줄을 'force-static' 으로 바꾼다 —
// segment config 는 리터럴만 허용해서 코드로 분기할 수 없기 때문이다.
export const dynamic = 'force-dynamic';

/**
 * 정적 export 에서만 20 케이스를 미리 생성한다.
 * 서버 모드에서는 빈 배열을 돌려 요청 시점 렌더로 남겨 둔다 — 빌드 시점 DB 상태가 굳지 않게.
 */
export function generateStaticParams() {
  return STATIC_DEMO ? staticCaseIds().map((caseId) => ({ caseId })) : [];
}

/** 검토 화면 (스펙 §4.2). 초기 상태만 모드별로 다르게 얻고, 이후 판정은 어댑터가 처리한다. */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  if (STATIC_DEMO) return <StaticReview caseId={caseId} />;

  const { buildCaseView } = await import('@/lib/views');
  const view = buildCaseView(caseId);
  if (!view) notFound();

  return <ReviewConsole initial={view} />;
}
