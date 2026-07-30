import { CaseNotFoundError, dispatchContent } from '@/lib/actions';
import { badRequest, conflict, notFound, ok, readJson } from '@/lib/http';
import { toCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOCK_MESSAGE: Record<string, string> = {
  no_valid_approval: '유효한 승인이 없습니다. 발송이 차단되었습니다.',
  digest_mismatch: '발송문이 승인문과 다릅니다. 발송이 차단되었습니다.',
  seal_invalid: '봉인이 훼손되었습니다. 발송이 차단되었습니다.',
};

/**
 * POST /api/dispatch — body { caseId, content } (스펙 §2.4).
 *
 * UI 의 "승인하고 발송"도, 터미널의 curl 도 이 경로 하나만 지난다.
 * 승인문과 다른 문안은 어느 쪽에서 들어와도 409 로 차단된다.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  const caseId = body.caseId;
  const content = body.content;
  const via = body.via === 'ui' ? 'ui' : 'api';

  if (typeof caseId !== 'string' || caseId.length === 0) return badRequest('caseId_required');
  if (typeof content !== 'string') return badRequest('content_required');

  try {
    const result = dispatchContent(caseId, content, via);

    if (!result.ok) {
      return conflict({
        error: 'dispatch_blocked',
        reason: result.reason,
        message: `409 DISPATCH BLOCKED — ${BLOCK_MESSAGE[result.reason]}`,
        expectedDigest: result.expectedDigest,
        actualDigest: result.actualDigest,
        case: toCaseView(result.state),
      });
    }

    return ok({
      dispatched: true,
      caseId,
      contentDigest: result.contentDigest,
      versionId: result.versionId,
      dispatchedAt: result.dispatchedAt,
      case: toCaseView(result.state),
    });
  } catch (error) {
    if (error instanceof CaseNotFoundError) return notFound(caseId);
    throw error;
  }
}
