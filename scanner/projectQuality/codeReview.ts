import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { reviewJavaScriptSource } from '../frameworks/adapters/javascriptAdapter.js';
import { reviewReactSource } from '../frameworks/adapters/reactAdapter.js';
import { reviewVueSource } from '../frameworks/adapters/vueAdapter.js';
import type { CodeReviewEvidence, CodeReviewFinding } from '../types.js';

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.git',
  '.next',
  '.nuxt',
  '.cache',
  '.output',
  '.vite',
  'public',
  'vendor',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue']);
const DEFAULT_MAX_FILES = 400;
const DEFAULT_MAX_FINDINGS = 50;

function isExcludedFile(name: string): boolean {
  return (
    name.endsWith('.d.ts') ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) ||
    /\.config\.[cm]?[jt]s$/.test(name)
  );
}

export function collectSourceFiles(root: string, maxFiles = DEFAULT_MAX_FILES): string[] {
  const start = existsSync(join(root, 'src')) ? join(root, 'src') : root;
  const files: string[] = [];

  const walk = (dir: string): void => {
    if (files.length >= maxFiles) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const fullPath = join(dir, entry);

      let isDir: boolean;
      try {
        isDir = statSync(fullPath).isDirectory();
      } catch {
        continue;
      }

      if (isDir) {
        if (SKIP_DIRECTORIES.has(entry) || entry.startsWith('.')) continue;
        walk(fullPath);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(extname(entry)) && !isExcludedFile(entry)) {
        files.push(fullPath);
      }
    }
  };

  walk(start);
  return files;
}

export function reviewSource(fileName: string, text: string): CodeReviewFinding[] {
  if (fileName.endsWith('.vue')) return reviewVueSource(fileName, text);
  if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return reviewJavaScriptSource(fileName, text);
  return reviewReactSource(fileName, text);
}

export interface ScanCodeReviewOptions {
  maxFiles?: number;
  maxFindings?: number;
}

export function scanCodeReview(projectPath: string, options: ScanCodeReviewOptions = {}): CodeReviewEvidence {
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const files = collectSourceFiles(projectPath, options.maxFiles);

  if (files.length === 0) {
    return {
      status: 'skipped',
      scannedFiles: 0,
      findings: [],
      skippedReason: '未发现可审查的前端源码文件（.ts/.tsx/.js/.jsx/.vue）。',
    };
  }

  const findings: CodeReviewFinding[] = [];
  for (const file of files) {
    if (findings.length >= maxFindings) break;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const finding of reviewSource(file, text)) {
      findings.push({ ...finding, file: relative(projectPath, file) });
      if (findings.length >= maxFindings) break;
    }
  }

  return {
    status: findings.length > 0 ? 'issues' : 'ok',
    scannedFiles: files.length,
    findings,
  };
}
