export type TargetUrlMismatchReason =
  | 'redirected-to-login'
  | 'different-origin'
  | 'different-path'
  | 'unknown';

export interface TargetUrlEvidence {
  requestedUrl: string;
  finalUrl: string;
  matched: boolean;
  mismatchReason?: TargetUrlMismatchReason;
}

const LOGIN_PATTERN = /login|signin|sso|auth/i;

function hashRoutePath(hash: string): string {
  if (!hash.startsWith('#/') && !hash.startsWith('#!')) return '';
  const queryStart = hash.indexOf('?');
  return queryStart === -1 ? hash : hash.slice(0, queryStart);
}

function routeKey(parsed: URL): string {
  return `${parsed.origin}${parsed.pathname}${hashRoutePath(parsed.hash)}`;
}

function isLoginRoute(parsed: URL): boolean {
  const hashPath = hashRoutePath(parsed.hash);
  return LOGIN_PATTERN.test(parsed.pathname) || (hashPath !== '' && LOGIN_PATTERN.test(hashPath));
}

/**
 * Compare the requested scan URL with the browser's final URL after navigation.
 * Returns structured match evidence including a typed mismatch reason when they differ.
 */
export function evaluateTargetUrlMatch(requestedUrl: string, finalUrl: string): TargetUrlEvidence {
  try {
    const target = new URL(requestedUrl);
    const final = new URL(finalUrl);

    if (routeKey(target) === routeKey(final)) {
      return { requestedUrl, finalUrl, matched: true };
    }

    if (target.origin !== final.origin) {
      return { requestedUrl, finalUrl, matched: false, mismatchReason: 'different-origin' };
    }

    if (isLoginRoute(final)) {
      return { requestedUrl, finalUrl, matched: false, mismatchReason: 'redirected-to-login' };
    }

    if (target.pathname !== final.pathname || hashRoutePath(target.hash) !== hashRoutePath(final.hash)) {
      return { requestedUrl, finalUrl, matched: false, mismatchReason: 'different-path' };
    }

    return { requestedUrl, finalUrl, matched: false, mismatchReason: 'unknown' };
  } catch {
    return { requestedUrl, finalUrl, matched: false, mismatchReason: 'unknown' };
  }
}

export const TARGET_MISMATCH_LABELS: Record<TargetUrlMismatchReason, string> = {
  'redirected-to-login': '页面被重定向到登录/认证页，可能缺少登录态或权限不足',
  'different-origin': '最终页面与目标 URL 不同源',
  'different-path': '最终页面路径与目标 URL 不一致',
  unknown: '最终页面与目标 URL 不一致',
};
