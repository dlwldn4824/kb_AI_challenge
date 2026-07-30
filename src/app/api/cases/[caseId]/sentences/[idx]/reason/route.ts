import { CaseNotFoundError, isReason, selectReason } from '@/lib/actions';
import { REASONS } from '@/lib/constants';
import { badRequest, notFound, ok, parseIndex, readJson } from '@/lib/http';
import { toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[caseId]/sentences/[idx]/reason — body { reason }
 * → reason_selected + 즉시 coherence_checked (스펙 §3).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; idx: string }> },
) {
  const { caseId, idx } = await context.params;
  const sentenceIdx = parseIndex(idx);
  if (sentenceIdx === null) return badRequest('invalid_sentence_index', idx);

  const body = await readJson(request);
  if (!isReason(body.reason)) {
    return badRequest('invalid_reason', { allowed: REASONS });
  }

  try {
    return ok(toCaseView(selectReason(caseId, sentenceIdx, body.reason)));
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    if (error instanceof RangeError) return badRequest('sentence_not_found', idx);
    throw error;
  }
}
