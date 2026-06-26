import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetection, FrontendFramework } from './types.js';

function readPackageJson(projectPath: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf8'));
    return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
  } catch {
    return {};
  }
}

function hasFile(projectPath: string, file: string): boolean {
  return existsSync(join(projectPath, file));
}

function pushDetection(
  detections: FrameworkDetection[],
  framework: FrontendFramework,
  signals: string[],
  confidence: FrameworkDetection['confidence'] = 'high',
) {
  if (signals.length > 0) detections.push({ framework, confidence, signals });
}

export function detectFrameworks(projectPath: string): FrameworkDetection[] {
  const deps = readPackageJson(projectPath);
  const detections: FrameworkDetection[] = [];

  pushDetection(detections, 'next', [
    deps.next ? 'dependency:next' : '',
    hasFile(projectPath, 'next.config.js') || hasFile(projectPath, 'next.config.mjs') ? 'config:next' : '',
  ].filter(Boolean));
  pushDetection(detections, 'nuxt', [
    deps.nuxt ? 'dependency:nuxt' : '',
    hasFile(projectPath, 'nuxt.config.ts') || hasFile(projectPath, 'nuxt.config.js') ? 'config:nuxt' : '',
  ].filter(Boolean));
  pushDetection(detections, 'angular', [
    deps['@angular/core'] ? 'dependency:@angular/core' : '',
    hasFile(projectPath, 'angular.json') ? 'config:angular.json' : '',
  ].filter(Boolean));
  pushDetection(detections, 'solid', [deps['solid-js'] ? 'dependency:solid-js' : ''].filter(Boolean));
  pushDetection(detections, 'vue', [deps.vue ? 'dependency:vue' : ''].filter(Boolean));
  pushDetection(detections, 'react', [deps.react ? 'dependency:react' : ''].filter(Boolean));

  if (detections.length === 0) {
    return [{ framework: 'javascript', confidence: 'low', signals: ['fallback:javascript'] }];
  }

  return detections;
}
