import { notFound, ok } from '@/lib/http';
import { buildCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/cases/[caseId] — 구절·신호·판정 현황·이벤트 (replay 결과). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  const view = buildCaseView(caseId);
  return view ? ok(view) : notFound(caseId);
}
