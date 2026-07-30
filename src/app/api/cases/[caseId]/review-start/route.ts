import { CaseNotFoundError, startReview } from '@/lib/actions';
import { notFound, ok } from '@/lib/http';
import { toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/cases/[caseId]/review-start — review_started 기록. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await context.params;
  try {
    return ok(toCaseView(startReview(caseId)));
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    throw error;
  }
}
