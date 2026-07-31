import { CaseNotFoundError, CaseSealedError, keepSentence } from '@/lib/actions';
import { badRequest, notFound, ok, parseIndex, sealed } from '@/lib/http';
import { toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[caseId]/sentences/[idx]/keep — sentence_kept 기록.
 * 유효 승인이 있는 상태에서 호출되면 서버가 곧바로 approval_invalidated 를 덧붙인다.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ caseId: string; idx: string }> },
) {
  const { caseId, idx } = await context.params;
  const sentenceIdx = parseIndex(idx);
  if (sentenceIdx === null) return badRequest('invalid_sentence_index', idx);

  try {
    return ok(toCaseView(keepSentence(caseId, sentenceIdx)));
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    if (error instanceof CaseSealedError) return sealed(caseId, error.dispatchedAt);
    if (error instanceof RangeError) return badRequest('sentence_not_found', idx);
    throw error;
  }
}
