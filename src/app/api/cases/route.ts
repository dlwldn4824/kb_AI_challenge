import { ok } from '@/lib/http';
import { buildQueue } from '@/lib/views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/cases — 큐(R 내림차순) + 저위험 표본 + KPI (스펙 §3). */
export function GET() {
  return ok(buildQueue());
}
