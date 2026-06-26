// @vitest-environment node
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { findAvailablePort } from './portAllocator.js';

describe('findAvailablePort', () => {
  it('returns another port when the preferred port is occupied', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to bind test server');
    }

    const port = await findAvailablePort(address.port);
    expect(port).not.toBe(address.port);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
