import { describe, expect, it } from 'vitest';
import { initialModules } from './sampleData';

describe('initialModules', () => {
  it('marks implemented evidence modules as ready', () => {
    expect(initialModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'runtime', status: 'ready' }),
        expect.objectContaining({ key: 'performance', status: 'ready' }),
        expect.objectContaining({ key: 'network', status: 'ready' }),
        expect.objectContaining({ key: 'package', status: 'ready' }),
      ]),
    );
  });
});
