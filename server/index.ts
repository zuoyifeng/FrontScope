import { serve } from '@hono/node-server';
import app from './api.js';

const port = 3001;
// Bind to loopback only so the local API is not reachable from other machines.
const hostname = process.env.FRONTSCOPE_API_HOST ?? '127.0.0.1';

console.log(`FrontScope API server is running on http://${hostname}:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname,
});
