import { notFound } from 'next/navigation';
import { DoneScreen } from './done-screen';
import { StaticDone } from './static-done';
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

export default async function DonePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  if (STATIC_DEMO) return <StaticDone caseId={caseId} />;

  const { buildRegistryView } = await import('@/lib/views');
  const view = buildRegistryView(caseId);
  if (!view) notFound();

  return <DoneScreen view={view} />;
}
