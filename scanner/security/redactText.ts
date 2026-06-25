import { redactUrl } from './redactUrl.js';

const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

export function redactText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(ABSOLUTE_URL_PATTERN, (url) => redactUrl(url));
}
