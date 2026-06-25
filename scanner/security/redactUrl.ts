export function redactUrl(rawUrl: string): string {
  try {
    new URL(rawUrl);
  } catch {
    return '<invalid-url>';
  }

  const [withoutHash, hash] = rawUrl.split('#', 2);
  const [baseUrl, query = ''] = withoutHash.split('?', 2);
  const safeBaseUrl = redactCredentials(baseUrl);

  if (query) {
    const redactedQuery = [...new URLSearchParams(query).keys()].map((key) => `${key}=<redacted>`).join('&');
    return `${safeBaseUrl}?${redactedQuery}${hash !== undefined ? '#<redacted>' : ''}`;
  }

  if (hash !== undefined) {
    return `${safeBaseUrl}#<redacted>`;
  }

  return safeBaseUrl;
}

function redactCredentials(baseUrl: string): string {
  const protocolSeparator = '://';
  const protocolEnd = baseUrl.indexOf(protocolSeparator);
  if (protocolEnd === -1) return baseUrl;

  const authorityStart = protocolEnd + protocolSeparator.length;
  const pathStart = baseUrl.indexOf('/', authorityStart);
  const authorityEnd = pathStart === -1 ? baseUrl.length : pathStart;
  const authority = baseUrl.slice(authorityStart, authorityEnd);
  const atIndex = authority.lastIndexOf('@');

  if (atIndex === -1) return baseUrl;

  return `${baseUrl.slice(0, authorityStart)}<credentials>@${authority.slice(atIndex + 1)}${baseUrl.slice(authorityEnd)}`;
}
