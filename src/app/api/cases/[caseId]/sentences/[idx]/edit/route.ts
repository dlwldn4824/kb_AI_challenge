import { CaseNotFoundError, CaseSealedError, editSentence } from '@/lib/actions';
import { badRequest, notFound, ok, parseIndex, readJson, sealed } from '@/lib/http';
import { toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[caseId]/sentences/[idx]/edit — body { newText } → sentence_edited.
 * 승인 이후 호출되면 approval_invalidated 가 뒤따른다 (불변조건 2).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string; idx: string }> },
) {
  const { caseId, idx } = await context.params;
  const sentenceIdx = parseIndex(idx);
  if (sentenceIdx === null) return badRequest('invalid_sentence_index', idx);

  const body = await readJson(request);
  const newText = body.newText;
  if (typeof newText !== 'string' || newText.trim().length === 0) {
    return badRequest('newText_required');
  }

  try {
    return ok(toCaseView(editSentence(caseId, sentenceIdx, newText)));
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    if (error instanceof CaseSealedError) return sealed(caseId, error.dispatchedAt);
    if (error instanceof RangeError) return badRequest('sentence_not_found', idx);
    throw error;
  }
}
