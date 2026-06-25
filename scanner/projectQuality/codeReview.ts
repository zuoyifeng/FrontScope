import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';
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

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const INDEX_LIKE_NAMES = new Set(['index', 'i', 'idx', 'index2']);
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

function scriptKindForFile(fileName: string): ts.ScriptKind {
  const ext = extname(fileName);
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  // Parse .jsx and .js leniently as JSX so React files are understood.
  return ts.ScriptKind.JSX;
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isJsxRoot(node: ts.Node): node is ts.JsxElement | ts.JsxSelfClosingElement {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
}

function getOpeningAttributes(element: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttributes {
  return ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes;
}

function findKeyAttribute(element: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttribute | undefined {
  return getOpeningAttributes(element).properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === 'key',
  );
}

function returnedJsxFromCallback(
  callback: ts.ArrowFunction | ts.FunctionExpression,
): ts.JsxElement | ts.JsxSelfClosingElement | undefined {
  const body = callback.body;

  if (!ts.isBlock(body)) {
    const expression = unwrapParentheses(body);
    return isJsxRoot(expression) ? expression : undefined;
  }

  let found: ts.JsxElement | ts.JsxSelfClosingElement | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    // Do not cross into nested functions; their returns belong to them.
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      const expression = unwrapParentheses(node.expression);
      if (isJsxRoot(expression)) {
        found = expression;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}

function indexParamName(callback: ts.ArrowFunction | ts.FunctionExpression): string | undefined {
  const second = callback.parameters[1];
  return second && ts.isIdentifier(second.name) ? second.name.text : undefined;
}

function keyUsesArrayIndex(keyAttribute: ts.JsxAttribute, indexName: string | undefined): boolean {
  const initializer = keyAttribute.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return false;

  const expression = initializer.expression;
  if (ts.isNumericLiteral(expression)) return true;
  if (ts.isIdentifier(expression)) {
    return expression.text === indexName || INDEX_LIKE_NAMES.has(expression.text);
  }
  return false;
}

/**
 * Run AST-based local code review rules on a single source file.
 * Rules are intentionally high-signal / low-false-positive.
 */
export function reviewSource(fileName: string, text: string): CodeReviewFinding[] {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindForFile(fileName));
  const findings: CodeReviewFinding[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node: ts.Node): void => {
    // Rule: dangerouslySetInnerHTML (XSS risk).
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dangerouslySetInnerHTML'
    ) {
      findings.push({
        ruleId: 'react/dangerous-html',
        severity: 'high',
        file: fileName,
        line: lineOf(node),
        message: '使用 dangerouslySetInnerHTML 存在 XSS 风险，需确认内容已严格转义或来自可信来源。',
      });
    }

    // Rules: list rendering keys.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map' &&
      node.arguments.length > 0
    ) {
      const callback = node.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const root = returnedJsxFromCallback(callback);
        if (root) {
          const keyAttribute = findKeyAttribute(root);
          if (!keyAttribute) {
            findings.push({
              ruleId: 'react/missing-key',
              severity: 'medium',
              file: fileName,
              line: lineOf(root),
              message: '列表渲染缺少稳定的 key，可能导致渲染错乱和不必要的重渲染。',
            });
          } else if (keyUsesArrayIndex(keyAttribute, indexParamName(callback))) {
            findings.push({
              ruleId: 'react/index-as-key',
              severity: 'medium',
              file: fileName,
              line: lineOf(keyAttribute),
              message: '使用数组下标作为 key，列表项增删或排序时会引发状态错位，建议改用稳定唯一标识。',
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
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
      skippedReason: '未发现可审查的前端源码文件（.ts/.tsx/.js/.jsx）。',
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
