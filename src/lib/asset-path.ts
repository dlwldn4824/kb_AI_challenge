/**
 * public/ 에셋 경로.
 *
 * 정적 데모를 서브패스에서 열 때는 `<img src="/brand/...">` 같은 절대 경로가 깨진다.
 * 기본값은 빈 문자열이라 로컬(`npx serve out`)에서 바로 열리고, 서브패스가 필요하면
 * 빌드 시 NEXT_PUBLIC_BASE_PATH 로 넘긴다. basePath 는 빌드 타임에 인라인된다.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
