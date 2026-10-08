// Next adds basePath to <Link> and _next assets, but NOT to plain <img>, <video>,
// <source>, poster or srcset URLs. Every public file URL must go through asset().
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
