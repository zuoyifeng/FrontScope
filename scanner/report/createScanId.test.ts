// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createScanId, formatScanTimestamp } from './createScanId.js';

describe('createScanId', () => {
  it('formats timestamp as YYYY-MM-DD_HH-mm-ss in local time', () => {
    expect(formatScanTimestamp(new Date(2026, 5, 23, 18, 30, 45))).toBe('2026-06-23_18-30-45');
  });

  it('creates a filesystem-safe scan id with page name', () => {
    const id = createScanId(new Date(2026, 5, 23, 18, 30, 45), '首页 体检');

    expect(id).toBe('2026-06-23_18-30-45-shou-ye-ti-jian');
  });

  it('uses scan when page name is omitted', () => {
    const id = createScanId(new Date(2026, 5, 23, 18, 30, 45));

    expect(id).toBe('2026-06-23_18-30-45-scan');
  });
});
