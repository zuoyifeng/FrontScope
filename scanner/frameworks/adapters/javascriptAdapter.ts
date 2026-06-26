import type { CodeReviewFinding } from '../../types.js';
import { reviewReactSource } from './reactAdapter.js';

export function reviewJavaScriptSource(fileName: string, text: string): CodeReviewFinding[] {
  return reviewReactSource(fileName, text).map((finding) => ({
    ...finding,
    message: `${finding.message}（JS 项目缺少类型信息，置信度较低。）`,
  }));
}
