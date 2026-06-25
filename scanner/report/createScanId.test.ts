// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createScanId } from './createScanId.js';

describe('createScanId', () => {
  it('creates a filesystem-safe scan id with page name', () => {
    const id = createScanId(new Date('2026-06-23T10:30:45.000Z'), '首页 体检');

    expect(id).toBe('2026-06-23T10-30-45-000Z-shou-ye-ti-jian');
  });

  it('uses scan when page name is omitted', () => {
    const id = createScanId(new Date('2026-06-23T10:30:45.000Z'));

    expect(id).toBe('2026-06-23T10-30-45-000Z-scan');
  });
});
