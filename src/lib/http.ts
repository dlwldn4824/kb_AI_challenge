/**
 * 라우트 핸들러 공통 응답 헬퍼.
 */

import { NextResponse } from 'next/server';

export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 200 });
}

export function notFound(caseId: string): NextResponse {
  return NextResponse.json({ error: 'case_not_found', caseId }, { status: 404 });
}

export function badRequest(error: string, detail?: unknown): NextResponse {
  return NextResponse.json({ error, detail }, { status: 400 });
}

export function unprocessable(error: string, detail: unknown): NextResponse {
  return NextResponse.json({ error, ...(detail as object) }, { status: 422 });
}

export function conflict(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status: 409 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseIndex(raw: string): number | null {
  const idx = Number.parseInt(raw, 10);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}
