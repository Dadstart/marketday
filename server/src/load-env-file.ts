import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

export function loadEnvFile(): void {
  const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
  const localEnv = resolve(process.cwd(), '.env');

  if (existsSync(rootEnv)) {
    config({ path: rootEnv });
  }
  if (existsSync(localEnv) && localEnv !== rootEnv) {
    config({ path: localEnv, override: true });
  }
}
