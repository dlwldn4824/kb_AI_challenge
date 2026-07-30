import { QueueScreen } from './queue-screen';
import { StaticQueue } from './static-queue';
import { STATIC_DEMO } from '@/lib/api-client';

export const runtime = 'nodejs';
// 서버 모드는 요청마다 이벤트를 다시 재생한다.
// 정적 export 빌드(scripts/build-static.mjs)는 이 한 줄을 'force-static' 으로 바꾼다 —
// segment config 는 리터럴만 허용해서 코드로 분기할 수 없기 때문이다.
export const dynamic = 'force-dynamic';

/**
 * 발행 대기 큐 (스펙 §4.1).
 *
 * 서버 모드: 빌드가 아니라 요청 시점에 SQLite 이벤트를 재생해 그린다.
 * 정적 데모 모드: 브라우저에서 스토어를 재생해 그린다.
 */
export default async function QueuePage() {
  if (STATIC_DEMO) return <StaticQueue />;

  const { buildQueue } = await import('@/lib/views');
  return <QueueScreen data={buildQueue()} />;
}
