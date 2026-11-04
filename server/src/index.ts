import { serve } from '@hono/node-server';

import { app } from './app.js';
import { port } from './env.js';

serve({ fetch: app.fetch, port }, () => {
  console.log(`Community Day API listening on http://localhost:${port}`);
});
