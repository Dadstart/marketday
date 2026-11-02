import { serve } from '@hono/node-server';

import { app } from './app.js';
import { port } from './env.js';

serve({ fetch: app.fetch, port }, () => {
  console.log(`Market Day API listening on http://localhost:${port}`);
});
