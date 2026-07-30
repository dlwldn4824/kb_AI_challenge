import type { NextConfig } from 'next';

/**
 * 정적 데모 모드(GitHub Pages)는 빌드 타임 플래그로만 갈린다.
 * 서버 모드(SQLite + API 라우트)는 아무것도 바뀌지 않는다.
 */
const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === '1';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  // better-sqlite3 는 네이티브 모듈이라 번들링 대상에서 제외한다.
  serverExternalPackages: ['better-sqlite3'],
  // 시연·스크린샷 화면을 가리지 않도록 dev 표시기를 끈다.
  devIndicators: false,

  ...(STATIC_DEMO
    ? {
        output: 'export' as const,
        basePath: BASE_PATH,
        assetPrefix: BASE_PATH || undefined,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
