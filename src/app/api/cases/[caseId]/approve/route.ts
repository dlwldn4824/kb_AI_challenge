import { approveCase, CaseNotFoundError } from '@/lib/actions';
import { notFound, ok, unprocessable } from '@/lib/http';
import { buildCaseView, toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[caseId]/approve — 검증 통과 시에만 approved(봉인) 기록.
 *
 * 미판정 구절이 남아 있거나 수정 사유가 실제 수정과 어긋나면 422 로 막고
 * approved 이벤트를 남기지 않는다. 시간이 지났다고 자동 승인되는 경로는 없다.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;

  try {
    const result = approveCase(caseId);
    if (!result.ok) {
      return unprocessable('approval_requirements_not_met', {
        blockers: result.blockers,
        case: buildCaseView(caseId),
      });
    }
    return ok(toCaseView(result.state));
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    throw error;
  }
}
