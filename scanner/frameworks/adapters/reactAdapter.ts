import ts from 'typescript';
import type { CodeReviewFinding } from '../../types.js';

const INDEX_LIKE_NAMES = new Set(['index', 'i', 'idx', 'index2']);

function scriptKindForFile(fileName: string): ts.ScriptKind {
  const ext = fileName.slice(fileName.lastIndexOf('.'));
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
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

export function reviewReactSource(fileName: string, text: string): CodeReviewFinding[] {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindForFile(fileName));
  const findings: CodeReviewFinding[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const visit = (node: ts.Node): void => {
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
