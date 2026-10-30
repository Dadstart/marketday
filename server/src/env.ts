import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
const localEnv = resolve(process.cwd(), '.env');

if (existsSync(rootEnv)) {
  config({ path: rootEnv });
}
if (existsSync(localEnv) && localEnv !== rootEnv) {
  config({ path: localEnv, override: true });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env and start the server again.`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export const supabaseUrl = optional('SUPABASE_URL') ?? 'https://fiwpwhgcyhaujunmcdxw.supabase.co';
export const supabaseServiceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
export const sessionSecret = required('SESSION_SECRET');
export const port = Number(process.env.PORT ?? 8787);

export const googleClientIds = [
  optional('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  optional('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  optional('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
].filter((value): value is string => Boolean(value));

export const microsoftClientId = optional('EXPO_PUBLIC_MICROSOFT_CLIENT_ID');
export const stripeTestSecretKey = optional('STRIPE_TEST_SECRET_KEY');

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}
