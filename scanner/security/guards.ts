import { resolve, sep } from 'node:path';

export interface UrlGuardOptions {
  /**
   * Allow loopback/private/link-local targets. Defaults to true because the
   * primary use case is scanning local dev servers (http://localhost:5173).
   * Set to false for hardened/remote deployments to block SSRF into internal hosts.
   */
  allowPrivateNetwork?: boolean;
  /** When non-empty, only these hostnames are allowed (hard allowlist). */
  allowedHosts?: string[];
}

const CLOUD_METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', 'metadata']);

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isLoopback(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    /^127\./.test(host)
  );
}

function isPrivateOrLinkLocal(host: string): boolean {
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // IPv4 link-local
  if (/^fe80:/i.test(host)) return true; // IPv6 link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true; // IPv6 unique local
  return false;
}

/**
 * Throw when the target URL is not allowed. Always blocks non-http(s) schemes
 * and cloud metadata endpoints; blocks internal networks only when private
 * access is disabled.
 */
export function assertUrlAllowed(rawUrl: string, options: UrlGuardOptions = {}): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`URL 无法解析: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL 必须以 http:// 或 https:// 开头');
  }

  const host = stripIpv6Brackets(parsed.hostname).toLowerCase();

  if (CLOUD_METADATA_HOSTS.has(host)) {
    throw new Error(`出于安全考虑，禁止扫描云元数据地址: ${host}`);
  }

  const allowedHosts = options.allowedHosts ?? [];
  if (allowedHosts.length > 0 && !allowedHosts.map((value) => value.toLowerCase()).includes(host)) {
    throw new Error(`URL 主机不在允许列表内: ${host}`);
  }

  const allowPrivateNetwork = options.allowPrivateNetwork ?? true;
  if (!allowPrivateNetwork && (isLoopback(host) || isPrivateOrLinkLocal(host))) {
    throw new Error(`出于安全考虑，禁止扫描内网/本地地址: ${host}`);
  }
}

/**
 * Resolve and validate that a path stays within one of the allowed roots.
 * Empty roots means "trusted mode" (e.g. local CLI) and any path is allowed.
 */
export function assertPathWithinRoots(targetPath: string, roots: string[] | undefined, label: string): string {
  const resolved = resolve(targetPath);
  if (!roots || roots.length === 0) return resolved;

  const allowed = roots.some((root) => {
    const resolvedRoot = resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + sep);
  });

  if (!allowed) {
    throw new Error(`${label}不在允许的目录范围内: ${resolved}`);
  }

  return resolved;
}
