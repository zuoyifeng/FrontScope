import { createServer } from 'node:net';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findAvailablePort(preferred = 5173): Promise<number> {
  if (await isPortAvailable(preferred)) {
    return preferred;
  }

  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate port')));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
