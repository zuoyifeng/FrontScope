// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reviewReactSource } from './reactAdapter.js';
import { reviewVueSource } from './vueAdapter.js';
import { reviewJavaScriptSource } from './javascriptAdapter.js';

describe('framework review adapters', () => {
  it('keeps React list-key findings under react rule ids', () => {
    const findings = reviewReactSource(
      'List.tsx',
      `export const List = ({ items }) => <>{items.map((item) => <div>{item.name}</div>)}</>;`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('react/missing-key');
  });

  it('finds Vue v-for blocks without a key', () => {
    const findings = reviewVueSource(
      'List.vue',
      `<template><div v-for="item in items">{{ item.name }}</div></template>`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('vue/missing-key');
  });

  it('finds Vue unsafe html rendering', () => {
    const findings = reviewVueSource(
      'Article.vue',
      `<template><article v-html="html"></article></template>`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('vue/dangerous-html');
  });

  it('uses a conservative JavaScript adapter for JSX files', () => {
    const findings = reviewJavaScriptSource(
      'List.jsx',
      `export const List = ({ items }) => <>{items.map((item) => <div>{item.name}</div>)}</>;`,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain('react/missing-key');
  });
});
