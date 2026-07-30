import { notFound } from 'next/navigation';
import { ReviewConsole } from './review-console';
import { buildCaseView } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 검토 화면 (스펙 §4.2). 초기 상태는 서버에서 재생해 내려주고, 이후 판정은 API 로 간다. */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const view = buildCaseView(caseId);
  if (!view) notFound();

  return <ReviewConsole initial={view} />;
}
