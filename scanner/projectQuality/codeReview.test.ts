// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewSource, scanCodeReview } from './codeReview.js';

describe('reviewSource', () => {
  it('flags list rendering without a key', () => {
    const findings = reviewSource(
      'List.tsx',
      `export const List = ({ items }) => <ul>{items.map((item) => <li>{item.name}</li>)}</ul>;`,
    );

    expect(findings.map((finding) => finding.ruleId)).toContain('react/missing-key');
  });

  it('flags array index used as key', () => {
    const findings = reviewSource(
      'List.tsx',
      `export const List = ({ items }) => <ul>{items.map((item, index) => <li key={index}>{item.name}</li>)}</ul>;`,
    );

    expect(findings.map((finding) => finding.ruleId)).toContain('react/index-as-key');
  });

  it('accepts a stable key without findings', () => {
    const findings = reviewSource(
      'List.tsx',
      `export const List = ({ items }) => <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;`,
    );

    expect(findings).toHaveLength(0);
  });

  it('flags dangerouslySetInnerHTML as high severity', () => {
    const findings = reviewSource(
      'Article.tsx',
      `export const Article = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;`,
    );

    const danger = findings.find((finding) => finding.ruleId === 'react/dangerous-html');
    expect(danger?.severity).toBe('high');
  });
});

describe('scanCodeReview', () => {
  it('scans a project src directory and aggregates findings with relative paths', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-review-'));
    mkdirSync(join(projectPath, 'src'));
    writeFileSync(
      join(projectPath, 'src', 'List.tsx'),
      `export const List = ({ items }) => <ul>{items.map((item, index) => <li key={index}>{item.name}</li>)}</ul>;`,
    );

    const evidence = scanCodeReview(projectPath);

    expect(evidence.status).toBe('issues');
    expect(evidence.scannedFiles).toBe(1);
    expect(evidence.findings[0].file).toBe('src/List.tsx');
    expect(evidence.findings.map((finding) => finding.ruleId)).toContain('react/index-as-key');
  });

  it('reports skipped when no source files exist', () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'frontscope-review-empty-'));
    writeFileSync(join(projectPath, 'README.md'), '# empty');

    const evidence = scanCodeReview(projectPath);

    expect(evidence.status).toBe('skipped');
    expect(evidence.scannedFiles).toBe(0);
  });
});
