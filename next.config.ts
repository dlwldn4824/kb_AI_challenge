import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 는 네이티브 모듈이라 번들링 대상에서 제외한다.
  serverExternalPackages: ['better-sqlite3'],
  // 시연·스크린샷 화면을 가리지 않도록 dev 표시기를 끈다.
  devIndicators: false,
};

export default nextConfig;
