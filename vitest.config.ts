import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 각 테스트 파일이 자기 DB 파일을 쓰므로 파일 단위 병렬은 안전하지만,
    // 이벤트 로그 순서 검증을 단순하게 유지하기 위해 단일 스레드로 실행한다.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
  },
});
