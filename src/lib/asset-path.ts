/**
 * public/ 에셋 경로.
 *
 * GitHub Pages 는 서브패스(/kb_AI_challenge)로 서빙되므로 `<img src="/brand/...">`
 * 같은 절대 경로는 그대로 두면 깨진다. basePath 는 빌드 타임에 인라인된다.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
