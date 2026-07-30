import { notFound, ok } from '@/lib/http';
import { buildRegistryView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/registry/[caseId] — 등기 조회 (스펙 §3, 불변조건 4).
 * 등기번호 하나만 있으면 원문·수정·사유·승인자·봉인을 이벤트 재생으로 복원한다.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const view = buildRegistryView(caseId);
  return view ? ok(view) : notFound(caseId);
}
