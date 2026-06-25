import type { ScanInput } from '../types.js';
import { basename } from 'node:path';
import { redactUrl } from '../security/redactUrl.js';

/** Remove API keys and local secret paths before writing scan.json / report.md. */
export function redactScanInput(input: ScanInput): ScanInput {
  const safeAi = input.ai ? (({ apiKey: _removed, ...rest }) => rest)(input.ai) : undefined;
  return {
    ...input,
    url: redactUrl(input.url),
    authStatePath: input.authStatePath ? basename(input.authStatePath) : undefined,
    ai: safeAi,
  };
}
